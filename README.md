# ambient-fx
A collection of interactive backgrounds, generative animations and creative coding experiments using Canvas, WebGL and modern web technologies.

## Run

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

Every demo has a navigation strip (top-left) with a link back to the gallery, previous / next arrows and a jump menu; `[` and `]` also step between demos.

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
│   └── ui/                 # panel.js/.css — control panel; nav.js/.css — demo navigation; page.js/.css — page glue
├── embed/                  # ambient-fx.js — mount() + <ambient-fx> element, demo.html
├── gallery/                # index of experiments
└── docs/                   # original prompts + rebuild notes (see docs/README.md)
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
`npm run build` (needs esbuild) produces single-file bundles in `dist/`.

See `embed/demo.html` for a plain page using both engines.
