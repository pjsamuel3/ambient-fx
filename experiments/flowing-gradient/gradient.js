/**
 * GradientField — the aurora as smooth, soft colour washes instead of dots.
 *
 * Same coherent-noise field and ripple physics as the dot lattice, but the
 * field is evaluated on a coarse grid of cells (default 10 px), written to an
 * ImageData buffer, and upscaled with bilinear filtering plus a CSS blur.
 * Ripples refract the field (they displace the sample coordinates) and add a
 * soft brightness ring, so the surface wobbles like liquid rather than moving dots.
 *
 *   import { GradientField } from './gradient.js';
 *   const field = new GradientField(canvas, { palette });
 *   field.start();
 */

import { SimplexNoise } from '../../shared/noise/simplex.js';
import { RipplePool, PointerRippler } from '../../shared/physics/ripples.js';
import { PALETTES, buildLut, hexToRgb, luminance } from '../../shared/rendering/palettes.js';
import { observeResize } from '../../shared/rendering/resize.js';

export const DEFAULTS = Object.freeze({
  cellSize: 12,             // px per field sample; lower = sharper, slower
  maxCells: 24000,          // density cap; cell size grows past this
  softness: 14,             // px of CSS blur applied to the upscaled canvas

  auroraIntensity: 1.0,     // strength of the bands
  auroraSpeed: 1.0,
  auroraScale: 900,         // px, characteristic band width
  baseWash: 0.3,            // 0..1 how much palette colour tints the quiet areas
  displacement: 3.0,        // multiplier on ripple refraction (sample-coordinate warp)

  rippleStrength: 1.0,
  rippleSpeed: 420,         // px/s
  rippleDamping: 1.0,       // 1/s
  rippleWavelength: 140,    // px
  ripplePulseWidth: 80,     // px
  maxRippleDisplacement: 60,// px of refraction at full energy
  maxRipples: 24,
  rippleGlow: 0.6,          // colour deepening (pastel) / brightening (dark) inside a ripple ring

  grain: 0.03,              // 0..1 dither to hide banding in smooth gradients
  opacity: 1,
  seed: 4242,
  respectReducedMotion: true,
});

const LUT_SIZE = 128;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class GradientField {
  constructor(canvas, options = {}) {
    const { palette, ...cfg } = options;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.config = { ...DEFAULTS, ...cfg };
    this.noise = new SimplexNoise(this.config.seed);

    // Low-resolution field buffer.
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { alpha: false });
    this.image = null;
    this.cols = 0; this.rows = 0; this.cells = 0;
    this.rippleDX = new Float32Array(0); this.rippleDY = new Float32Array(0);
    this.rippleI = new Float32Array(0);

    this.ripples = new RipplePool(this.config.maxRipples);
    this.pointer = new PointerRippler(canvas, (x, y, s) => this.addRipple(x, y, s), {
      moveBase: 1.2, moveMax: 10, clickStrength: 24, velocityRef: 1800,
    });

    this.time = 0; this.clock = 0; this.lastFrame = 0;
    this.running = false; this.paused = false; this.rafId = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsFrames = 0;

    this.reducedMotion =
      this.config.respectReducedMotion &&
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pointer.enabled = !this.reducedMotion;

    this._onFrame = this._onFrame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);

    this.setPalette(palette || PALETTES.find((p) => p.pastel) || PALETTES[0]);

    this.resize();
    // Later size reports are debounced and ignored unless the host really changed
    // size (mobile toolbars collapsing during scroll must not reset the field).
    this.resizeObserver = observeResize(canvas.parentElement || canvas, () => this.resize(), { skipFirst: true });
    this.applyStyle();
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

  destroy() { this.stop(); this.resizeObserver.disconnect(); }

  setPaused(p) {
    this.paused = !!p;
    this.pointer.enabled = !this.paused && !this.reducedMotion;
    if (!this.paused) this.lastFrame = performance.now();
  }

  setConfig(patch) {
    const prev = this.config;
    this.config = { ...prev, ...patch };
    if (patch.cellSize !== undefined && patch.cellSize !== prev.cellSize) this.resize();
    if (patch.softness !== undefined || patch.opacity !== undefined) this.applyStyle();
    if (patch.seed !== undefined && patch.seed !== prev.seed) this.noise = new SimplexNoise(patch.seed);
    if (patch.rippleStrength !== undefined) this.pointer.strengthScale = patch.rippleStrength;
    if (this.reducedMotion) this._renderStatic();
  }

  resetConfig() { this.setConfig({ ...DEFAULTS, opacity: this.config.opacity }); }

  setPalette(palette) {
    this.palette = palette;
    this.lut = buildLut(palette.stops, LUT_SIZE);
    this.bg = hexToRgb(palette.bg);
    this.dark = luminance(palette.bg) < 0.5;
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  applyStyle() {
    this.canvas.style.opacity = String(this.config.opacity);
    this.canvas.style.filter = this.config.softness > 0 ? `blur(${this.config.softness}px)` : 'none';
    // Blur samples transparent beyond the edge; oversize the canvas slightly to hide it.
    const pad = Math.ceil(this.config.softness * 2);
    this.canvas.style.inset = `-${pad}px`;
    this.canvas.style.width = `calc(100% + ${pad * 2}px)`;
    this.canvas.style.height = `calc(100% + ${pad * 2}px)`;
    this.pad = pad;
  }

  statLabel() { return `${this.cols}×${this.rows} cells`; }

  // ------------------------------------------------------------------ sizing

  resize() {
    const host = this.canvas.parentElement || document.documentElement;
    const w = Math.max(1, host.clientWidth || window.innerWidth);
    const h = Math.max(1, host.clientHeight || window.innerHeight);
    this.width = w; this.height = h;

    // The visible canvas only needs to be the buffer size × a modest factor;
    // the GPU does the final upscale. Keep it at 1/2 CSS px for crispness after blur.
    this.canvas.width = Math.ceil(w / 2);
    this.canvas.height = Math.ceil(h / 2);

    let cell = this.config.cellSize;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (w < 768 || coarse) cell *= 1.3;
    const area = (w + cell) * (h + cell);
    if (area / (cell * cell) > this.config.maxCells) cell = Math.sqrt(area / this.config.maxCells);
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    this.cell = cell;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols; this.rows = rows; this.cells = cols * rows;
      this.buffer.width = cols; this.buffer.height = rows;
      this.image = this.bctx.createImageData(cols, rows);
      this.rippleDX = new Float32Array(this.cells);
      this.rippleDY = new Float32Array(this.cells);
      this.rippleI = new Float32Array(this.cells);
    }
    this.grid = { cols, rows, spacing: cell, x0: 0, y0: 0 };
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  // ----------------------------------------------------------------- ripples

  addRipple(x, y, strength) {
    if (this.reducedMotion) return;
    // Pointer coordinates are relative to the padded canvas; shift into field space.
    this.ripples.add(x - this.pad, y - this.pad, strength, this.clock);
  }

  _onVisibility() {
    if (document.hidden) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    else if (this.running && !this.reducedMotion && !this.rafId) {
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
    if (dt > 1 / 20) dt = 1 / 20;
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
        spread: 260, energyScale: 0.12,
      },
      this.clock, this.width, this.height,
      this.rippleDX, this.rippleDY, this.rippleI,
    );
    this._render();
  }

  _render() {
    const cfg = this.config;
    const noise = this.noise;
    const t = this.time;
    const cols = this.cols, rows = this.rows, cell = this.cell;
    const data = this.image.data;
    const lut = this.lut;
    const bg = this.bg;
    const dark = this.dark;
    const rDX = this.rippleDX, rDY = this.rippleDY, rI = this.rippleI;

    const invScale = 1 / cfg.auroraScale;
    const refract = cfg.displacement;
    const wash = cfg.baseWash;
    const grain = cfg.grain * 255;
    const rippleGlow = cfg.rippleGlow;
    let seed = (t * 1000) | 0; // cheap per-frame dither seed

    let i = 0, o = 0;
    for (let r = 0; r < rows; r++) {
      const py = r * cell;
      for (let c = 0; c < cols; c++, i++, o += 4) {
        // Ripples refract: warp the coordinates we sample the aurora at.
        const sx = c * cell + rDX[i] * refract;
        const sy = py + rDY[i] * refract;
        const u = sx * invScale, v = sy * invScale;

        // Same field family as the dot lattice, tuned broader and softer.
        const warp = noise.noise3(u * 0.3 + 900, v * 0.3, t * 0.035);
        const n1 = noise.noise3(
          u * 0.5 + warp * 0.5 + t * 0.045,
          v * 0.95 + warp * 0.35 - t * 0.02,
          t * 0.09,
        );
        let ridge = 1 - Math.abs(n1);
        ridge = ridge * ridge;                     // ^2: broad, soft bands
        const n3 = noise.noise3(u * 0.4 + 200, v * 0.4, t * 0.055);
        const region = smoothstep(-0.8, 0.8, n3);
        let aI = ridge * (0.4 + 0.6 * region) * cfg.auroraIntensity;
        aI = smoothstep(0, 1, clamp(aI, 0, 1.3));

        // Colour drifts slowly; a second slow layer shifts it along the bands.
        const n4 = noise.noise3(u * 0.45 + 700, v * 0.45, t * 0.035);
        const colourT = clamp(0.5 + 0.45 * n4, 0, 1);
        const li = ((colourT * (LUT_SIZE - 1)) | 0) * 3;

        const rip = rI[i];
        // Mix: quiet areas carry a light wash of palette colour, bands reach full colour.
        let mix = wash + (1 - wash) * aI;
        // On pastel palettes a ripple deepens the colour; on dark ones it also brightens.
        mix = clamp(mix + rip * (dark ? 0.4 : 0.9 * rippleGlow), 0, 1);

        let cr = bg[0] + (lut[li] - bg[0]) * mix;
        let cg = bg[1] + (lut[li + 1] - bg[1]) * mix;
        let cb = bg[2] + (lut[li + 2] - bg[2]) * mix;

        // Ripple rings: brighten on dark palettes, lift towards white on pastel ones.
        if (rip > 0 && dark) {
          const lift = rip * rippleGlow * 0.35;
          cr += (255 - cr) * lift; cg += (255 - cg) * lift; cb += (255 - cb) * lift;
        }

        // Ordered-ish dither to kill banding in very smooth areas.
        if (grain > 0) {
          seed = (seed * 1664525 + 1013904223) | 0;
          const d = ((seed >>> 16) & 255) / 255 - 0.5;
          cr += d * grain; cg += d * grain; cb += d * grain;
        }

        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
      }
    }

    this.bctx.putImageData(this.image, 0, 0);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // The buffer's cell (c, r) is centred at (c*cell, r*cell); draw so pixel
    // centres land there, scaling buffer → canvas.
    const sx = this.canvas.width / this.width;
    const sy = this.canvas.height / this.height;
    ctx.drawImage(
      this.buffer,
      -0.5 * cell * sx, -0.5 * cell * sy,
      cols * cell * sx, rows * cell * sy,
    );
  }

  _renderStatic() {
    this.rippleDX.fill(0); this.rippleDY.fill(0); this.rippleI.fill(0);
    this.time = 20;
    this._render();
  }
}
