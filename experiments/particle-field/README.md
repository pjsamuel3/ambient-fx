# Particle Field

Thousands of particles drifting along a slowly evolving flow field, leaving
fading light trails. The aurora bands brighten and accelerate particles passing
through them; pointer ripples push a wake through the swarm.

## Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/experiments/particle-field/>.

## How it works

- **Flow field.** The heading at a point is `noise3(x/flowScale, y/flowScale, t) ·
  π · 1.6 · flowCurl`. Particles steer toward the heading at a cruise `speed`
  (semi-implicit, frame-rate independent), so the paths are smooth streamlines.
- **Aurora.** The shared ridged-noise band field gives each particle an intensity
  `aI`; target speed is `speed · (0.6 + 0.9·aI)` and alpha scales with `aI`, so
  bands show up as bright, fast streams.
- **Ripples.** The shared `RipplePool` is accumulated on a 24 px grid; each
  particle samples its cell and receives the displacement as an acceleration
  (`pointerForce`) and the energy as extra brightness.
- **Lifecycle.** Particles live 4–12 s, fade in over 0.6 s and out over 1 s, and
  respawn when they die or leave the viewport (+30 px margin), so births and
  deaths are invisible.
- **Trails.** The canvas is not cleared; each frame the background colour is
  painted at `trailFade` alpha (defined per 60 fps frame, corrected for `dt`),
  then the frame's segments are drawn with `lighter` (dark palettes) or
  `multiply` (light). Segments are bucketed by colour × alpha into 128 paths.
  8-bit rounding leaves a very faint residue on dark palettes, which reads as
  a soft nebula behind the trails.
- **Density cap.** `maxDensity` (particles per px²) limits the count on small
  viewports; 2,400 particles cost ~0.75 ms/frame at 1440×780.

## Reduced motion

With `prefers-reduced-motion: reduce` the field is run for three seconds offline
and the trails are left as a still image; no pointer interaction.
