/**
 * AuroraField — an interactive aurora-through-a-lattice background.
 *
 * Framework-independent. Mount it on any <canvas>:
 *
 *   import { AuroraField } from './aurora.js';
 *   const field = new AuroraField(canvas, { gridSpacing: 28 });
 *   field.start();
 *
 * Model per particle (see README for the maths):
 *   position = home + auroraDisplacement + rippleDisplacement   (spring-smoothed)
 *   radius   = base + auroraI * radiusRange + rippleI * rippleRadiusBoost
 *   opacity  = base + auroraI * opacityRange + rippleI * rippleOpacityBoost
 *
 * Two layers are drawn:
 *   1. the "light" layer — the same field rendered as a blurred, additive glow
 *      (one pixel per lattice cell, upscaled + blurred by the GPU). Controlled by
 *      `auroraGlow`. On its own this looks like a real aurora curtain.
 *   2. the dot lattice, faded with `dotOpacity` (0 hides the dots entirely).
 */

import { SimplexNoise } from '../../shared/noise/simplex.js';
import { RipplePool, PointerRippler } from '../../shared/physics/ripples.js';
import { PALETTES, buildLut, hexToRgb, luminance } from '../../shared/rendering/palettes.js';
import { observeResize } from '../../shared/rendering/resize.js';

export const DEFAULTS = Object.freeze({
  // Lattice
  gridSpacing: 28,          // px between particle homes
  baseRadius: 1.2,          // px
  maxRadius: 3.5,           // px
  baseOpacity: 0.2,
  maxOpacity: 0.9,
  displacement: 6,          // px, aurora displacement amplitude

  // Aurora
  auroraIntensity: 1.0,     // brightness / colour strength multiplier
  auroraSpeed: 1.0,         // ambient flow speed multiplier
  auroraScale: 420,         // px, characteristic band width

  // Ripples
  rippleStrength: 1.0,      // multiplier on pointer / click impulses
  rippleSpeed: 380,         // px/s, outward wave-front speed
  rippleDamping: 1.1,       // 1/s, temporal energy loss
  rippleWavelength: 110,    // px
  ripplePulseWidth: 55,     // px, Gaussian width of the travelling pulse
  maxRippleDisplacement: 14,// px, soft clamp for overlapping waves
  maxRipples: 24,

  // Glow
  glowIntensity: 0.6,       // halo sprites around bright dots
  auroraGlow: 0.35,         // 0..1.5 brightness of the continuous aurora light layer
  auroraBlur: 26,           // px, softness of the light layer
  dotOpacity: 1,            // 0..1 fade the dot lattice (0 = light layer only)

  // Spring settling (critically damped)
  springStiffness: 140,

  // Runtime
  opacity: 1,               // overall canvas opacity (for text readability)
  maxParticles: 6000,       // density cap; spacing grows past this
  mobileSpacingFactor: 1.35,
  seed: 1337,
  respectReducedMotion: true,
});

const LUT_SIZE = 64;
const GLOW_SPRITES = 16;
const GLOW_SPRITE_PX = 64;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Pre-render soft radial glow sprites, one per colour bucket of the LUT. */
function buildGlowSprites(lut) {
  const sprites = [];
  for (let s = 0; s < GLOW_SPRITES; s++) {
    const li = Math.round((s / (GLOW_SPRITES - 1)) * (LUT_SIZE - 1)) * 3;
    const r = lut[li], g = lut[li + 1], b = lut[li + 2];
    const c = document.createElement('canvas');
    c.width = c.height = GLOW_SPRITE_PX;
    const g2 = c.getContext('2d');
    const half = GLOW_SPRITE_PX / 2;
    const grad = g2.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(0.25, `rgba(${r},${g},${b},0.22)`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},0.05)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    g2.fillStyle = grad;
    g2.fillRect(0, 0, GLOW_SPRITE_PX, GLOW_SPRITE_PX);
    sprites.push(c);
  }
  return sprites;
}

export class AuroraField {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Partial<typeof DEFAULTS> & { palette?: object }} [options]
   */
  constructor(canvas, options = {}) {
    const { palette, ...cfg } = options;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.config = { ...DEFAULTS, ...cfg };
    this.noise = new SimplexNoise(this.config.seed);

    this.width = 0; this.height = 0; this.dpr = 1; this.count = 0;

    // Particle storage — typed arrays, allocated on resize only.
    this.homeX = new Float32Array(0); this.homeY = new Float32Array(0);
    this.posX = new Float32Array(0);  this.posY = new Float32Array(0);
    this.velX = new Float32Array(0);  this.velY = new Float32Array(0);
    this.rippleDX = new Float32Array(0); this.rippleDY = new Float32Array(0);
    this.rippleI = new Float32Array(0);

    this.ripples = new RipplePool(this.config.maxRipples);
    this.pointer = new PointerRippler(canvas, (x, y, s) => this.addRipple(x, y, s));

    // Light layer: a sibling canvas behind the dots, one pixel per lattice cell,
    // scaled and blurred by CSS so the aurora reads as continuous light.
    this.light = document.createElement('canvas');
    this.light.className = 'aurora-light';
    this.light.setAttribute('aria-hidden', 'true');
    Object.assign(this.light.style, {
      position: 'absolute', pointerEvents: 'none', display: 'block',
    });
    (canvas.parentElement || document.body).insertBefore(this.light, canvas);
    this.lctx = this.light.getContext('2d');
    this.lightImage = null;
    canvas.style.position = canvas.style.position || 'relative';

    this.time = 0;   // ambient seconds (scaled by auroraSpeed)
    this.clock = 0;  // unscaled seconds, drives ripples
    this.lastFrame = 0;
    this.running = false; this.paused = false; this.rafId = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsFrames = 0;

    this.reducedMotion =
      this.config.respectReducedMotion &&
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pointer.enabled = !this.reducedMotion;

    this._onFrame = this._onFrame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);

    this.setPalette(palette || PALETTES[0]);

    this.resize();
    // Later size reports are debounced and ignored unless the host really changed
    // size (mobile toolbars collapsing during scroll must not reset the field).
    this.resizeObserver = observeResize(canvas.parentElement || canvas, () => this.resize(), { skipFirst: true });
    this.applyOpacity();
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    if (this.running) return;
    this.running = true;
    this.pointer.attach();
    document.addEventListener('visibilitychange', this._onVisibility);
    this.lastFrame = performance.now();
    if (this.reducedMotion) this._renderStatic();
    else this.rafId = requestAnimationFrame(this._onFrame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.pointer.detach();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  destroy() {
    this.stop();
    this.resizeObserver.disconnect();
    this.light.remove();
  }

  setPaused(p) {
    this.paused = !!p;
    this.pointer.enabled = !this.paused && !this.reducedMotion;
    if (!this.paused) this.lastFrame = performance.now();
  }

  /** Merge new values into the config and rebuild what depends on them. */
  setConfig(patch) {
    const prev = this.config;
    this.config = { ...prev, ...patch };
    if (patch.gridSpacing !== undefined && patch.gridSpacing !== prev.gridSpacing) this.resize();
    if (patch.opacity !== undefined || patch.auroraBlur !== undefined) this.applyOpacity();
    if (patch.seed !== undefined && patch.seed !== prev.seed) this.noise = new SimplexNoise(patch.seed);
    if (patch.rippleStrength !== undefined) this.pointer.strengthScale = patch.rippleStrength;
    if (this.reducedMotion) this._renderStatic();
  }

  resetConfig() {
    this.setConfig({ ...DEFAULTS, opacity: this.config.opacity });
  }

  /**
   * Swap the colour palette: { bg, stops: [hex...] }.
   * Rebuilds the LUT, glow sprites and the resting dot colour.
   */
  setPalette(palette) {
    this.palette = palette;
    this.lut = buildLut(palette.stops, LUT_SIZE);
    this.glowSprites = buildGlowSprites(this.lut);
    // Resting dots: the first stop pulled towards a neutral grey so the lattice
    // reads as structure, not colour. Lighter on dark backgrounds, darker on light.
    const base = hexToRgb(palette.stops[0]);
    const dark = luminance(palette.bg) < 0.5;
    const grey = dark ? [150, 160, 185] : [70, 75, 95];
    this.restColour = [0, 1, 2].map((i) => base[i] * 0.45 + grey[i] * 0.55);
    this.restColour = this.restColour.map((v) => (dark ? Math.max(v, 90) : Math.min(v, 120)));
    // Ripple highlight: the brightest-looking stop of the palette.
    const li = Math.round(0.4 * (LUT_SIZE - 1)) * 3;
    this.rippleTint = [this.lut[li], this.lut[li + 1], this.lut[li + 2]];
    this.darkBg = dark;
    // Additive light on dark grounds; multiplied tint on light ones.
    this.light.style.mixBlendMode = dark ? 'screen' : 'multiply';
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  applyOpacity() {
    this.canvas.style.opacity = String(this.config.opacity);
    this.light.style.opacity = String(this.config.opacity);
    this.light.style.filter = `blur(${this.config.auroraBlur}px)`;
  }

  statLabel() { return `${this.count} dots`; }

  // ----------------------------------------------------------------- lattice

  resize() {
    const host = this.canvas.parentElement || document.documentElement;
    const w = Math.max(1, host.clientWidth || window.innerWidth);
    const h = Math.max(1, host.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Effective spacing: coarser on small / touch screens, and capped by maxParticles.
    let spacing = this.config.gridSpacing;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (w < 768 || coarse) spacing *= this.config.mobileSpacingFactor;
    const area = (w + spacing * 2) * (h + spacing * 2);
    if (area / (spacing * spacing) > this.config.maxParticles) {
      spacing = Math.sqrt(area / this.config.maxParticles);
    }
    this.spacing = spacing;

    // One extra ring outside the viewport so displacement never reveals an edge.
    const cols = Math.ceil(w / spacing) + 2;
    const rows = Math.ceil(h / spacing) + 2;
    const offX = (w - (cols - 1) * spacing) / 2;
    const offY = (h - (rows - 1) * spacing) / 2;
    const count = cols * rows;

    if (count !== this.count) {
      this.count = count;
      this.homeX = new Float32Array(count); this.homeY = new Float32Array(count);
      this.posX = new Float32Array(count);  this.posY = new Float32Array(count);
      this.velX = new Float32Array(count);  this.velY = new Float32Array(count);
      this.rippleDX = new Float32Array(count); this.rippleDY = new Float32Array(count);
      this.rippleI = new Float32Array(count);
      this._glowIdx = new Int32Array(count);
      this._glowA = new Float32Array(count);
      this._glowR = new Float32Array(count);
      this._glowC = new Uint8Array(count);
    }
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        this.homeX[i] = offX + c * spacing;
        this.homeY[i] = offY + r * spacing;
        this.posX[i] = this.homeX[i];
        this.posY[i] = this.homeY[i];
        this.velX[i] = 0; this.velY[i] = 0;
      }
    }
    this.cols = cols; this.rows = rows;
    this.grid = { cols, rows, spacing, x0: offX, y0: offY };

    // Light canvas: one pixel per cell, positioned so pixel centres sit on dot homes.
    if (this.light.width !== cols || this.light.height !== rows) {
      this.light.width = cols; this.light.height = rows;
      this.lightImage = this.lctx.createImageData(cols, rows);
    }
    Object.assign(this.light.style, {
      left: `${offX - spacing / 2}px`, top: `${offY - spacing / 2}px`,
      width: `${cols * spacing}px`, height: `${rows * spacing}px`,
    });
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  // ----------------------------------------------------------------- ripples

  /** Inject a ripple at (x, y) in canvas CSS pixels with peak displacement `strength` px. */
  addRipple(x, y, strength) {
    if (this.reducedMotion) return;
    this.ripples.add(x, y, strength, this.clock);
  }

  _onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.running && !this.reducedMotion && !this.rafId) {
      this.lastFrame = performance.now();
      this.rafId = requestAnimationFrame(this._onFrame);
    }
  }

  // --------------------------------------------------------------- animation

  _onFrame(now) {
    this.rafId = requestAnimationFrame(this._onFrame);
    // Optional frame cap (set by mount's maxFps): skip vsyncs that come too soon.
    // The 2 ms slack keeps a 60 cap at 60 on displays whose vsync jitters.
    if (this.maxFps > 0 && now - this.lastFrame < 1000 / this.maxFps - 2) return;
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 1 / 20) dt = 1 / 20; // clamp after tab switches / hitches
    if (dt <= 0) return;

    this._fpsAcc += dt; this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0; this._fpsFrames = 0;
    }
    if (this.paused) return;

    this.clock += dt;
    this.time += dt * this.config.auroraSpeed;

    const cfg = this.config;
    this.ripples.accumulate(
      this.grid,
      {
        speed: cfg.rippleSpeed, damping: cfg.rippleDamping, wavelength: cfg.rippleWavelength,
        pulseWidth: cfg.ripplePulseWidth, maxDisplacement: cfg.maxRippleDisplacement,
      },
      this.clock, this.width, this.height,
      this.rippleDX, this.rippleDY, this.rippleI,
    );
    this._render(dt);
  }

  _render(dt) {
    const ctx = this.ctx;
    const cfg = this.config;
    const noise = this.noise;
    const count = this.count;
    const t = this.time;

    const homeX = this.homeX, homeY = this.homeY;
    const posX = this.posX, posY = this.posY;
    const velX = this.velX, velY = this.velY;
    const rDX = this.rippleDX, rDY = this.rippleDY, rI = this.rippleI;
    const lut = this.lut;
    const rest = this.restColour;
    const tint = this.rippleTint;

    const invScale = 1 / cfg.auroraScale;
    const disp = cfg.displacement;
    const dotOpacity = cfg.dotOpacity;
    const drawDots = dotOpacity > 0.002;
    const lightGain = cfg.auroraGlow;
    const drawLight = lightGain > 0.002;
    const lightData = this.lightImage.data;
    const darkBg = this.darkBg;
    const radiusRange = cfg.maxRadius - cfg.baseRadius;
    const opacityRange = cfg.maxOpacity - cfg.baseOpacity;
    const glow = cfg.glowIntensity;

    // Critically damped spring towards the target position.
    const k = cfg.springStiffness;
    const c = 2 * Math.sqrt(k);
    const springDt = Math.min(dt, 1 / 30);

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';

    const glowIdx = this._glowIdx, glowA = this._glowA, glowR = this._glowR, glowC = this._glowC;
    let glowN = 0;

    for (let i = 0; i < count; i++) {
      const hx = homeX[i], hy = homeY[i];
      const u = hx * invScale;
      const v = hy * invScale;

      // --- Aurora field (layered coherent noise) ---------------------------
      // Domain warp: a slow, very low-frequency field bends the band coordinates
      // so the curtains curve instead of running straight.
      const warp = noise.noise3(u * 0.32 + 900, v * 0.32, t * 0.04);
      // Broad curtain: ridged noise turns zero-crossings into bright bands with
      // dark gaps. Sampled anisotropically so bands are long and roughly horizontal,
      // and drifted with time so they travel across the screen.
      const n1 = noise.noise3(
        u * 0.55 + warp * 0.45 + t * 0.05,
        v * 1.0 + warp * 0.3 - t * 0.025,
        t * 0.1,
      );
      let ridge = 1 - Math.abs(n1);
      ridge = ridge * ridge * Math.sqrt(ridge); // ^2.5: soft shoulders, dark gaps
      // Mid detail: gentle filament variation along the bands.
      const n2 = noise.noise3(u * 1.7 + 50, v * 1.7 + 50, t * 0.18);
      // Very low frequency: regions where the aurora fades in and out over time.
      const n3 = noise.noise3(u * 0.4 + 200, v * 0.4, t * 0.06);
      const region = smoothstep(-0.7, 0.75, n3);
      let aI = ridge * (0.78 + 0.22 * n2) * (0.35 + 0.65 * region) * cfg.auroraIntensity;
      aI = smoothstep(0.04, 1.0, clamp(aI, 0, 1.2));

      // Colour drifts slowly and independently of brightness.
      const n4 = noise.noise3(u * 0.6 + 700, v * 0.6, t * 0.05);
      const colourT = clamp(0.5 + 0.55 * n4, 0, 1);

      // Displacement field: smooth, focused inside the bright bands.
      const dAmp = disp * (0.35 + 0.65 * aI);
      const ax = noise.noise3(u * 1.3 + 300, v * 1.3, t * 0.16) * dAmp;
      const ay = noise.noise3(u * 1.3, v * 1.3 + 400, t * 0.16 + 10) * dAmp;

      // --- Combine with ripples ------------------------------------------
      const rip = rI[i];
      const targetX = hx + ax + rDX[i];
      const targetY = hy + ay + rDY[i];

      // Spring settle towards the target (semi-implicit Euler).
      let vx = velX[i], vy = velY[i];
      let px = posX[i], py = posY[i];
      vx += ((targetX - px) * k - vx * c) * springDt;
      vy += ((targetY - py) * k - vy * c) * springDt;
      px += vx * springDt; py += vy * springDt;
      velX[i] = vx; velY[i] = vy; posX[i] = px; posY[i] = py;

      // --- Appearance -------------------------------------------------------
      const intensity = clamp(aI + rip * 0.8, 0, 1);
      const radius = clamp(cfg.baseRadius + aI * radiusRange + rip * 2.0, 0.4, cfg.maxRadius + 1.5);
      const alpha = clamp(cfg.baseOpacity + aI * opacityRange + rip * 0.7, 0, 1);

      const li = ((colourT * (LUT_SIZE - 1)) | 0) * 3;
      const mix = smoothstep(0, 0.7, intensity);
      const ripMix = rip * 0.6;
      let r = rest[0] + (lut[li] - rest[0]) * mix;
      let g = rest[1] + (lut[li + 1] - rest[1]) * mix;
      let b = rest[2] + (lut[li + 2] - rest[2]) * mix;
      r += (tint[0] - r) * ripMix; g += (tint[1] - g) * ripMix; b += (tint[2] - b) * ripMix;

      // --- Light layer pixel (same field, continuous) -----------------------
      if (drawLight) {
        const L = Math.min(1.5, (aI * aI * 0.85 + aI * 0.15 + rip * 0.45) * lightGain);
        const o = i * 4;
        if (darkBg) {
          lightData[o] = lut[li] * L; lightData[o + 1] = lut[li + 1] * L; lightData[o + 2] = lut[li + 2] * L;
        } else {
          const m = Math.min(1, L);
          lightData[o] = 255 + (lut[li] - 255) * m;
          lightData[o + 1] = 255 + (lut[li + 1] - 255) * m;
          lightData[o + 2] = 255 + (lut[li + 2] - 255) * m;
        }
        lightData[o + 3] = 255;
      }

      if (!drawDots) continue;

      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${(alpha * dotOpacity).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, 6.283185307179586);
      ctx.fill();

      if (glow > 0 && intensity > 0.32) {
        glowIdx[glowN] = i;
        glowA[glowN] = glow * dotOpacity * (intensity - 0.32) * (intensity - 0.32) * 1.9;
        glowR[glowN] = radius * 5.5 + 4;
        glowC[glowN] = (colourT * (GLOW_SPRITES - 1) + 0.5) | 0;
        glowN++;
      }
    }

    // Light layer upload (GPU scales + blurs it via CSS).
    if (drawLight) {
      this.lctx.putImageData(this.lightImage, 0, 0);
    } else if (this.light.style.visibility !== 'hidden') {
      this.lctx.clearRect(0, 0, this.cols, this.rows);
    }
    this.light.style.visibility = drawLight ? 'visible' : 'hidden';

    // Pass 2: additive glow sprites for the brightest particles only.
    if (glowN > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const sprites = this.glowSprites;
      for (let g = 0; g < glowN; g++) {
        const i = glowIdx[g];
        const s = glowR[g];
        ctx.globalAlpha = Math.min(1, glowA[g]);
        ctx.drawImage(sprites[glowC[g]], posX[i] - s, posY[i] - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** For prefers-reduced-motion: a single still frame of the aurora, no ripples. */
  _renderStatic() {
    this.rippleDX.fill(0); this.rippleDY.fill(0); this.rippleI.fill(0);
    this.posX.set(this.homeX); this.posY.set(this.homeY);
    this.velX.fill(0); this.velY.fill(0);
    this.time = 12;
    this._render(1 / 60);
  }
}
