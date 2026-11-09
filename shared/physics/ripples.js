/**
 * RipplePool — damped travelling waves on a regular grid of sample points.
 *
 * Shared by the dot lattice and the gradient field. A ripple is
 * (x, y, t0, strength). At age `a` its front sits at radius R = speed·a and a
 * sample at distance d from the origin receives
 *
 *   envelope = exp(-(d - R)² / 2w²)                   Gaussian pulse around the front
 *   wave     = cos((d - R) · 2π / λ)                  oscillation under the pulse
 *   amp      = strength · e^(-damping·a) / √(1 + R/spread)
 *   disp     = amp · envelope · wave   (along the radial direction)
 *   energy   = amp · envelope          (brightness)
 *
 * Only grid cells inside the ring's bounding box are visited.
 */
export class RipplePool {
  constructor(max = 24) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.t0 = new Float32Array(max);
    this.strength = new Float32Array(max);
    this.alive = new Uint8Array(max);
    this.count = 0;
  }

  add(x, y, strength, clock) {
    let slot = -1;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) { slot = i; break; }
    }
    if (slot === -1) {
      // Pool full: recycle the oldest.
      slot = 0;
      for (let i = 1; i < this.max; i++) if (this.t0[i] < this.t0[slot]) slot = i;
    } else {
      this.count++;
    }
    this.x[slot] = x;
    this.y[slot] = y;
    this.t0[slot] = clock;
    this.strength[slot] = strength;
    this.alive[slot] = 1;
  }

  clear() {
    this.alive.fill(0);
    this.count = 0;
  }

  /**
   * @param {{cols:number, rows:number, spacing:number, x0:number, y0:number}} grid
   * @param {{speed:number, damping:number, wavelength:number, pulseWidth:number,
   *          maxDisplacement:number, spread?:number, energyScale?:number}} p
   * @param {number} clock      seconds
   * @param {number} viewW      used to expire rings that have left the view
   * @param {number} viewH
   * @param {Float32Array} outDX   zeroed and accumulated (cols*rows)
   * @param {Float32Array} outDY
   * @param {Float32Array} outI    energy, mapped to 0..1 with tanh
   */
  accumulate(grid, p, clock, viewW, viewH, outDX, outDY, outI) {
    outDX.fill(0); outDY.fill(0); outI.fill(0);
    if (this.count === 0) return;

    const { cols, rows, spacing, x0, y0 } = grid;
    const k = (Math.PI * 2) / p.wavelength;
    const w = p.pulseWidth;
    const invTwoW2 = 1 / (2 * w * w);
    const cutoff = w * 2.6;
    const spread = p.spread ?? 220;
    const maxReach = Math.hypot(viewW, viewH) + cutoff;

    for (let ri = 0; ri < this.max; ri++) {
      if (!this.alive[ri]) continue;
      const age = clock - this.t0[ri];
      const front = age * p.speed;
      const amp = (this.strength[ri] * Math.exp(-age * p.damping)) / Math.sqrt(1 + front / spread);
      if (amp < 0.03 || front - cutoff > maxReach) {
        this.alive[ri] = 0;
        this.count--;
        continue;
      }
      const rx = this.x[ri], ry = this.y[ri];
      const reach = front + cutoff;
      const inner = Math.max(0, front - cutoff);
      const inner2 = inner * inner, reach2 = reach * reach;

      const c0 = Math.max(0, Math.floor((rx - reach - x0) / spacing));
      const c1 = Math.min(cols - 1, Math.ceil((rx + reach - x0) / spacing));
      const r0 = Math.max(0, Math.floor((ry - reach - y0) / spacing));
      const r1 = Math.min(rows - 1, Math.ceil((ry + reach - y0) / spacing));
      if (c0 > c1 || r0 > r1) continue;

      for (let r = r0; r <= r1; r++) {
        const py = y0 + r * spacing;
        const dy = py - ry;
        let i = r * cols + c0;
        for (let c = c0; c <= c1; c++, i++) {
          const dx = x0 + c * spacing - rx;
          const d2 = dx * dx + dy * dy;
          if (d2 > reach2 || d2 < inner2) continue;
          const d = Math.sqrt(d2);
          const off = d - front;
          const envelope = Math.exp(-off * off * invTwoW2);
          const a = amp * envelope * Math.cos(off * k);
          const invD = d > 1e-3 ? 1 / d : 0;
          outDX[i] += dx * invD * a;
          outDY[i] += dy * invD * a;
          outI[i] += amp * envelope;
        }
      }
    }

    // Soft clamp so stacked waves never blow up.
    const maxD = p.maxDisplacement;
    const invMaxD = 1 / maxD;
    const eScale = p.energyScale ?? 0.22;
    const n = outI.length;
    for (let i = 0; i < n; i++) {
      const e = outI[i];
      if (e === 0) continue;
      outI[i] = Math.tanh(e * eScale);
      const dx = outDX[i], dy = outDY[i];
      const m = Math.sqrt(dx * dx + dy * dy);
      if (m > maxD * 0.5) {
        const s = (maxD * Math.tanh(m * invMaxD)) / m;
        outDX[i] = dx * s;
        outDY[i] = dy * s;
      }
    }
  }
}

/**
 * Pointer → ripple emitter. Converts pointer movement into velocity-scaled
 * wavelets and clicks into stronger impulses. Framework-free.
 */
export class PointerRippler {
  /**
   * @param {HTMLElement} canvas   element whose box defines the coordinate space
   * @param {(x:number, y:number, strength:number) => void} emit
   * @param {{moveBase?:number, moveMax?:number, clickStrength?:number,
   *          minDistance?:number, minInterval?:number, velocityRef?:number}} [opts]
   */
  constructor(canvas, emit, opts = {}) {
    this.canvas = canvas;
    this.emit = emit;
    this.opts = {
      moveBase: 0.6, moveMax: 6, clickStrength: 16,
      minDistance: 18, minInterval: 0.045, velocityRef: 1800,
      ...opts,
    };
    this.strengthScale = 1;
    this.enabled = true;
    this.px = -1e9; this.py = -1e9; this.pt = 0;
    this.ex = -1e9; this.ey = -1e9; this.et = -1e9;
    this._move = this._move.bind(this);
    this._down = this._down.bind(this);
  }

  attach() {
    window.addEventListener('pointermove', this._move, { passive: true });
    window.addEventListener('pointerdown', this._down, { passive: true });
  }

  detach() {
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerdown', this._down);
  }

  _point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _move(e) {
    if (!this.enabled) return;
    const [x, y] = this._point(e);
    const now = performance.now() / 1000;
    if (this.px > -1e8) {
      const dt = Math.max(1e-3, now - this.pt);
      const velocity = Math.hypot(x - this.px, y - this.py) / dt;
      const moved = Math.hypot(x - this.ex, y - this.ey);
      if (moved > this.opts.minDistance || now - this.et > this.opts.minInterval) {
        const v = Math.min(1, velocity / this.opts.velocityRef);
        const s = (this.opts.moveBase + (this.opts.moveMax - this.opts.moveBase) * Math.sqrt(v)) * this.strengthScale;
        this.emit(x, y, s);
        this.ex = x; this.ey = y; this.et = now;
      }
    }
    this.px = x; this.py = y; this.pt = now;
  }

  _down(e) {
    if (!this.enabled) return;
    if (e.button !== undefined && e.button !== 0) return;
    const [x, y] = this._point(e);
    this.emit(x, y, this.opts.clickStrength * this.strengthScale);
  }
}
