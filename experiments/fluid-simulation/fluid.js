/**
 * FluidField — a real-time 2-D incompressible fluid (Jos Stam's "stable fluids")
 * on a coarse grid, rendered as palette-coloured dye.
 *
 * Per frame: inject forces/dye → vorticity confinement → semi-Lagrangian advection
 * of velocity → pressure projection (Jacobi) → advect dye. The pointer stirs the
 * fluid (velocity along its motion, dye at its tip); clicks burst outward. When
 * idle, a slow curl-noise force keeps the dye swirling and a few emitters drift
 * about, releasing colour.
 *
 * Velocity is stored in cells per second; dye density `d` and premultiplied
 * colour `cd` (= colourT · d) are advected together so colour mixes correctly.
 *
 *   import { FluidField } from './fluid.js';
 *   const field = new FluidField(canvas, { palette });
 *   field.start();
 */

import { SimplexNoise } from '../../shared/noise/simplex.js';
import { PALETTES, buildLut, hexToRgb, luminance } from '../../shared/rendering/palettes.js';

export const DEFAULTS = Object.freeze({
  cellSize: 10,             // px per fluid cell
  maxCells: 18000,          // cell count cap; cells grow past this
  softness: 4,              // px CSS blur on the upscaled canvas
  pressureIterations: 16,   // Jacobi iterations for incompressibility
  vorticity: 0.3,           // vorticity confinement strength (crisper swirls)
  velocityDamping: 0.2,     // 1/s
  dyeFade: 0.45,            // 1/s dye dissipation
  exposure: 1.4,            // dye → colour gain
  glow: 0.6,                // how far dense dye lifts toward a pastel of its colour
  baseWash: 0.2,            // 0..1 faint slow aurora colour under the dye

  ambientFlow: 0.8,         // strength of the idle curl-noise stirring
  ambientScale: 700,        // px, size of the idle eddies
  ambientSpeed: 1.0,        // evolution rate of the idle flow and emitters
  ambientDye: 0.35,         // dye released by the drifting emitters

  pointerForce: 1.0,        // velocity injected by pointer motion
  pointerDye: 1.0,          // dye injected by the pointer
  brushRadius: 40,          // px

  grain: 0.02,
  opacity: 1,
  seed: 99,
  respectReducedMotion: true,
});

const LUT_SIZE = 128;
const EMITTERS = 3;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class FluidField {
  constructor(canvas, options = {}) {
    const { palette, ...cfg } = options;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.config = { ...DEFAULTS, ...cfg };
    this.noise = new SimplexNoise(this.config.seed);

    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { alpha: false });
    this.image = null;
    this.cols = 0; this.rows = 0; this.W = 0; this.H = 0;
    this.u = this.v = this.u0 = this.v0 = this.d = this.d0 = this.cd = this.cd0 = this.p = this.div = this.curl = null;
    this.washI = this.washT = null;

    this.pending = [];                 // pointer events queued for the next frame
    this.pointerPos = null;            // last pointer position (canvas px) and time
    this.pointerT = 0;
    this.emitters = Array.from({ length: EMITTERS }, (_, i) => ({ phase: i * 2.1, tint: i / EMITTERS }));

    this.time = 0; this.clock = 0; this.lastFrame = 0;
    this.running = false; this.paused = false; this.rafId = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsFrames = 0;

    this.reducedMotion =
      this.config.respectReducedMotion &&
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._onFrame = this._onFrame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onDown = this._onDown.bind(this);

    this.setPalette(palette || PALETTES[0]);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
    this.applyStyle();
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('pointerdown', this._onDown, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility);
    this.lastFrame = performance.now();
    if (this.reducedMotion) this._renderStatic();
    else this.rafId = requestAnimationFrame(this._onFrame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerdown', this._onDown);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  destroy() { this.stop(); this.resizeObserver.disconnect(); }

  setPaused(p) {
    this.paused = !!p;
    if (!this.paused) this.lastFrame = performance.now();
  }

  setConfig(patch) {
    const prev = this.config;
    this.config = { ...prev, ...patch };
    if (patch.cellSize !== undefined && patch.cellSize !== prev.cellSize) this.resize();
    if (patch.softness !== undefined || patch.opacity !== undefined) this.applyStyle();
    if (patch.seed !== undefined && patch.seed !== prev.seed) this.noise = new SimplexNoise(patch.seed);
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
    this.canvas.width = Math.ceil(w / 2);
    this.canvas.height = Math.ceil(h / 2);

    let cell = this.config.cellSize;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (w < 768 || coarse) cell *= 1.3;
    if ((w * h) / (cell * cell) > this.config.maxCells) cell = Math.sqrt((w * h) / this.config.maxCells);
    const cols = Math.max(8, Math.ceil(w / cell));
    const rows = Math.max(8, Math.ceil(h / cell));
    this.cell = cell;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols; this.rows = rows;
      const W = cols + 2, H = rows + 2;    // one boundary cell on each side
      this.W = W; this.H = H;
      const N = W * H;
      this.u = new Float32Array(N); this.v = new Float32Array(N);
      this.u0 = new Float32Array(N); this.v0 = new Float32Array(N);
      this.d = new Float32Array(N); this.d0 = new Float32Array(N);
      this.cd = new Float32Array(N); this.cd0 = new Float32Array(N);
      this.p = new Float32Array(N); this.div = new Float32Array(N); this.curl = new Float32Array(N);
      this.washI = new Float32Array(N); this.washT = new Float32Array(N);
      this.buffer.width = cols; this.buffer.height = rows;
      this.image = this.bctx.createImageData(cols, rows);
    }
    if (this.reducedMotion && this.running) this._renderStatic();
  }

  // ----------------------------------------------------------------- pointer

  _canvasPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left - this.pad, e.clientY - r.top - this.pad];
  }

  _onMove(e) {
    if (this.reducedMotion || this.paused) return;
    const [x, y] = this._canvasPoint(e);
    const now = performance.now() / 1000;
    if (this.pointerPos) {
      const dt = Math.max(1e-3, now - this.pointerT);
      const dx = x - this.pointerPos[0], dy = y - this.pointerPos[1];
      if (dx * dx + dy * dy > 1) {
        // Velocity in px/s, clamped so a teleporting pointer cannot explode the field.
        const vx = clamp(dx / dt, -3000, 3000), vy = clamp(dy / dt, -3000, 3000);
        this.pending.push({ x, y, vx, vy, burst: 0 });
      }
    }
    this.pointerPos = [x, y]; this.pointerT = now;
  }

  _onDown(e) {
    if (this.reducedMotion || this.paused) return;
    if (e.button !== undefined && e.button !== 0) return;
    const [x, y] = this._canvasPoint(e);
    this.pending.push({ x, y, vx: 0, vy: 0, burst: 1 });
  }

  /** Programmatic stir: velocity (px/s) and dye at canvas-relative (x, y). */
  addRipple(x, y, strength = 1) {
    if (this.reducedMotion) return;
    this.pending.push({ x, y, vx: 0, vy: 0, burst: strength / 16 });
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
    if (this.paused) { this.pending.length = 0; return; }

    this.clock += dt;
    this.time += dt * this.config.ambientSpeed;
    this._simulate(dt);
    this._render();
  }

  // ------------------------------------------------------------- simulation

  _simulate(dt) {
    const cfg = this.config;
    this._applyAmbient(dt);
    this._applyPointer(dt);
    if (cfg.vorticity > 0) this._vorticity(dt);
    this._advect(this.u0, this.u, dt, 1); this._advect(this.v0, this.v, dt, 2);
    const damp = Math.exp(-cfg.velocityDamping * dt);
    const N = this.W * this.H;
    for (let i = 0; i < N; i++) { this.u[i] = this.u0[i] * damp; this.v[i] = this.v0[i] * damp; }
    this._project();
    const fade = Math.exp(-cfg.dyeFade * dt);
    this._advect(this.d0, this.d, dt, 0); this._advect(this.cd0, this.cd, dt, 0);
    for (let i = 0; i < N; i++) { this.d[i] = this.d0[i] * fade; this.cd[i] = this.cd0[i] * fade; }
  }

  /** Idle stirring from a curl-noise potential, evaluated on a 3-cell stride. */
  _applyAmbient(dt) {
    const cfg = this.config;
    const { W, cols, rows, cell, u, v, noise, washI, washT } = this;
    const t = this.time;
    const s = 1 / cfg.ambientScale;
    const eps = cell * 1.5;
    // Force in cells/s² — scaled so the idle flow settles at a few cells per second.
    const gain = (cfg.ambientFlow * 2600 * dt) / cell;
    const flow = cfg.ambientFlow > 0;
    const wash = cfg.baseWash > 0;
    if (flow || wash) {
      for (let r = 1; r <= rows; r += 3) {
        const py = (r - 0.5) * cell;
        for (let c = 1; c <= cols; c += 3) {
          const px = (c - 0.5) * cell;
          let fx = 0, fy = 0, wi = 0, wt = 0.5;
          if (flow) {
            const nx1 = noise.noise3((px + eps) * s, py * s, t * 0.05), nx0 = noise.noise3((px - eps) * s, py * s, t * 0.05);
            const ny1 = noise.noise3(px * s, (py + eps) * s, t * 0.05), ny0 = noise.noise3(px * s, (py - eps) * s, t * 0.05);
            fx = (ny1 - ny0) / (2 * eps) * cfg.ambientScale * gain;
            fy = -(nx1 - nx0) / (2 * eps) * cfg.ambientScale * gain;
          }
          if (wash) {
            // Faint aurora under the dye: a soft ridged band + slow colour drift.
            const n1 = noise.noise3(px * s * 0.6 + t * 0.02 + 300, py * s * 1.1, t * 0.03);
            const ridge = 1 - Math.abs(n1);
            wi = ridge * ridge * cfg.baseWash;
            wt = clamp(0.5 + 0.5 * noise.noise3(px * s * 0.45 + 700, py * s * 0.45, t * 0.02), 0, 1);
          }
          for (let rr = r; rr < Math.min(r + 3, rows + 1); rr++) {
            let i = rr * W + c;
            for (let cc = c; cc < Math.min(c + 3, cols + 1); cc++, i++) {
              u[i] += fx; v[i] += fy;
              washI[i] = wi; washT[i] = wt;
            }
          }
        }
      }
    } else {
      washI.fill(0);
    }
    if (cfg.ambientDye <= 0) return;
    // Drifting emitters release dye with their own slowly changing tint.
    for (const e of this.emitters) {
      const ex = (0.5 + 0.38 * noise.noise3(e.phase, 11.3, t * 0.045)) * this.width;
      const ey = (0.5 + 0.38 * noise.noise3(e.phase + 5, 23.7, t * 0.04)) * this.height;
      e.tint = clamp(0.5 + 0.5 * noise.noise3(e.phase + 9, 41.1, t * 0.03), 0, 1);
      this._splat(ex, ey, 0, 0, cfg.ambientDye * 0.9 * dt * 3, e.tint, cfg.brushRadius * 1.2);
    }
  }

  _applyPointer(dt) {
    const cfg = this.config;
    const tint = clamp(0.5 + 0.5 * Math.sin(this.clock * 0.35), 0, 1);
    for (const ev of this.pending) {
      if (ev.burst > 0) {
        this._burst(ev.x, ev.y, ev.burst * cfg.pointerForce, tint);
      } else {
        // Velocity injection scaled by pointer speed; dye proportional to it.
        const speed = Math.hypot(ev.vx, ev.vy);
        const amount = cfg.pointerDye * clamp(speed / 1200, 0.15, 1) * 0.9;
        this._splat(ev.x, ev.y, (ev.vx / this.cell) * cfg.pointerForce * 0.6, (ev.vy / this.cell) * cfg.pointerForce * 0.6, amount, tint, cfg.brushRadius);
      }
    }
    this.pending.length = 0;
  }

  /** Gaussian splat of velocity (cells/s, replaces towards target) and dye at (x, y) px. */
  _splat(x, y, vx, vy, dye, tint, radius) {
    const { W, cols, rows, cell, u, v, d, cd } = this;
    const rc = Math.max(0.75, radius / cell);
    const cc = x / cell + 0.5, cr = y / cell + 0.5;
    const c0 = Math.max(1, Math.floor(cc - rc * 2)), c1 = Math.min(cols, Math.ceil(cc + rc * 2));
    const r0 = Math.max(1, Math.floor(cr - rc * 2)), r1 = Math.min(rows, Math.ceil(cr + rc * 2));
    const inv = 1 / (2 * rc * rc);
    for (let r = r0; r <= r1; r++) {
      const dy = r - cr;
      for (let c = c0; c <= c1; c++) {
        const dx = c - cc;
        const g = Math.exp(-(dx * dx + dy * dy) * inv);
        const i = r * W + c;
        u[i] += (vx - u[i]) * g * 0.5;
        v[i] += (vy - v[i]) * g * 0.5;
        const add = dye * g;
        d[i] += add; cd[i] += add * tint;
      }
    }
  }

  _burst(x, y, strength, tint) {
    const { W, cols, rows, cell, u, v, d, cd } = this;
    const rc = Math.max(1, (this.config.brushRadius * 1.6) / cell);
    const cc = x / cell + 0.5, cr = y / cell + 0.5;
    const c0 = Math.max(1, Math.floor(cc - rc * 2)), c1 = Math.min(cols, Math.ceil(cc + rc * 2));
    const r0 = Math.max(1, Math.floor(cr - rc * 2)), r1 = Math.min(rows, Math.ceil(cr + rc * 2));
    const inv = 1 / (2 * rc * rc);
    const speed = (strength * 900) / cell;
    for (let r = r0; r <= r1; r++) {
      const dy = r - cr;
      for (let c = c0; c <= c1; c++) {
        const dx = c - cc;
        const dist = Math.hypot(dx, dy) || 1;
        const g = Math.exp(-(dx * dx + dy * dy) * inv);
        const i = r * W + c;
        u[i] += (dx / dist) * speed * g; v[i] += (dy / dist) * speed * g;
        const add = strength * 1.4 * g;
        d[i] += add; cd[i] += add * tint;
      }
    }
  }

  _vorticity(dt) {
    const { W, cols, rows, u, v, curl } = this;
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const i = r * W + c;
        curl[i] = 0.5 * (v[i + 1] - v[i - 1] - (u[i + W] - u[i - W]));
      }
    }
    const eps = this.config.vorticity * dt * 8;
    for (let r = 2; r < rows; r++) {
      for (let c = 2; c < cols; c++) {
        const i = r * W + c;
        const gx = 0.5 * (Math.abs(curl[i + 1]) - Math.abs(curl[i - 1]));
        const gy = 0.5 * (Math.abs(curl[i + W]) - Math.abs(curl[i - W]));
        const len = Math.sqrt(gx * gx + gy * gy) + 1e-5;
        const w = curl[i];
        u[i] += (gy / len) * w * eps;
        v[i] += -(gx / len) * w * eps;
      }
    }
  }

  /** Semi-Lagrangian advection of `src` into `dst` by the current velocity. */
  _advect(dst, src, dt, bnd) {
    const { W, cols, rows, u, v } = this;
    const maxX = cols + 0.5, maxY = rows + 0.5;
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const i = r * W + c;
        let x = c - u[i] * dt, y = r - v[i] * dt;
        if (x < 0.5) x = 0.5; else if (x > maxX) x = maxX;
        if (y < 0.5) y = 0.5; else if (y > maxY) y = maxY;
        const i0 = x | 0, j0 = y | 0;
        const i1 = i0 + 1, j1 = j0 + 1;
        const s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
        dst[i] = s0 * (t0 * src[j0 * W + i0] + t1 * src[j1 * W + i0])
               + s1 * (t0 * src[j0 * W + i1] + t1 * src[j1 * W + i1]);
      }
    }
    this._setBnd(bnd, dst);
  }

  _setBnd(b, f) {
    const { W, cols, rows } = this;
    for (let c = 1; c <= cols; c++) {
      f[c] = b === 2 ? -f[W + c] : f[W + c];
      f[(rows + 1) * W + c] = b === 2 ? -f[rows * W + c] : f[rows * W + c];
    }
    for (let r = 1; r <= rows; r++) {
      f[r * W] = b === 1 ? -f[r * W + 1] : f[r * W + 1];
      f[r * W + cols + 1] = b === 1 ? -f[r * W + cols] : f[r * W + cols];
    }
    f[0] = 0.5 * (f[1] + f[W]);
    f[cols + 1] = 0.5 * (f[cols] + f[W + cols + 1]);
    f[(rows + 1) * W] = 0.5 * (f[(rows + 1) * W + 1] + f[rows * W]);
    f[(rows + 1) * W + cols + 1] = 0.5 * (f[(rows + 1) * W + cols] + f[rows * W + cols + 1]);
  }

  /** Make the velocity field divergence-free (Jacobi pressure solve). */
  _project() {
    const { W, cols, rows, u, v, p, div } = this;
    const q = this.p0 || (this.p0 = new Float32Array(p.length));
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const i = r * W + c;
        div[i] = -0.5 * (u[i + 1] - u[i - 1] + v[i + W] - v[i - W]);
        p[i] = 0;
      }
    }
    this._setBnd(0, div); this._setBnd(0, p);
    let a = p, b = q;
    const iters = this.config.pressureIterations;
    for (let k = 0; k < iters; k++) {
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const i = r * W + c;
          b[i] = (div[i] + a[i - 1] + a[i + 1] + a[i - W] + a[i + W]) * 0.25;
        }
      }
      this._setBnd(0, b);
      const tmp = a; a = b; b = tmp;
    }
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const i = r * W + c;
        u[i] -= 0.5 * (a[i + 1] - a[i - 1]);
        v[i] -= 0.5 * (a[i + W] - a[i - W]);
      }
    }
    this._setBnd(1, u); this._setBnd(2, v);
  }

  // ----------------------------------------------------------------- render

  _render() {
    const { W, cols, rows, d, cd, lut, bg, dark, washI, washT } = this;
    const cfg = this.config;
    const data = this.image.data;
    const exposure = cfg.exposure;
    const glow = cfg.glow;
    const grain = cfg.grain * 255;
    let seed = (this.clock * 1000) | 0;
    let o = 0;
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++, o += 4) {
        const i = r * W + c;
        let cr = bg[0], cg = bg[1], cb = bg[2];

        // Base: faint aurora wash so quiet areas have depth instead of flat background.
        const wi = washI[i];
        if (wi > 0.002) {
          const wl = ((washT[i] * (LUT_SIZE - 1)) | 0) * 3;
          const wm = dark ? wi * 0.55 : wi * 0.35;
          cr += (lut[wl] - cr) * wm; cg += (lut[wl + 1] - cg) * wm; cb += (lut[wl + 2] - cb) * wm;
        }

        const dens = d[i];
        if (dens > 0.002) {
          const ct = clamp(cd[i] / dens, 0, 1);
          const li = ((ct * (LUT_SIZE - 1)) | 0) * 3;
          const lr = lut[li], lg = lut[li + 1], lb = lut[li + 2];
          const e = dens * exposure;
          // Soft saturation: thin dye already reads as colour, never as mud.
          const mix = 1 - Math.exp(-e * 1.8);
          if (dark) {
            // Luminous ink: blend toward the palette colour, then toward a pastel of it.
            cr += (lr - cr) * mix; cg += (lg - cg) * mix; cb += (lb - cb) * mix;
            const lift = clamp((e - 0.55) * 0.6, 0, 1) * glow;
            if (lift > 0) {
              const pr = lr * 0.45 + 255 * 0.55, pg = lg * 0.45 + 255 * 0.55, pb = lb * 0.45 + 255 * 0.55;
              cr += (pr - cr) * lift; cg += (pg - cg) * lift; cb += (pb - cb) * lift;
            }
          } else {
            // Watercolour on paper: multiply-like deepening toward the colour.
            const mr = lr / 255, mg = lg / 255, mb = lb / 255;
            cr *= 1 - (1 - mr) * mix; cg *= 1 - (1 - mg) * mix; cb *= 1 - (1 - mb) * mix;
            const deep = clamp((e - 0.8) * 0.4, 0, 1) * glow * 0.5;
            cr *= 1 - deep * 0.3; cg *= 1 - deep * 0.3; cb *= 1 - deep * 0.3;
          }
        }
        if (grain > 0) {
          seed = (seed * 1664525 + 1013904223) | 0;
          const g = ((seed >>> 16) & 255) / 255 - 0.5;
          cr += g * grain; cg += g * grain; cb += g * grain;
        }
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
      }
    }
    this.bctx.putImageData(this.image, 0, 0);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** Reduced motion: a still of the idle flow after a short offline settle. */
  _renderStatic() {
    if (!this.d) return;
    this.u.fill(0); this.v.fill(0); this.d.fill(0); this.cd.fill(0);
    this.pending.length = 0;
    for (let s = 0; s < 120; s++) { this.time += 1 / 30; this._simulate(1 / 30); }
    this._render();
  }
}
