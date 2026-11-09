# Original brief — Aurora Particles (verbatim)

> Saved so the work can be recreated from scratch. This is the prompt that produced
> `experiments/aurora-particles/` and the shared noise module. Later requests are in
> `02-gradient-and-palettes.md` and `03-aurora-light-layer.md`. Implementation notes that
> complement these prompts are in `../rebuild-notes.md`.

## Clarifications for an implementing agent

The brief below is already well specified. A few points that needed interpreting:

- **Repository name.** The brief's tree says `ambient-lab/`; the actual repository is
  `ambient-fx/`. Use the real repository name. Only build the experiments that have been
  requested (see the other prompt files); the other folders in the tree are placeholders.
- **"Suggested initial parameters" are starting points, not constraints.** Base opacity was
  raised to 0.2 after testing because 0.15 made the lattice invisible on the background.
- **The ripple pseudocode is illustrative.** Its `sin(d·f − t·s)·exp(−d·k)` form makes the
  whole field respond instantly. The requirement that matters is the sentence after it:
  "the wave front travels visibly outwards". A travelling Gaussian pulse satisfies this.
- **"Most of the perceived animation should come from brightness and radius"** means
  position displacement stays around ±6 px and brightness/radius carry the effect.
- **Canvas 2D first; WebGL only if explained.** Canvas 2D was sufficient.
- **Pointer capture through overlaid content** means: listen on `window`, make the
  background wrapper `pointer-events: none`.

---

## The brief as written

# Build an Interactive Aurora Particle Background

## Structure

```
ambient-lab/
├── README.md
├── experiments/
│   ├── aurora-particles/
│   ├── ripple-grid/
│   ├── flowing-gradient/
│   ├── particle-field/
│   ├── fluid-simulation/
│   └── noise-waves/
├── shared/
│   ├── noise/
│   ├── physics/
│   └── rendering/
└── gallery/
```

## Objective

Create a visually sophisticated, interactive, animated background for a modern technology website.

The visual effect should combine:

- A precise, evenly spaced lattice of small glowing dots.
- Slowly travelling, organic, aurora-like waves.
- Smooth particle displacement and brightness modulation.
- Mouse-generated ripples that propagate through the particle field.
- Subtle spring physics that return particles to their original positions.

**The overall effect should resemble a living, flexible fabric of light, rather than a conventional particle screensaver.**

Take inspiration from ChatGPT's animated loading background, where waves appear to travel through a grid of dots, but develop a more fluid, atmospheric and aurora-inspired interpretation.

## 1. Visual Design

### Background

Use a near-black background (`#080B12`) with a subtle deep-blue atmospheric quality.

The background should feel elegant, premium and suitable for an enterprise AI or financial technology company.

Avoid excessive visual noise, bright rainbow gradients or aggressive animation.

### Particle Lattice

Create a uniformly spaced grid of circular particles.

Suggested initial parameters:

| Parameter | Starting value |
|---|---|
| Grid spacing | 28 px |
| Base particle radius | 1.2 px |
| Maximum particle radius | 3.5 px |
| Base opacity | 0.15 |
| Maximum opacity | 0.9 |
| Position displacement | ±6 px |
| Target frame rate | 60 FPS |

Particle positions must originate from fixed home coordinates.

The animation should preserve the underlying grid structure while allowing fluid local deformation.

### Colour Palette

Use a restrained aurora palette:

- Deep blue: `#173B75`
- Electric cyan: `#39C9ED`
- Turquoise: `#30D5B0`
- Soft violet: `#8864D8`

Most particles should remain faint.

Brighter colours should appear primarily within the moving aurora waves.

Use restrained glow around high-intensity particles.

## 2. Ambient Aurora Animation

Implement a continuous, slowly evolving displacement field using coherent noise, such as Simplex or Perlin noise.

Neighbouring particles must respond similarly to the field, creating smooth, connected movement rather than random jitter.

The animation should include broad, gently curving aurora bands that drift across the screen.

Use the field to modulate:

1. Horizontal displacement.
2. Vertical displacement.
3. Particle radius.
4. Particle brightness and opacity.
5. Colour interpolation.

The aurora should appear to flow organically through the particles.

Avoid making the entire grid oscillate uniformly.

Use layered noise at different spatial frequencies and speeds to create natural complexity.

**Important:** Most of the perceived animation should come from changing particle brightness and radius, with position displacement kept relatively subtle.

## 3. Mouse Interaction: Fluid Ripples

The mouse should behave as though it is disturbing a flexible, water-like surface.

### Pointer Movement

Moving the cursor across the canvas should inject wave energy into the particle field.

Ripples should:

- Originate from the current pointer position.
- Propagate radially outwards.
- Cause local particle displacement.
- Briefly increase particle brightness and radius.
- Gradually lose energy through damping.
- Interact naturally with the underlying aurora animation.

Do not implement simple particle repulsion or attraction.

Instead, approximate a damped travelling wave:

```javascript
const distance = Math.hypot(
  particle.homeX - ripple.x,
  particle.homeY - ripple.y
);

const wave = Math.sin(
  distance * frequency - elapsedTime * speed
);

const attenuation = Math.exp(
  -distance * spatialDamping
);

const displacement =
  wave * attenuation * ripple.strength;
```

Use the radial direction to convert the resulting amplitude into X/Y displacement.

Ensure the wave front travels visibly outwards rather than the entire particle field responding instantaneously.

### Mouse Velocity

The strength of the disturbance should depend on cursor velocity.

Slow movement should produce subtle ripples.

Fast movement should produce larger, more energetic waves.

Limit maximum displacement to prevent visual instability.

### Mouse Click

A mouse click should generate a stronger circular impulse, resembling a stone dropped into still water.

The expanding wave should remain visible briefly before fading into the ambient animation.

Support multiple simultaneous ripples.

### Settling Behaviour

Use spring-like damping or equivalent smoothing so particles return naturally towards their underlying animated positions.

Avoid snapping, jitter or abrupt changes.

## 4. Physics and Animation Model

Conceptually, each particle's final state should be calculated from:

```javascript
finalPosition =
  homePosition +
  auroraDisplacement +
  rippleDisplacement;
```

Its visual appearance should be determined by:

```javascript
radius =
  baseRadius +
  auroraIntensity * radiusVariation +
  rippleIntensity * rippleRadiusBoost;

opacity =
  baseOpacity +
  auroraIntensity * brightnessVariation +
  rippleIntensity * rippleBrightnessBoost;
```

Use smooth interpolation and clamp values to safe ranges.

Ripple propagation should use elapsed time in seconds rather than frame counts.

Use a radial wave equation or a visually convincing damped-wave approximation.

Prevent excessive energy accumulation when several waves overlap.

## 5. Rendering and Performance

Prefer HTML Canvas 2D for the initial implementation.

Use:

- `requestAnimationFrame`
- Device-pixel-ratio-aware rendering
- Canvas resizing with `ResizeObserver`
- Pointer Events
- Delta-time-based animation
- Efficient particle storage and updates

Performance requirements:

- Target 60 FPS on modern desktop hardware.
- Avoid unnecessary object allocation inside animation loops.
- Limit active ripple count and remove expired ripples.
- Avoid expensive per-particle shadows if they significantly affect performance.
- Adapt particle density for mobile devices.
- Pause rendering when the page is hidden.
- Respect `prefers-reduced-motion`.

Keep the implementation framework-independent where practical.

If WebGL would offer a material improvement, explain the trade-off, but implement a working Canvas version first.

## 6. Website Integration

The animation should function as a reusable full-viewport website background.

Requirements:

- Canvas positioned behind normal HTML content.
- No interference with buttons, links or text selection.
- Pointer movement captured appropriately even when content overlays the canvas.
- Responsive across desktop and mobile screens.
- No unwanted scrolling or layout shifts.
- Suitable for use as a hero-section or entire-page background.
- Configurable opacity so foreground text remains readable.

Separate the rendering engine from the page layout so it can later be incorporated into React, Next.js or another frontend framework.

## 7. Interactive Configuration Panel

For the initial prototype, include a small collapsible control panel that allows experimentation with:

| Control | Purpose |
|---|---|
| Grid spacing | Particle density |
| Base particle size | Dot radius |
| Aurora intensity | Brightness and colour strength |
| Aurora speed | Ambient flow speed |
| Aurora scale | Width and complexity of waves |
| Displacement | Amount of particle movement |
| Ripple strength | Mouse interaction intensity |
| Ripple speed | Outward wave propagation |
| Ripple damping | Rate of ripple decay |
| Glow intensity | Particle halo strength |

Include a **Reset to defaults** button and a pause/resume control.

Keep the controls separate from the visual rendering area.

## 8. Desired Aesthetic

Aim for the following qualities:

**Elegant.** The animation should feel appropriate for a premium technology product.

**Organic.** The motion should resemble atmospheric light, water or flexible fabric.

**Responsive.** Cursor interactions should feel immediate and physically connected to the dots.

**Subtle.** The background should support foreground content rather than dominate it.

**Continuous.** Aurora waves should evolve indefinitely without obvious repetitive loops.

**Fluid.** Motion should not appear mechanical, noisy or erratic.

Avoid:

- Randomly wandering particles.
- Conventional particle attraction/repulsion demos.
- Bouncing dots.
- Uniform sine-wave oscillation across the entire grid.
- Excessive blur or bloom.
- Rapid flashing.
- Strong rainbow gradients.
- Noticeable animation loops.

## 9. Deliverables

Build a complete working prototype, not just pseudocode.

Provide:

1. A runnable web page with the animated background.
2. All required HTML, CSS and JavaScript.
3. A working configuration panel.
4. Responsive mouse and click interactions.
5. Clear instructions for running locally.
6. A brief explanation of the rendering and wave algorithms.

Use the existing project's conventions if working inside a repository. Otherwise, create a minimal implementation without unnecessary dependencies.

## 10. Acceptance Criteria

The implementation is successful when:

- The initial screen shows a coherent, evenly spaced particle grid.
- Slow, visibly curved aurora waves continuously travel across the grid.
- Particles within these waves brighten, grow and shift subtly.
- Moving the mouse generates expanding disturbances, not simply local repulsion.
- Clicking produces a clearly visible circular ripple.
- Multiple ripples can coexist and dissipate smoothly.
- The underlying aurora continues independently of mouse interaction.
- The animation remains visually attractive without any user interaction.
- The prototype runs smoothly on a modern desktop browser.
- The result is suitable for adaptation into a production website.

## Implementation Approach

Build in three stages:

**Stage 1 — Particle lattice and aurora**

Implement the grid, coherent noise, moving aurora bands, brightness modulation and smooth displacement.

**Stage 2 — Interactive wave physics**

Add mouse-triggered ripples, cursor velocity sensitivity, click impulses and damping.

**Stage 3 — Refinement**

Add the control panel, optimise rendering, improve colour blending and refine the visual aesthetic.

After implementation, assess whether the result genuinely resembles an atmospheric aurora passing through a deformable lattice.

Prioritise visual quality and natural movement over adding features.

**Begin by implementing the working prototype and then refine the effect. Do not stop at an architectural proposal.**
