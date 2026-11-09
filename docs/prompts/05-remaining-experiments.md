# Request 5 — Implement the remaining experiments

> Fifth prompt. The gallery had four placeholder cards marked "Coming soon"
> (Ripple Grid, Particle Field, Fluid Simulation, Noise Waves). This request
> produced `experiments/ripple-grid/`, `experiments/particle-field/`,
> `experiments/fluid-simulation/`, `experiments/noise-waves/`, the shared
> `shared/ui/page.{css,js}`, the `spacingY` option on `RipplePool`, and
> registration of the new engines in `embed/ambient-fx.js` and `package.json`.

## Specification

Build the four experiments the gallery and README already promised, each as a
complete, working page in the same style as the existing two:

- **Same engine surface.** A class on a `<canvas>` exposing `start/stop/destroy/
  setPaused/setConfig/resetConfig/setPalette/statLabel` plus `fps`, `config`,
  `paused`, `reducedMotion`, so `shared/ui/panel.js` (palette, theme toggle, hue,
  saturation, sliders, pause/reset, Settings JSON) works unchanged.
- **Same conventions.** DPR-aware canvas, `ResizeObserver`, clamped `dt`,
  reduced-motion static frame, hidden-tab pause, pointer events on `window` with
  the background wrapper `pointer-events: none`, palettes from
  `shared/rendering/palettes.js`, no dependencies, no build step.
- **Each must be interactive and alive when idle**, and should reuse the shared
  noise, ripple and palette modules where they fit.
- **Ripple Grid**: a lattice of lines (not dots) on a water surface; waves should
  propagate, interfere and reflect realistically (true wave equation), refracting
  the mesh and brightening lines; ambient raindrops.
- **Particle Field**: free particles following a coherent-noise flow field with
  fading trails; aurora bands brighten them; pointer ripples push them.
- **Fluid Simulation**: a real incompressible fluid solver (stable fluids) with
  palette dye; drag stirs, click bursts, idle curl-noise flow and drifting emitters.
- **Noise Waves**: stacked lines displaced by coherent noise forming a silky
  sheet; aurora bands modulate amplitude/brightness; ripples lift the lines.
- Register every engine in `embed/ambient-fx.js` (`ENGINES`) and `package.json`
  (`exports`), link them from the gallery and README, give each a README with run
  instructions and algorithm notes, rebuild `dist/`.

## Original wording (verbatim)

> Can we now implement the remaining experiments?
