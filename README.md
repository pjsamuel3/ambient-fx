# ambient-fx
A collection of interactive backgrounds, generative animations and creative coding experiments using Canvas, WebGL and modern web technologies.

**Live demo:** <https://pjsamuel3.github.io/ambient-fx/> (GitHub Pages, served from `main`)

- Gallery: <https://pjsamuel3.github.io/ambient-fx/gallery/>
- Embed demo: <https://pjsamuel3.github.io/ambient-fx/embed/demo.html>
- Experiments: [Aurora Particles](https://pjsamuel3.github.io/ambient-fx/experiments/aurora-particles/) ·
  [Flowing Gradient](https://pjsamuel3.github.io/ambient-fx/experiments/flowing-gradient/) ·
  [Ripple Grid](https://pjsamuel3.github.io/ambient-fx/experiments/ripple-grid/) ·
  [Particle Field](https://pjsamuel3.github.io/ambient-fx/experiments/particle-field/) ·
  [Fluid Simulation](https://pjsamuel3.github.io/ambient-fx/experiments/fluid-simulation/) ·
  [Noise Waves](https://pjsamuel3.github.io/ambient-fx/experiments/noise-waves/)

## Run locally

Everything is static ES modules with no build step. Serve the repo root:

```bash
python3 -m http.server 8080
# or: npx serve .
```

- Gallery: <http://localhost:8080/gallery/>
- Embed demo (an "existing site" using the library): <http://localhost:8080/embed/demo.html>
- Aurora Particles: <http://localhost:8080/experiments/aurora-particles/>
- Flowing Gradient: <http://localhost:8080/experiments/flowing-gradient/>
- Ripple Grid: <http://localhost:8080/experiments/ripple-grid/>
- Particle Field: <http://localhost:8080/experiments/particle-field/>
- Fluid Simulation: <http://localhost:8080/experiments/fluid-simulation/>
- Noise Waves: <http://localhost:8080/experiments/noise-waves/>

Every demo has a navigation strip (top-left) with a link back to the gallery, previous / next arrows and a jump menu; `[` and `]` also step between demos. Below each hero is a page of demo content (feature cards, long text, stats, links) so you can judge the background under real content and while scrolling, including on phones. Scrolling sends a gentle wave through the field.

## Structure

```
ambient-fx/
├── experiments/
│   ├── aurora-particles/   # aurora bands through a dot lattice + pointer ripples (Canvas 2D)
│   ├── flowing-gradient/   # the same field as smooth pastel gradients
│   ├── ripple-grid/        # wireframe lattice on a wave-equation water surface
│   ├── particle-field/     # particles on a noise flow field with fading trails
│   ├── fluid-simulation/   # stable-fluids solver rendered as palette dye
│   └── noise-waves/        # stacked noise-displaced strands, a silky sheet
├── shared/
│   ├── noise/              # simplex.js — 3D simplex noise
│   ├── physics/            # ripples.js — damped travelling waves + pointer emitter
│   ├── rendering/          # palettes.js — colour presets, hue/saturation, LUTs
│   └── ui/                 # panel (controls), nav (demo navigation), content (scrollable demo sections), page (glue)
├── embed/                  # ambient-fx.js — mount() + <ambient-fx> element, demo.html
├── gallery/                # index of experiments
├── docs/                   # original prompts + rebuild notes (see docs/README.md)
└── index.html              # redirects to gallery/ (GitHub Pages entry point)
```

| Experiment | Engine | What it is |
|---|---|---|
| `aurora-particles` | `AuroraField` | Glowing dot lattice; aurora bands + travelling-wave ripples; optional continuous light layer. |
| `flowing-gradient` | `GradientField` | The same aurora field as smooth pastel washes; ripples refract the colour. |
| `ripple-grid` | `RippleGrid` | Wireframe lattice on a wave-equation water surface; waves interfere and reflect. |
| `particle-field` | `ParticleField` | Free particles on a noise flow field with fading trails; ripples push a wake. |
| `fluid-simulation` | `FluidField` | Stable-fluids solver on a coarse grid, rendered as palette dye you can stir. |
| `noise-waves` | `NoiseWaves` | Stacked strands displaced by coherent noise; a silky sheet lifted by ripples. |

Every engine exposes the same lifecycle (`start/stop/destroy/setPaused/setConfig/resetConfig/setPalette`), so the shared panel, Settings JSON and `embed/ambient-fx.js` work with all of them.

All experiments share the palette presets in `shared/rendering/palettes.js` (Aurora, Northern Lights, Full Spectrum, Ember, Solar Flare, Glacier, and five pastel sets) and a hue-shift / saturation control, so the dot and gradient designs can be colour-matched.

Each experiment keeps its engine (`*.js` class on a `<canvas>`) separate from its demo page so it can be dropped into React, Next.js or plain HTML.

## Designing a look, then embedding it

1. Open an experiment, pick a theme (Dark / Light) and palette, tune the sliders.
2. In the panel's **Export / import** group, copy or download the **Settings JSON**.
   It records the engine, theme, palette (preset + hue/saturation, plus the resolved
   colours) and every slider that differs from the defaults. Paste JSON back and press
   **Apply pasted** to restore a look.
3. Embed it in any page. Copy the repository (or `npm i github:pjsamuel3/ambient-fx`),
   then either:

```html
<script type="module" src="/vendor/ambient-fx/embed/ambient-fx.js"></script>

<header class="hero">
  <ambient-fx src="/hero-settings.json"></ambient-fx>   <!-- fills its parent -->
  <h1 style="position:relative; z-index:1">Headline</h1>
</header>
```

or from JavaScript / a framework:

```js
import { mount } from '/vendor/ambient-fx/embed/ambient-fx.js';
import settings from './hero-settings.json' with { type: 'json' };

const fx = mount(document.querySelector('.hero'), settings);
// later: fx.setSettings(otherSettings); fx.destroy();
```

The layer is inserted as the parent's first child, absolutely positioned, `z-index: 0`
and `pointer-events: none`; give your content `position: relative` so it stacks above.
Pointer ripples keep working because the engines listen on `window`.
### Light backgrounds

On light palettes, aurora-particles, particle-field and noise-waves deepen toward ink
(grey-mixed dots, darkened lines, multiplied trails) so the effect reads on paper. For a
softer, brighter look, set `inkDepth` (0–1, default 1) in the settings' `config`. Toward 0
the colours lift toward white and stop multiplying onto the page: light on paper.

```js
mount(target, { engine: 'noise-waves', palette, config: { inkDepth: 0 } });
```

`npm run build` (needs esbuild) produces single-file bundles in `dist/`.

See `embed/demo.html` for a plain page using both engines.
