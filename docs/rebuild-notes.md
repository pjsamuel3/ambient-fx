# Rebuild notes

How the prompts in `prompts/` were turned into code, and the decisions that are
not obvious from the prompts themselves. Read this with the prompts if the code
is ever lost and needs to be recreated.

## Order of work

1. `01-aurora-particles-brief.md` → `shared/noise/simplex.js`, `experiments/aurora-particles/`.
2. `02-gradient-and-palettes.md` → `shared/rendering/palettes.js`, `shared/physics/ripples.js`
   (ripple code extracted from the dots engine), `shared/ui/panel.{js,css}`
   (panel extracted from the dots page), `experiments/flowing-gradient/`.
3. `03-aurora-light-layer.md` → light layer + `dotOpacity` / `auroraGlow` / `auroraBlur`
   in `experiments/aurora-particles/aurora.js`.
4. `04-theme-export-embed.md` → `theme`/`pair` on palettes, theme toggle + Settings JSON in
   `shared/ui/panel.js`, `embed/ambient-fx.js`, `embed/demo.html`, `package.json`.

## Repository conventions

- No build step, no dependencies. Static ES modules served from the repo root
  (`python3 -m http.server 8080`). Pages import shared code by relative path.
- Each experiment is `engine.js` (a class mounted on a `<canvas>`, no DOM
  assumptions beyond that) + `main.js` (page glue) + `index.html` + `styles.css` + `README.md`.
- Engines expose: `start()`, `stop()`, `destroy()`, `setPaused(bool)`, `setConfig(patch)`,
  `resetConfig()`, `setPalette(palette)`, `statLabel()`, and `fps`, `config`, `paused`,
  `reducedMotion` fields. `shared/ui/panel.js` relies on exactly this surface.
- Palettes are `{ name, theme, pair?, bg, stops: [hex...] }`; stops spread evenly 0→1.
- Settings JSON (`ambientFx: 1`) is the contract between the panels and `embed/ambient-fx.js`;
  `resolvePalette()` in `palettes.js` turns its `palette` field back into colours.

## Decisions that deviated from or refined the brief

- **Base opacity 0.2, not 0.15**, and a resting dot colour derived from the palette's
  first stop pulled toward grey. At 0.15 the lattice was invisible on `#080B12` and the
  acceptance criterion "coherent, evenly spaced particle grid" failed.
- **Ripple wave shape.** The brief's `sin(d·f − t·s)·exp(−d·k)` makes the whole field
  respond at once near the origin. Implemented instead as a Gaussian pulse that travels
  outward (`exp(−(d−R)²/2w²)`, `R = speed·age`) with a cosine under it, temporal damping
  `e^(−damping·age)` and 2-D spreading `1/√(1+R/spread)`. Brightness uses the envelope
  only; displacement uses envelope × cosine along the radial direction. Overlaps are
  summed then soft-clamped with `tanh`.
- **Aurora field.** Ridged simplex noise (`1−|n|`, raised to 2.5 for dots, 2 for the
  gradient) sampled anisotropically (x stretched, y compressed) and domain-warped by a
  very low-frequency layer so bands are long, roughly horizontal and curved. Additional
  layers: slow regional fade (so the pattern never looks tiled), slow colour drift
  (independent of brightness), and two displacement samples scaled up inside bright bands.
- **Spring settling** is applied to the drawn position (critically damped, k = 140),
  not to the ripple itself; the ripple is already a decaying wave.
- **Glow** uses pre-rendered radial-gradient sprites drawn with `lighter` for particles
  above an intensity threshold. `shadowBlur` was avoided for performance.
- **Gradient rendering**: field evaluated per cell (12 px, capped at 24k cells) into
  `ImageData`, drawn to a half-resolution canvas with bilinear smoothing, CSS `blur()`
  on top. The canvas is oversized by the blur radius so edges never show. Ripples warp
  the sample coordinates (refraction) rather than moving anything; on pastel palettes a
  ripple deepens colour, on dark palettes it brightens.
- **Aurora light layer (dots engine).** The engine inserts a sibling `<canvas>` before the
  dot canvas, sized `cols × rows` pixels (one per lattice cell) and CSS-scaled to cover the
  lattice with `filter: blur()`. Each frame the per-dot intensity/colour already computed
  is written into its `ImageData`, so the layer costs no extra noise samples. Blend mode is
  `screen` on dark palettes, `multiply` on light ones. `dotOpacity` scales dot alpha and
  halo alpha; at 0 the dot pass is skipped entirely.
- **Pointer events are on `window`**, and the background wrapper is `pointer-events: none`,
  so overlaid content stays fully interactive while ripples still track the cursor.
- **Colour tweaking**: palette preset select plus hue-shift (±180°) and saturation
  (0–1.6×) sliders; `adjustPalette()` rotates each stop in HSL. The page background and
  text colours follow the palette's `bg` luminance.

## Measured performance (Apple Silicon laptop, Chrome)

| Experiment | Work per frame | Notes |
|---|---|---|
| aurora-particles, ~2,300 dots | ~2.4 ms | 7 noise samples per dot |
| flowing-gradient, 24k cells | ~2.0 ms | 4 noise samples per cell; GPU does scale + blur |

## Known gaps

- `prefers-reduced-motion` (static frame) and hidden-tab pausing are implemented but
  were not exercised in automated testing.
- WebGL was deliberately not used; Canvas 2D has ~4× headroom at the brief's density.
