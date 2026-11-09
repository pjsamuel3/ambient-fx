# Noise Waves

Stacked horizontal strands displaced by layered simplex noise, drawn as a silky
sheet of palette-coloured lines. The aurora bands gather and brighten the sheet;
pointer ripples lift it.

## Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/experiments/noise-waves/>.

## How it works

- **Lines.** `lineCount` baselines spaced evenly over the height (with a margin so
  displaced edge lines still enter the view), each sampled every `sampleSpacing`
  px, overshooting the sides.
- **Displacement.** Two octaves of noise, `0.75·n(x/waveScale, …) + 0.25·n(2.3x…)`,
  scaled by `amplitude`. Neighbouring lines are offset in noise space by
  `coherence`, so at 0 they move identically and at larger values they become
  independent. `drift` slides the whole pattern horizontally.
- **Aurora.** The shared ridged-noise band field scales the amplitude
  (`0.45 + 0.75·aI`) and the brightness, so strands bunch and glow where a band
  passes.
- **Ripples.** The shared `RipplePool` runs on a rectangular lattice
  (`spacing` × line gap, via its `spacingY` option); its vertical displacement is
  added to the lines and its energy to the brightness (`rippleGlow`).
- **Rendering.** Each line gets a `createLinearGradient` with 20 stops carrying the
  per-sample colour and alpha, so brightness varies smoothly along the strand.
  Translucent fills between neighbouring lines (`fillOpacity`) use `lighter` on
  dark palettes and `multiply` on light ones. ~0.7 ms/frame for 28 × 147 points.
