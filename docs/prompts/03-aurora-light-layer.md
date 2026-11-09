# Request 3 — Fade the dots; make it look like a real aurora

> Third prompt in the series. It added the continuous "aurora light" layer and the
> dot-visibility fader to `experiments/aurora-particles/aurora.js`, plus the "Look"
> group in that experiment's control panel.

## Specification

In the dots experiment, add an option to make the dot lattice **less visible or fully
hidden**, so that the aurora is shown as **continuous light** rather than being implied
by the brightness of individual dots.

- Add a **dot visibility** control (0–1). At 0 no dots are drawn at all.
- Add a **continuous aurora light layer** rendered from the *same* noise field, so dots
  and light always agree. It should look like a real aurora curtain: soft, blurred,
  glowing, with the palette's colours; additive on dark grounds, tinted on light grounds.
- Expose the light layer's **brightness** and **softness (blur)** as controls.
- Ripples should also show in the light layer (a soft brightening ring).
- Keep performance: reuse the per-dot field values already computed each frame (one
  pixel per lattice cell, upscaled and blurred by the GPU) rather than sampling noise
  again at higher resolution.
- Defaults: dots fully visible with a subtle light layer behind them, so the original
  look is preserved; sliding dot visibility to 0 gives the pure aurora.

## Original wording (verbatim)

> Would it also be possible to have an option where the dots are not visible or able to
> fade them out? Make it look more like a real aurora than replicaed via the dot intestity?
