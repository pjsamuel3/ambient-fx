/**
 * ParticleField — free particles drifting along a coherent-noise flow field,
 * leaving fading light trails. The aurora bands from the other experiments
 * brighten and speed up particles passing through them; pointer ripples
 * (shared RipplePool) push particles aside so a wake forms behind the cursor.
 *
 *   import { ParticleField } from './particles.js';
 *   const field = new ParticleField(canvas, { palette });
 *   field.start();
 */

import { SimplexNoise } from '../../shared/noise/simplex.js';
import { RipplePool, PointerRippler } from '../../shared/physics/ripples.js';
import { PALETTES, buildLut, hexToRgb, luminance } from '../../shared/rendering/palettes.js';
import { observeResize } from '../../shared/rendering/resize.js';

export const DEFAULTS = Object.freeze({
  particleCount: 2400,
  maxDensity: 0.0025,       // particles per px², caps the count on small viewports
  particleSize: 1.3,        // px line width of the trail
  speed: 70,                // px/s cruise speed
  flowScale: 650,           // px, size of the flow eddies
  flowCurl: 1.0,            // how tightly the field turns (angle range multiplier)
  flowSpeed: 1.0,           // how fast the field itself evolves
  trailFade: 0.08,          // fraction of the trail erased per frame at 60 fps
  brightness: 1.0,

  auroraIntensity: 1.0,     // bands that brighten / accelerate particles
  auroraScale: 520,

  pointerForce: 1.0,        // ripple push on particles
  rippleSpeed: 420,
  rippleDamping: 1.2,
  rippleWavelength: 140,
  ripplePulseWidth: 80,
  maxRippleDisplacement: 40,
  maxRipples: 24,

  opacity: 1,
  seed: 2024,
  respectReducedMotion: true,
});

const LUT_SIZE = 64;
const COLOUR_BUCKETS = 16;
const ALPHA_BUCKETS = 8;
const RIPPLE_SPACING = 24;   // px, resolution of the ripple force grid

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ParticleField {
  constructor(canvas, options = {}) {
    const { palette, ...cfg } = options;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.config = { ...DEFAULTS, ...cfg };
    this.noise = new SimplexNoise(this.config.seed);
    this.rand = mulberry32(this.config.seed);

    this.n = 0;
    this.x = new Float32Array(0); this.y = new Float32Array(0);
    this.vx = new Float32Array(0); this.vy = new Float32Array(0);
    this.life = new Float32Array(0); this.maxLife = new Float32Array(0);
    this.tint = new Float32Array(0);

    this.grid = { cols: 0, rows: 0, spacing: RIPPLE_SPACING, x0: 0, y0: 0 };
    this.rippleDX = new Float32Array(0); this.rippleDY = new Float32Array(0); this.rippleI = new Float32Array(0);
    this.ripples = new RipplePool(this.config.maxRipples);
    this.pointer = new PointerRippler(canvas, (x, y, s) => this.addRipple(x, y, s), {
      moveBase: 0.8, moveMax: 8, clickStrength: 22, velocityRef: 1800,
    });

    const keys = COLOUR_BUCKETS * ALPHA_BUCKETS;
    this.segs = new Array(keys).fill(null).map(() => new Float32Array(256));
    this.segCount = new Uint32Array(keys);
    this.keyStyles = new Array(keys).fill('');

    this.time = 0; this.clock = 0; this.lastFrame = 0;
    this.running = false; this.paused = false; this.rafId = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsFrames = 0;
    this.needsClear = true;

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

  destroy() { this.stop(); this.resizeObserver.disconnect(); }

  setPaused(p) {
    this.paused = !!p;
    this.pointer.enabled = !this.paused && !this.reducedMotion;
    if (!this.paused) this.lastFrame = performance.now();
  }

  setConfig(patch) {
    const prev = this.config;
    this.config = { ...prev, ...patch };
    if (patch.particleCount !== undefined && patch.particleCount !== prev.particleCount) this._allocate();
    if (patch.opacity !== undefined) this.applyOpacity();
    if (patch.seed !== undefined && patch.seed !== prev.seed) {
      this.noise = new SimplexNoise(patch.seed); this.rand = mulberry32(patch.seed); this._allocate();
    }
    if (patch.pointerForce !== undefined) this.pointer.strengthScale = Math.sqrt(patch.pointerForce);
    this._bakeStyles();
    if (this.reducedMotion) this._renderStatic();
  }

  resetConfig() { this.setConfig({ ...DEFAULTS, opacity: this.config.opacity }); }

  setPalette(palette) {
    this.palette = palette;
    this.lut = buildLut(palette.stops, LUT_SIZE);
    this.bg = hexToRgb(palette.bg);
    this.dark = luminance(palette.bg) < 0.5;
    this._bakeStyles();
    this.needsClear = true;
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  applyOpacity() { this.canvas.style.opacity = String(this.config.opacity); }

  statLabel() { return `${this.n} particles`; }

  _bakeStyles() {
    if (!this.lut) return;
    const lut = this.lut;
    for (let cb = 0; cb < COLOUR_BUCKETS; cb++) {
      const li = Math.round((cb / (COLOUR_BUCKETS - 1)) * (LUT_SIZE - 1)) * 3;
      for (let ab = 0; ab < ALPHA_BUCKETS; ab++) {
        const a = (ab + 0.5) / ALPHA_BUCKETS;
        const lift = this.dark ? Math.max(0, a - 0.6) * 0.9 : 0;
        const r = Math.round(lut[li] + (255 - lut[li]) * lift);
        const g = Math.round(lut[li + 1] + (255 - lut[li + 1]) * lift);
        const b = Math.round(lut[li + 2] + (255 - lut[li + 2]) * lift);
        this.keyStyles[cb * ALPHA_BUCKETS + ab] = `rgba(${r},${g},${b},${(a * 0.9).toFixed(3)})`;
      }
    }
  }

  // ------------------------------------------------------------------ sizing

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

    const cols = Math.ceil(w / RIPPLE_SPACING) + 1;
    const rows = Math.ceil(h / RIPPLE_SPACING) + 1;
    this.grid = { cols, rows, spacing: RIPPLE_SPACING, x0: 0, y0: 0 };
    this.rippleDX = new Float32Array(cols * rows);
    this.rippleDY = new Float32Array(cols * rows);
    this.rippleI = new Float32Array(cols * rows);

    this._allocate();
    this.needsClear = true;
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  _allocate() {
    const cap = Math.floor(this.width * this.height * this.config.maxDensity);
    const n = Math.max(50, Math.min(this.config.particleCount, cap));
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.tint = new Float32Array(n);
    for (let i = 0; i < n; i++) this._spawn(i, true);
  }

  _spawn(i, initial) {
    this.x[i] = this.rand() * this.width;
    this.y[i] = this.rand() * this.height;
    this.vx[i] = 0; this.vy[i] = 0;
    this.maxLife[i] = 4 + this.rand() * 8;
    this.life[i] = initial ? this.rand() * this.maxLife[i] : 0;
    this.tint[i] = this.rand();
  }

  // ----------------------------------------------------------------- ripples

  addRipple(x, y, strength) {
    if (this.reducedMotion) return;
    this.ripples.add(x, y, strength, this.clock);
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
    this.time += dt * this.config.flowSpeed;

    const cfg = this.config;
    this.ripples.accumulate(
      this.grid,
      {
        speed: cfg.rippleSpeed, damping: cfg.rippleDamping, wavelength: cfg.rippleWavelength,
        pulseWidth: cfg.ripplePulseWidth, maxDisplacement: cfg.maxRippleDisplacement,
        spread: 240, energyScale: 0.15,
      },
      this.clock, this.width, this.height,
      this.rippleDX, this.rippleDY, this.rippleI,
    );
    this._step(dt, true);
  }

  /** Integrate one step and draw the trail segments. */
  _step(dt, interactive) {
    const cfg = this.config;
    const { n, x, y, vx, vy, life, maxLife, tint, noise, width, height } = this;
    const t = this.time;
    const invFlow = 1 / cfg.flowScale;
    const invAurora = 1 / cfg.auroraScale;
    const angleRange = Math.PI * 1.6 * cfg.flowCurl;
    const steer = Math.min(1, 3 * dt);
    const push = cfg.pointerForce * 22 * dt;
    const { cols, rows, spacing } = this.grid;
    const rDX = this.rippleDX, rDY = this.rippleDY, rI = this.rippleI;
    const margin = 30;

    this.segCount.fill(0);

    for (let i = 0; i < n; i++) {
      let px = x[i], py = y[i];

      // Flow direction from a slowly evolving noise field.
      const a = noise.noise3(px * invFlow, py * invFlow, t * 0.08) * angleRange;
      const dirx = Math.cos(a), diry = Math.sin(a);

      // Aurora band: brighter and faster inside it.
      const u = px * invAurora, v = py * invAurora;
      const n1 = noise.noise3(u * 0.6 + t * 0.04, v * 1.1 - t * 0.02, t * 0.06);
      let ridge = 1 - Math.abs(n1);
      ridge = ridge * ridge;
      const aI = smoothstep(0.05, 1, clamp(ridge * cfg.auroraIntensity * 1.25, 0, 1.2));

      const target = cfg.speed * (0.6 + 0.9 * aI);
      vx[i] += (dirx * target - vx[i]) * steer;
      vy[i] += (diry * target - vy[i]) * steer;

      // Ripple push: sample the displacement grid at the particle's cell.
      let rip = 0;
      if (interactive) {
        const c = (px / spacing) | 0, r = (py / spacing) | 0;
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          const gi = r * cols + c;
          vx[i] += rDX[gi] * push;
          vy[i] += rDY[gi] * push;
          rip = rI[gi];
        }
      }

      px += vx[i] * dt; py += vy[i] * dt;
      life[i] += dt;

      const out = px < -margin || px > width + margin || py < -margin || py > height + margin;
      if (out || life[i] >= maxLife[i]) { this._spawn(i, false); continue; }

      // Fade in / out over the particle's life so births and deaths are invisible.
      const l = life[i], ml = maxLife[i];
      const env = Math.min(1, l / 0.6) * Math.min(1, (ml - l) / 1.0);
      let alpha = env * cfg.brightness * (0.3 + 0.7 * aI) + rip * 0.6;
      alpha = clamp(alpha, 0, 1);
      if (alpha > 0.03) {
        // Colour: slow drift field blended with the particle's own tint.
        const n4 = noise.noise3(u * 0.45 + 700, v * 0.45, t * 0.03);
        const ct = clamp(0.5 + 0.45 * n4 + (tint[i] - 0.5) * 0.3, 0, 1);
        const cb = Math.min(COLOUR_BUCKETS - 1, (ct * COLOUR_BUCKETS) | 0);
        const ab = Math.min(ALPHA_BUCKETS - 1, (alpha * ALPHA_BUCKETS) | 0);
        this._pushSeg(cb * ALPHA_BUCKETS + ab, x[i], y[i], px, py);
      }
      x[i] = px; y[i] = py;
    }

    this._draw(dt);
  }

  _pushSeg(key, x0, y0, x1, y1) {
    let arr = this.segs[key];
    const o = this.segCount[key] * 4;
    if (o + 4 > arr.length) {
      const grown = new Float32Array(arr.length * 2);
      grown.set(arr); arr = this.segs[key] = grown;
    }
    arr[o] = x0; arr[o + 1] = y0; arr[o + 2] = x1; arr[o + 3] = y1;
    this.segCount[key]++;
  }

  _draw(dt) {
    const ctx = this.ctx;
    const cfg = this.config;
    const bg = this.bg;
    ctx.globalCompositeOperation = 'source-over';
    if (this.needsClear) {
      ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      ctx.fillRect(0, 0, this.width, this.height);
      this.needsClear = false;
    } else {
      // Frame-rate independent fade: trailFade is defined per 60 fps frame.
      const fade = 1 - Math.pow(1 - cfg.trailFade, dt * 60);
      ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},${fade.toFixed(4)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.globalCompositeOperation = this.dark ? 'lighter' : 'multiply';
    ctx.lineWidth = cfg.particleSize;
    ctx.lineCap = 'round';
    const keys = COLOUR_BUCKETS * ALPHA_BUCKETS;
    for (let k = 0; k < keys; k++) {
      const cnt = this.segCount[k];
      if (cnt === 0) continue;
      const arr = this.segs[k];
      ctx.strokeStyle = this.keyStyles[k];
      ctx.beginPath();
      for (let s = 0, o = 0; s < cnt; s++, o += 4) {
        ctx.moveTo(arr[o], arr[o + 1]);
        ctx.lineTo(arr[o + 2], arr[o + 3]);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Reduced motion: run the field for a few seconds offline and leave the trails. */
  _renderStatic() {
    this.needsClear = true;
    this.time = 10;
    const saved = this.config.trailFade;
    this.config = { ...this.config, trailFade: 0.03 };
    for (let s = 0; s < 90; s++) this._step(1 / 30, false);
    this.config = { ...this.config, trailFade: saved };
  }
}
