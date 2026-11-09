/**
 * RippleGrid — a wireframe lattice floating on a simulated water surface.
 *
 * Unlike the aurora experiments (which use analytic travelling waves), this one
 * integrates the 2-D wave equation on a height field with one sample per lattice
 * vertex, so waves propagate, interfere and reflect off the edges naturally:
 *
 *   h[t+1] = (2·h[t] − h[t−1] + c²·∇²h[t]) · e^(−damping·Δt)
 *
 * The vertices are drawn displaced by the local height gradient (so the mesh looks
 * refracted through the water) and lines brighten with wave energy. A slow aurora
 * noise field colours the lattice; random "raindrops" keep it alive when idle.
 *
 *   import { RippleGrid } from './grid.js';
 *   const field = new RippleGrid(canvas, { palette });
 *   field.start();
 */

import { SimplexNoise } from '../../shared/noise/simplex.js';
import { PointerRippler } from '../../shared/physics/ripples.js';
import { PALETTES, buildLut, hexToRgb, luminance } from '../../shared/rendering/palettes.js';

export const DEFAULTS = Object.freeze({
  gridSpacing: 30,          // px between lattice lines
  maxVertices: 9000,        // density cap; spacing grows past this
  mobileSpacingFactor: 1.35,
  lineWidth: 1,             // px
  lineOpacity: 0.22,        // resting line alpha
  nodeSize: 1.4,            // px radius of the dots at intersections (0 = none)

  waveSpeed: 0.45,          // cells per simulation step (stable below ~0.7)
  waveDamping: 1.4,         // 1/s energy loss
  displacement: 22,         // px of vertex shift per unit height slope
  waveGlow: 1.0,            // brightness response to wave energy
  brushRadius: 45,          // px radius of the pointer / raindrop bump
  brushStrength: 1.0,       // multiplier on pointer impulses
  rainRate: 0.5,            // ambient raindrops per second

  auroraIntensity: 0.7,     // strength of the slow colour bands
  auroraSpeed: 1.0,
  auroraScale: 520,         // px

  opacity: 1,
  seed: 77,
  respectReducedMotion: true,
});

const LUT_SIZE = 64;
const COLOUR_BUCKETS = 16;
const ALPHA_BUCKETS = 12;
const STEP = 1 / 120;        // fixed simulation step, seconds

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class RippleGrid {
  constructor(canvas, options = {}) {
    const { palette, ...cfg } = options;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = { ...DEFAULTS, ...cfg };
    this.noise = new SimplexNoise(this.config.seed);

    this.cols = 0; this.rows = 0; this.count = 0;
    this.h = new Float32Array(0); this.hPrev = new Float32Array(0); this.hNext = new Float32Array(0);
    this.px = new Float32Array(0); this.py = new Float32Array(0);
    this.glow = new Float32Array(0); this.colourT = new Float32Array(0); this.aI = new Float32Array(0);

    // Segment batches, one per (colour bucket × alpha bucket).
    const keys = COLOUR_BUCKETS * ALPHA_BUCKETS;
    this.segs = new Array(keys).fill(null).map(() => new Float32Array(256));
    this.segCount = new Uint32Array(keys);
    this.nodes = new Array(keys).fill(null).map(() => new Float32Array(128));
    this.nodeCount = new Uint32Array(keys);
    this.keyStyles = new Array(keys).fill('');

    this.pointer = new PointerRippler(canvas, (x, y, s) => this.addRipple(x, y, s), {
      moveBase: 0.5, moveMax: 5, clickStrength: 14, minDistance: 10, minInterval: 0.03,
    });

    this.time = 0; this.clock = 0; this.lastFrame = 0; this.accumulator = 0;
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

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
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
    if (patch.gridSpacing !== undefined && patch.gridSpacing !== prev.gridSpacing) this.resize();
    if (patch.opacity !== undefined) this.applyOpacity();
    if (patch.seed !== undefined && patch.seed !== prev.seed) this.noise = new SimplexNoise(patch.seed);
    if (patch.brushStrength !== undefined) this.pointer.strengthScale = patch.brushStrength;
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
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  applyOpacity() { this.canvas.style.opacity = String(this.config.opacity); }

  statLabel() { return `${this.cols}×${this.rows} grid`; }

  /** Pre-build one fillStyle/strokeStyle string per (colour, alpha) bucket. */
  _bakeStyles() {
    if (!this.lut) return;
    const lut = this.lut;
    for (let cb = 0; cb < COLOUR_BUCKETS; cb++) {
      const li = Math.round((cb / (COLOUR_BUCKETS - 1)) * (LUT_SIZE - 1)) * 3;
      for (let ab = 0; ab < ALPHA_BUCKETS; ab++) {
        const a = (ab + 0.5) / ALPHA_BUCKETS;
        // Bright buckets lift toward white on dark palettes; on light palettes the
        // colour simply saturates, which reads as "ink deepening".
        const lift = this.dark ? Math.max(0, a - 0.55) * 1.2 : 0;
        const r = Math.round(lut[li] + (255 - lut[li]) * lift);
        const g = Math.round(lut[li + 1] + (255 - lut[li + 1]) * lift);
        const b = Math.round(lut[li + 2] + (255 - lut[li + 2]) * lift);
        this.keyStyles[cb * ALPHA_BUCKETS + ab] = `rgba(${r},${g},${b},${a.toFixed(3)})`;
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

    let spacing = this.config.gridSpacing;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (w < 768 || coarse) spacing *= this.config.mobileSpacingFactor;
    const area = (w + spacing * 2) * (h + spacing * 2);
    if (area / (spacing * spacing) > this.config.maxVertices) spacing = Math.sqrt(area / this.config.maxVertices);
    this.spacing = spacing;

    // One ring of vertices beyond each edge so lines run off-screen.
    const cols = Math.ceil(w / spacing) + 3;
    const rows = Math.ceil(h / spacing) + 3;
    this.offX = (w - (cols - 1) * spacing) / 2;
    this.offY = (h - (rows - 1) * spacing) / 2;
    const count = cols * rows;
    if (count !== this.count || cols !== this.cols) {
      this.cols = cols; this.rows = rows; this.count = count;
      this.h = new Float32Array(count); this.hPrev = new Float32Array(count); this.hNext = new Float32Array(count);
      this.px = new Float32Array(count); this.py = new Float32Array(count);
      this.glow = new Float32Array(count); this.colourT = new Float32Array(count); this.aI = new Float32Array(count);
    }
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  // ----------------------------------------------------------------- impulses

  /** Add a Gaussian bump at canvas coordinates (x, y). `strength` ≈ 0.5 (slow move) … 14 (click). */
  addRipple(x, y, strength) {
    if (this.reducedMotion) return;
    this._bump(x, y, strength * 0.14, this.config.brushRadius);
  }

  _bump(x, y, amp, radius) {
    const { cols, rows, spacing, offX, offY } = this;
    const rc = Math.max(1, radius / spacing);
    const cc = (x - offX) / spacing, cr = (y - offY) / spacing;
    const c0 = Math.max(1, Math.floor(cc - rc * 2)), c1 = Math.min(cols - 2, Math.ceil(cc + rc * 2));
    const r0 = Math.max(1, Math.floor(cr - rc * 2)), r1 = Math.min(rows - 2, Math.ceil(cr + rc * 2));
    const inv = 1 / (2 * rc * rc);
    for (let r = r0; r <= r1; r++) {
      const dy = r - cr;
      for (let c = c0; c <= c1; c++) {
        const dx = c - cc;
        this.h[r * cols + c] += amp * Math.exp(-(dx * dx + dy * dy) * inv);
      }
    }
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
    this.time += dt * this.config.auroraSpeed;

    // Ambient raindrops (Poisson process).
    const rain = this.config.rainRate;
    if (rain > 0 && Math.random() < rain * dt) {
      this._bump(Math.random() * this.width, Math.random() * this.height, 0.5 + Math.random() * 0.5, this.config.brushRadius * 0.8);
    }

    // Fixed-step wave integration for stability regardless of frame rate.
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 6) {
      this._stepWave();
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === 6) this.accumulator = 0;

    this._evaluate();
    this._render();
  }

  _stepWave() {
    const { cols, rows, h, hPrev, hNext } = this;
    const c2 = this.config.waveSpeed * this.config.waveSpeed;
    const damp = Math.exp(-this.config.waveDamping * STEP);
    for (let r = 1; r < rows - 1; r++) {
      let i = r * cols + 1;
      for (let c = 1; c < cols - 1; c++, i++) {
        const lap = h[i - 1] + h[i + 1] + h[i - cols] + h[i + cols] - 4 * h[i];
        hNext[i] = (2 * h[i] - hPrev[i] + c2 * lap) * damp;
      }
    }
    // Partially absorbing edges: copy the neighbour, attenuated, so reflections are soft.
    for (let c = 0; c < cols; c++) {
      hNext[c] = hNext[cols + c] * 0.5;
      hNext[(rows - 1) * cols + c] = hNext[(rows - 2) * cols + c] * 0.5;
    }
    for (let r = 0; r < rows; r++) {
      hNext[r * cols] = hNext[r * cols + 1] * 0.5;
      hNext[r * cols + cols - 1] = hNext[r * cols + cols - 2] * 0.5;
    }
    this.hPrev = h; this.h = hNext; this.hNext = hPrev;
  }

  /** Vertex positions, glow and colour from the height field + aurora noise. */
  _evaluate() {
    const { cols, rows, spacing, offX, offY, h, px, py, glow, colourT, aI, noise } = this;
    const cfg = this.config;
    const t = this.time;
    const invScale = 1 / cfg.auroraScale;
    const disp = cfg.displacement;
    const waveGlow = cfg.waveGlow;
    for (let r = 0; r < rows; r++) {
      const y = offY + r * spacing;
      const rm = r > 0 ? r - 1 : r, rp = r < rows - 1 ? r + 1 : r;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = offX + c * spacing;
        const cm = c > 0 ? c - 1 : c, cp = c < cols - 1 ? c + 1 : c;
        const gx = (h[r * cols + cp] - h[r * cols + cm]) * 0.5;
        const gy = (h[rp * cols + c] - h[rm * cols + c]) * 0.5;
        px[i] = x + gx * disp;
        py[i] = y + gy * disp;
        const e = Math.abs(h[i]) * 1.6 + (Math.abs(gx) + Math.abs(gy)) * 1.2;
        glow[i] = Math.tanh(e * waveGlow * 1.5);

        // Slow aurora bands for colour and resting brightness (2 noise samples).
        const u = x * invScale, v = y * invScale;
        const n1 = noise.noise3(u * 0.6 + t * 0.05, v * 1.1 - t * 0.02, t * 0.08);
        let ridge = 1 - Math.abs(n1);
        ridge = ridge * ridge;
        aI[i] = smoothstep(0.05, 1, clamp(ridge * cfg.auroraIntensity * 1.2, 0, 1.2));
        const n4 = noise.noise3(u * 0.45 + 700, v * 0.45, t * 0.035);
        colourT[i] = clamp(0.5 + 0.55 * n4, 0, 1);
      }
    }
  }

  _key(i, j) {
    // Colour / alpha for a segment between vertices i and j (or a node, i === j).
    const ct = (this.colourT[i] + this.colourT[j]) * 0.5;
    const a = (this.aI[i] + this.aI[j]) * 0.5;
    const g = (this.glow[i] + this.glow[j]) * 0.5;
    let alpha = this.config.lineOpacity * (0.5 + 0.5 * a) + g * 0.85;
    alpha = clamp(alpha, 0.02, 1);
    const cb = Math.min(COLOUR_BUCKETS - 1, (ct * COLOUR_BUCKETS) | 0);
    const ab = Math.min(ALPHA_BUCKETS - 1, (alpha * ALPHA_BUCKETS) | 0);
    return cb * ALPHA_BUCKETS + ab;
  }

  _pushSeg(key, x0, y0, x1, y1) {
    let arr = this.segs[key];
    const n = this.segCount[key] * 4;
    if (n + 4 > arr.length) {
      const grown = new Float32Array(arr.length * 2);
      grown.set(arr); arr = this.segs[key] = grown;
    }
    arr[n] = x0; arr[n + 1] = y0; arr[n + 2] = x1; arr[n + 3] = y1;
    this.segCount[key]++;
  }

  _pushNode(key, x, y) {
    let arr = this.nodes[key];
    const n = this.nodeCount[key] * 2;
    if (n + 2 > arr.length) {
      const grown = new Float32Array(arr.length * 2);
      grown.set(arr); arr = this.nodes[key] = grown;
    }
    arr[n] = x; arr[n + 1] = y;
    this.nodeCount[key]++;
  }

  _render() {
    const ctx = this.ctx;
    const { cols, rows, px, py, width, height } = this;
    const cfg = this.config;
    ctx.clearRect(0, 0, width, height);

    this.segCount.fill(0); this.nodeCount.fill(0);
    const nodes = cfg.nodeSize > 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c < cols - 1) this._pushSeg(this._key(i, i + 1), px[i], py[i], px[i + 1], py[i + 1]);
        if (r < rows - 1) this._pushSeg(this._key(i, i + cols), px[i], py[i], px[i + cols], py[i + cols]);
        if (nodes) this._pushNode(this._key(i, i), px[i], py[i]);
      }
    }

    ctx.lineWidth = cfg.lineWidth;
    ctx.lineCap = 'round';
    const keys = COLOUR_BUCKETS * ALPHA_BUCKETS;
    for (let k = 0; k < keys; k++) {
      const n = this.segCount[k];
      if (n === 0) continue;
      const arr = this.segs[k];
      ctx.strokeStyle = this.keyStyles[k];
      ctx.beginPath();
      for (let s = 0, o = 0; s < n; s++, o += 4) {
        ctx.moveTo(arr[o], arr[o + 1]);
        ctx.lineTo(arr[o + 2], arr[o + 3]);
      }
      ctx.stroke();
    }
    if (nodes) {
      const rad = cfg.nodeSize;
      const TAU = Math.PI * 2;
      for (let k = 0; k < keys; k++) {
        const n = this.nodeCount[k];
        if (n === 0) continue;
        const arr = this.nodes[k];
        ctx.fillStyle = this.keyStyles[k];
        ctx.beginPath();
        for (let s = 0, o = 0; s < n; s++, o += 2) {
          ctx.moveTo(arr[o] + rad, arr[o + 1]);
          ctx.arc(arr[o], arr[o + 1], rad, 0, TAU);
        }
        ctx.fill();
      }
    }
  }

  _renderStatic() {
    this.h.fill(0); this.hPrev.fill(0);
    this.time = 20;
    this._evaluate();
    this._render();
  }
}
