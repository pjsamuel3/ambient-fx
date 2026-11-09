# Aurora Particles

An interactive, aurora-inspired animated background: an evenly spaced lattice of
glowing dots through which slow, curved bands of light travel. Pointer movement
sends damped travelling waves through the field; clicking drops a stronger
circular impulse. Canvas 2D, zero dependencies, framework-independent.

## Run locally

ES modules need an HTTP origin, so serve the repo root rather than opening the file:

```bash
# from the repository root
python3 -m http.server 8080
# or: npx serve .
```

Then open <http://localhost:8080/experiments/aurora-particles/>.

## Files

| File | Role |
|---|---|
| `aurora.js` | The engine (`AuroraField` class). No DOM assumptions beyond a `<canvas>`. |
| `main.js` | Page glue: mounts the engine, builds the control panel. |
| `index.html` / `styles.css` | Demo page with hero content overlaid on the background. |
| `../../shared/noise/simplex.js` | 3D simplex noise used for the aurora field. |
| `../../shared/physics/ripples.js` | `RipplePool` (travelling-wave accumulation) and `PointerRippler` (pointer → wavelets). |
| `../../shared/rendering/palettes.js` | Colour presets, hue/saturation adjustment, LUT baking. |
| `../../shared/ui/panel.js` | Control panel builder incl. palette picker. |

## Using it as a website background

```html
<div class="aurora-bg" aria-hidden="true"><canvas id="aurora"></canvas></div>
<script type="module">
  import { AuroraField } from './aurora.js';
  const field = new AuroraField(document.getElementById('aurora'), { opacity: 0.8 });
  field.start();
  // field.setConfig({ auroraSpeed: 0.6 }); field.setPaused(true); field.destroy();
</script>
```

- The wrapper is `position: fixed; inset: 0; pointer-events: none`, so text,
  links and buttons above it behave normally. The engine listens for pointer
  events on `window`, so ripples still follow the cursor across overlaid content.
- The canvas is DPR-aware (capped at 2×) and resizes via `ResizeObserver` on
  its parent, so it works as a hero-section background too: just give the
  parent `position: relative; overflow: hidden`.
- `opacity` dims the whole particle layer for text contrast.
- On narrow or touch screens the grid spacing grows by `mobileSpacingFactor`,
  and `maxParticles` caps the count on very large displays.
- The engine inserts a second canvas (class `aurora-light`) before the dot canvas inside
  the same parent, so the parent must be positioned. `destroy()` removes it.
- `field.setPalette({ bg, stops: [hex, ...] })` swaps colours at runtime; see
  `shared/rendering/palettes.js` for presets and `adjustPalette()` for hue/saturation shifts.
- Rendering pauses when the tab is hidden. With `prefers-reduced-motion`,
  a single still frame is drawn and ripples are disabled.

For React / Next.js, create the field in a `useEffect` on a ref'd canvas and
call `destroy()` in the cleanup. The engine has no React-specific code.

## How it works

### Lattice

Particle homes are laid out on a grid of `gridSpacing` px, centred in the
viewport with one extra ring outside the edges so displacement never reveals a
border. State lives in flat `Float32Array`s (home, position, velocity, ripple
accumulators); nothing is allocated inside the frame loop.

### Aurora field

Every frame, each particle samples 3D simplex noise at `(homeX/scale, homeY/scale, time)`.
Because simplex noise is continuous, neighbouring particles get neighbouring values,
which is what makes the motion read as one connected sheet rather than jitter.
Several layers are combined:

| Layer | Purpose |
|---|---|
| `ridge = (1 - |n1|)^3` | Ridged noise turns zero-crossings into bright, curved bands with dark gaps: the aurora curtains. The sample point drifts with time so bands travel. |
| `n2` (2.4× frequency) | Filament detail along the bands. |
| `n3` (0.45× frequency, slow) | Broad regions where the aurora fades in and out, so the pattern never looks tiled or looped. |
| `n4` (slow) | Colour parameter, independent of brightness, through deep blue → cyan → turquoise → violet. |
| two more samples | X / Y displacement, scaled up inside the bright bands. |

The resulting intensity drives radius, opacity and colour mix. Displacement is
deliberately small (±6 px by default): most of the perceived motion is brightness and size.

### Ripples

A ripple is `(x, y, t0, strength)`. At age `a` its wave front sits at radius
`R = speed · a`. For a particle at distance `d` from the origin:

```
envelope = exp(-(d - R)² / 2w²)          // Gaussian pulse around the front
wave     = cos((d - R) · 2π / λ)         // a couple of oscillations under it
amp      = strength · e^(-damping·a) / √(1 + R/120)   // time decay + 2-D spreading
disp     = amp · envelope · wave         // applied along the radial direction
```

Only particles within the ring's bounding box are visited, so cost scales with
ring circumference, not particle count. Overlapping ripples are summed and then
soft-clamped with `tanh` to `maxRippleDisplacement`, which keeps stacked waves
stable. Ripples expire when their amplitude drops below a threshold or the front
leaves the viewport.

Pointer movement emits a wavelet every ~18 px / 45 ms with strength growing with
cursor speed (√ curve, clamped). A click emits a single ~16 px impulse. This
lives in `shared/physics/ripples.js` and is reused by the gradient experiment.

### Settling

Each particle's drawn position follows its target (`home + aurora + ripple`)
through a critically damped spring (`k = 140`, `c = 2√k`), integrated with
semi-implicit Euler at a clamped `dt`. This smooths the onset of click impulses
and gives the lattice a slightly elastic, fabric-like lag.

### Aurora light layer and dot fading

The engine draws two layers. Behind the dots sits a *light layer*: a sibling canvas
with one pixel per lattice cell, filled each frame from the same intensity and colour
values the dots use, then scaled and blurred by CSS (`auroraBlur`). On dark palettes it
is blended with `screen`, on light ones with `multiply`. `auroraGlow` sets its
brightness; `dotOpacity` fades the dot lattice, and at 0 the dot pass is skipped so the
result is a continuous aurora curtain. Because it reuses values already computed, the
layer adds no noise sampling cost.

### Rendering

Two passes on a single 2D context: core dots as `arc` fills, then additive glow
(`globalCompositeOperation = 'lighter'`) using pre-rendered radial-gradient
sprites, drawn only for particles above an intensity threshold. Sprites are
cheap compared with per-particle `shadowBlur`, which was avoided.

### Canvas 2D vs WebGL

Canvas 2D comfortably holds 60 fps for the ~2,500–4,000 dots a desktop viewport
needs at 28 px spacing. WebGL would allow much denser grids (10⁵ points), true
bloom, and moving the noise evaluation to the GPU, at the cost of shader code
and a less debuggable pipeline. The engine's data layout (flat typed arrays,
home/pos/intensity per particle) maps directly onto instanced point sprites if
that upgrade is ever wanted.
