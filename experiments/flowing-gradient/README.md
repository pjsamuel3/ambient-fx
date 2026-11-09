# Flowing Gradient

The aurora field from [aurora-particles](../aurora-particles/) rendered as
smooth, soft colour washes instead of a dot lattice. Pastel by default; any
palette from `shared/rendering/palettes.js` works, including the dark ones.

## Run locally

```bash
# from the repository root
python3 -m http.server 8080
```

Open <http://localhost:8080/experiments/flowing-gradient/>.

## How it works

- The field is evaluated on a coarse grid (`cellSize`, default 12 px, capped at `maxCells`) into an
  `ImageData` buffer: three coherent-noise layers (domain warp, ridged bands,
  slow regional fade) plus a slow colour layer, exactly as in the dot version
  but with softer exponents.
- The buffer is drawn to a half-resolution canvas with bilinear smoothing, and
  a CSS `blur()` (`softness`) finishes the gradient. The canvas is oversized by
  the blur radius so edges never show. The GPU does the scaling and blur, so
  the CPU cost is only `cols × rows` noise samples (about 17k cells at 1080p).
- Ripples come from the shared `RipplePool`. Instead of moving dots, the ripple
  displacement warps the coordinates the field is sampled at, so a wave reads
  as refraction through liquid. The ripple energy also lifts brightness
  (towards white on pastel palettes, towards the colour on dark ones).
- `baseWash` controls how much palette colour tints the quiet regions, which
  is what gives the pastel look its all-over softness.
- A tiny per-frame dither (`grain`) hides banding in the smooth areas.

## Colour

Use the panel's palette picker, hue-shift and saturation sliders. Palettes are
shared with the particle version, so matching looks across both designs is a
matter of picking the same preset (e.g. "Ember" and "Ember Pastel").
