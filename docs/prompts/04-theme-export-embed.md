# Request 4 — Theme in the menu, settings export, embeddable library

> Fourth prompt. It produced the Dark/Light toggle and theme-grouped palette menu, the
> Settings JSON export/import in `shared/ui/panel.js`, and `embed/ambient-fx.js`
> (`mount()` + `<ambient-fx>` custom element) with `embed/demo.html` and `package.json`.

## Specification

### A. Theme in the colour menu
The palette menu must make light vs dark explicit: palettes carry a `theme`, the select
groups them by theme, and a Dark / Light toggle switches to the current palette's
counterpart (`pair`) in the other theme. The page background, text and panel follow.

### B. Export / import the look
Every slider plus the colour choice must be exportable as a single JSON document and
re-importable. Format (`ambientFx: 1`):

```json
{ "ambientFx": 1, "engine": "aurora-particles", "theme": "dark",
  "palette": { "name": "Ember", "hue": 0, "saturation": 1, "bg": "#0B0A12", "stops": ["#…"] },
  "config": { "dotOpacity": 0.5, "auroraGlow": 0.8 } }
```
`config` holds only values that differ from the engine defaults. `palette` carries both
the preset reference and the resolved colours. Provide Copy, Download and Apply-pasted.

### C. Embeddable library
The user wants to drop a designed look into an existing website and keep iterating.
Provide an entry module that accepts the exported JSON and mounts the right engine into
a host element as a background layer (absolutely positioned, behind content, no pointer
events), both as a `mount(target, settings)` function and as a `<ambient-fx src|settings>`
custom element. Add a `package.json` with `exports` so it can be installed from git, and
a demo page that looks like an unrelated existing site using both engines.

## Original wording (verbatim)

> Light/Dark mode should also be reflected in the theme menu options.
>
> I need a way to export the settings from the sliders so I can import the look into
> other projects.
>
> In the end, I want to use this library to embed onto an existing page / website and
> then iterate further on the design from this inspirational design system
