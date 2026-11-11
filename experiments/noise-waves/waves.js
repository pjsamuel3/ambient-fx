/**
 * NoiseWaves — stacked horizontal lines, each displaced by layered simplex
 * noise, drawn as a silky sheet of palette-coloured strands.
 *
 * Adjacent lines sample the noise at nearly the same coordinates (`coherence`),
 * so they move together and bunch up where the field is steep. The aurora band
 * field from the other experiments scales the amplitude and brightness, so the
 * sheet gathers and glows in slow-moving regions. Pointer ripples (shared
 * RipplePool on a rectangular lattice of samples × lines) lift the lines and
 * brighten them where a wave passes.
 *
 *   import { NoiseWaves } from './waves.js';
 *   const field = new NoiseWaves(canvas, { palette });
 *   field.start();
 */

import { SimplexNoise } from '../../shared/noise/simplex.js';
import { RipplePool, PointerRippler } from '../../shared/physics/ripples.js';
import { PALETTES, buildLut, hexToRgb, luminance } from '../../shared/rendering/palettes.js';
import { observeResize } from '../../shared/rendering/resize.js';

export const DEFAULTS = Object.freeze({
  lineCount: 28,
  sampleSpacing: 10,        // px between samples along a line
  amplitude: 70,            // px of vertical noise displacement
  waveScale: 460,           // px, horizontal size of the undulations
  coherence: 0.08,          // noise offset between neighbouring lines (0 = identical)
  waveSpeed: 1.0,
  drift: 18,                // px/s horizontal drift of the pattern
  lineWidth: 1.6,           // px
  lineOpacity: 0.85,
  fillOpacity: 0.14,        // translucent fill between neighbouring lines

  auroraIntensity: 1.0,     // bands scale amplitude and brightness
  auroraScale: 720,

  rippleStrength: 1.0,
  rippleSpeed: 380,
  rippleDamping: 1.1,
  rippleWavelength: 120,
  ripplePulseWidth: 60,
  maxRippleDisplacement: 40,
  maxRipples: 24,
  rippleGlow: 0.7,

  opacity: 1,
  seed: 31337,
  respectReducedMotion: true,
});

const LUT_SIZE = 64;
const GRADIENT_STOPS = 20;   // colour stops per line gradient

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class NoiseWaves {
  constructor(canvas, options = {}) {
    const { palette, ...cfg } = options;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = { ...DEFAULTS, ...cfg };
    this.noise = new SimplexNoise(this.config.seed);

    this.cols = 0; this.rows = 0;
    this.px = new Float32Array(0); this.py = new Float32Array(0);
    this.bright = new Float32Array(0); this.colourT = new Float32Array(0);
    this.rippleDX = new Float32Array(0); this.rippleDY = new Float32Array(0); this.rippleI = new Float32Array(0);
    this.grid = { cols: 0, rows: 0, spacing: 1, spacingY: 1, x0: 0, y0: 0 };

    this.ripples = new RipplePool(this.config.maxRipples);
    this.pointer = new PointerRippler(canvas, (x, y, s) => this.addRipple(x, y, s), {
      moveBase: 0.6, moveMax: 6, clickStrength: 16, velocityRef: 1800,
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
    if ((patch.lineCount !== undefined && patch.lineCount !== prev.lineCount) ||
        (patch.sampleSpacing !== undefined && patch.sampleSpacing !== prev.sampleSpacing)) this.resize();
    if (patch.opacity !== undefined) this.applyOpacity();
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

  applyOpacity() { this.canvas.style.opacity = String(this.config.opacity); }

  statLabel() { return `${this.rows} lines × ${this.cols} pts`; }

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

    const spacing = this.config.sampleSpacing;
    const cols = Math.ceil(w / spacing) + 3;                    // overshoot each side
    const rows = Math.max(2, Math.round(this.config.lineCount));
    // Lines span the height with a margin so displaced top/bottom lines still enter the view.
    const margin = this.config.amplitude * 0.6;
    const gap = (h + margin * 2) / (rows - 1);
    this.x0 = -spacing; this.y0 = -margin; this.gap = gap; this.spacing = spacing;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols; this.rows = rows;
      const n = cols * rows;
      this.px = new Float32Array(n); this.py = new Float32Array(n);
      this.bright = new Float32Array(n); this.colourT = new Float32Array(n);
      this.rippleDX = new Float32Array(n); this.rippleDY = new Float32Array(n); this.rippleI = new Float32Array(n);
    }
    this.grid = { cols, rows, spacing, spacingY: gap, x0: this.x0, y0: this.y0 };
    if (this.reducedMotion && this.running) this._renderStatic();
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
    this.time += dt * this.config.waveSpeed;

    const cfg = this.config;
    this.ripples.accumulate(
      this.grid,
      {
        speed: cfg.rippleSpeed, damping: cfg.rippleDamping, wavelength: cfg.rippleWavelength,
        pulseWidth: cfg.ripplePulseWidth, maxDisplacement: cfg.maxRippleDisplacement,
        spread: 220, energyScale: 0.2,
      },
      this.clock, this.width, this.height,
      this.rippleDX, this.rippleDY, this.rippleI,
    );
    this._evaluate();
    this._render();
  }

  _evaluate() {
    const { cols, rows, spacing, gap, x0, y0, px, py, bright, colourT, noise } = this;
    const cfg = this.config;
    const t = this.time;
    const invWave = 1 / cfg.waveScale;
    const invAurora = 1 / cfg.auroraScale;
    const driftX = this.clock * cfg.drift;
    const rDX = this.rippleDX, rDY = this.rippleDY, rI = this.rippleI;
    const coh = cfg.coherence;
    for (let r = 0; r < rows; r++) {
      const baseY = y0 + r * gap;
      const lineOff = r * coh;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = x0 + c * spacing;
        const sx = x + driftX;
        const u = sx * invAurora, v = baseY * invAurora;

        // Aurora bands modulate amplitude + brightness.
        const n1 = noise.noise3(u * 0.6 + t * 0.03, v * 1.1 - t * 0.015, t * 0.05);
        let ridge = 1 - Math.abs(n1);
        ridge = ridge * ridge;
        const aI = smoothstep(0.05, 1, clamp(ridge * cfg.auroraIntensity * 1.25, 0, 1.2));

        // Two octaves of displacement noise, nearly shared between neighbouring lines.
        const w1 = noise.noise3(sx * invWave + lineOff, lineOff * 2.3 + 3.1, t * 0.12);
        const w2 = noise.noise3(sx * invWave * 2.3 + lineOff * 1.7 + 50, lineOff * 4.1, t * 0.2);
        const disp = (w1 * 0.75 + w2 * 0.25) * cfg.amplitude * (0.45 + 0.75 * aI);

        px[i] = x + rDX[i] * 0.5;
        py[i] = baseY + disp + rDY[i];
        const rip = rI[i];
        bright[i] = clamp(0.35 + 0.65 * aI + rip * cfg.rippleGlow, 0, 1.3);

        const n4 = noise.noise3(u * 0.45 + 700, v * 0.45 + r * 0.02, t * 0.025);
        colourT[i] = clamp(0.5 + 0.5 * n4 + (r / rows - 0.5) * 0.25, 0, 1);
      }
    }
  }

  _lineGradient(ctx, r, alphaScale) {
    const { cols, px, bright, colourT, lut, dark } = this;
    const grad = ctx.createLinearGradient(px[r * cols], 0, px[r * cols + cols - 1], 0);
    const step = (cols - 1) / (GRADIENT_STOPS - 1);
    for (let s = 0; s < GRADIENT_STOPS; s++) {
      const c = Math.round(s * step);
      const i = r * cols + c;
      const li = ((colourT[i] * (LUT_SIZE - 1)) | 0) * 3;
      const b = bright[i];
      const a = clamp(b * alphaScale, 0, 1);
      // Dark palettes lift bright strands toward white; light ones deepen them toward ink.
      const lift = dark ? Math.max(0, b - 0.9) * 1.5 : 0;
      const deep = dark ? 1 : 1 - Math.max(0, b - 0.45) * 0.45;
      const cr = Math.round((lut[li] + (255 - lut[li]) * lift) * deep);
      const cg = Math.round((lut[li + 1] + (255 - lut[li + 1]) * lift) * deep);
      const cb = Math.round((lut[li + 2] + (255 - lut[li + 2]) * lift) * deep);
      grad.addColorStop(s / (GRADIENT_STOPS - 1), `rgba(${cr},${cg},${cb},${a.toFixed(3)})`);
    }
    return grad;
  }

  _render() {
    const ctx = this.ctx;
    const { cols, rows, px, py, width, height } = this;
    const cfg = this.config;
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Fills between neighbouring lines first (bottom to top), then the strands.
    if (cfg.fillOpacity > 0) {
      ctx.globalCompositeOperation = this.dark ? 'lighter' : 'multiply';
      for (let r = 0; r < rows - 1; r++) {
        const a = r * cols, b = (r + 1) * cols;
        ctx.beginPath();
        ctx.moveTo(px[a], py[a]);
        for (let c = 1; c < cols; c++) ctx.lineTo(px[a + c], py[a + c]);
        for (let c = cols - 1; c >= 0; c--) ctx.lineTo(px[b + c], py[b + c]);
        ctx.closePath();
        ctx.fillStyle = this._lineGradient(ctx, r, cfg.fillOpacity);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = cfg.lineWidth;
    for (let r = 0; r < rows; r++) {
      const a = r * cols;
      ctx.beginPath();
      ctx.moveTo(px[a], py[a]);
      for (let c = 1; c < cols; c++) ctx.lineTo(px[a + c], py[a + c]);
      ctx.strokeStyle = this._lineGradient(ctx, r, cfg.lineOpacity);
      ctx.stroke();
    }
  }

  _renderStatic() {
    this.rippleDX.fill(0); this.rippleDY.fill(0); this.rippleI.fill(0);
    this.time = 20;
    this._evaluate();
    this._render();
  }
}
