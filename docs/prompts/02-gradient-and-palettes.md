# Request 2 — Gradient version and shared colour palettes

> Second prompt in the series. It produced `experiments/flowing-gradient/`,
> `shared/rendering/palettes.js`, `shared/physics/ripples.js` and `shared/ui/`.
> The user's original wording is at the bottom; the specification above it is the
> same request restated so an agent can act on it without guessing.

## Specification

### A. New experiment: smooth gradients instead of dots

Build a second experiment, `experiments/flowing-gradient/`, that produces the same
visual behaviour as `aurora-particles` (slow aurora bands from coherent noise, pointer
ripples, click impulses, damping) but renders the field as **continuous, smooth colour
gradients** rather than a lattice of dots.

- Default look: **soft pastel colours** on a light ground. Dark palettes must also work.
- The field should read as gentle washes of colour, not a busy rainbow. Broad bands,
  slow colour drift, few hues visible at once.
- Ripples should disturb the gradient like a liquid surface (refraction / wobble plus a
  soft ring), not move discrete objects.
- Same engine/page separation, same control panel conventions, same run instructions
  as the first experiment. Reuse shared code (noise, ripple physics) rather than copying.

### B. Colour control for both designs

Both experiments need a way to change colours from the control panel:

- A set of **named palette presets** shared by both designs, so a matching pair can be
  chosen (e.g. a vibrant preset for the dots and its pastel counterpart for the gradient).
- A **continuous adjustment**: at minimum a hue-shift slider; a saturation slider is also
  useful. Adjustments apply to the whole palette.
- Palette changes must apply live, including glow colours and page background/text
  contrast where the background colour belongs to the palette.

### C. Extra colours for the first (dots) design

The dots design's palette options must include, beyond the original blue/cyan/
turquoise/violet set:

- **Neon orange** (used: `#FF6B1A`).
- **The orange from the user's attached logo** (sampled: `#C8532A`, a burnt orange).
- **Other real aurora colours**: aurora green (`#3DF59A`), magenta/pink (`#E24FA7`),
  gold (`#FFB341`), deeper violets.

These were delivered as the presets *Northern Lights*, *Full Spectrum*, *Ember*,
*Solar Flare* and *Glacier*, alongside the original *Aurora*.

## Original wording (verbatim)

> Can I have another similar version where instead of dots, they are smooth gradients
> with a similar effect. I am thinking with smooth pastel colours.
>
> I would like to be able to tweak the colours of both designs using matching colour
> pallets or a slider to change colours.
>
> This first design colour pallet should also include other vibrant colours like neon
> orange, image attached orange, an other colours from auroras.

*(Image attached: a logo mark in burnt orange, approx. `#C8532A`.)*
