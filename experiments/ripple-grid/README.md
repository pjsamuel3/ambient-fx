# Ripple Grid

A wireframe lattice floating on a simulated water surface. Waves propagate,
interfere and reflect; the mesh is drawn refracted through them and lines
brighten with wave energy. Slow aurora bands colour the lattice.

## Run locally

```bash
# from the repository root
python3 -m http.server 8080
```

Open <http://localhost:8080/experiments/ripple-grid/>.

## How it works

- **Wave equation, not analytic ripples.** One height sample per lattice vertex,
  integrated at a fixed 120 Hz step:
  `h[t+1] = (2·h[t] − h[t−1] + c²·∇²h) · e^(−damping·Δt)`. `waveSpeed` is `c` in
  cells per step (keep it below ~0.7 for stability). Edges are partially absorbing
  so reflections are soft rather than ringing.
- **Impulses** are Gaussian bumps added to `h`: pointer moves add small ones scaled
  by pointer speed, clicks add a large one, and `rainRate` drops random ones so the
  pool is never completely still.
- **Refraction.** Each vertex is drawn displaced by the local height gradient ×
  `displacement`, so lines bend around a wave the way a tiled pool floor appears to.
- **Brightness** is `tanh(waveGlow · (|h| + |∇h|))` on top of the resting
  `lineOpacity`, which itself is modulated by the shared ridged-noise aurora bands.
- **Batched drawing.** Segments are bucketed by (colour × alpha) into 192 paths so
  a 50×30 lattice is a few hundred `stroke()` calls per frame, not thousands.
  Pre-baked style strings avoid per-segment string formatting. ~0.3 ms/frame at
  1440×780 on Apple Silicon.

## Colour

Palettes, hue shift, saturation, Dark/Light and Settings JSON export are shared
with the other experiments (`shared/ui/panel.js`). On light palettes bright
strands saturate rather than lift toward white.
