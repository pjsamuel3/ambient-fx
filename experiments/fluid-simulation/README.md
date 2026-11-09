# Fluid Simulation

A real-time incompressible fluid on a coarse grid (Jos Stam's *stable fluids*),
rendered as palette-coloured dye. Drag to stir, click to burst, or watch the idle
flow fold the dye over itself.

## Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/experiments/fluid-simulation/>.

## How it works

Each frame, on a `cols × rows` grid (`cellSize` px, capped at `maxCells`):

1. **Forces.** A curl-noise potential (`ambientFlow`, `ambientScale`) is sampled
   on a 3-cell stride and its rotated gradient is added to the velocity, so the
   fluid keeps swirling when nobody is touching it. Three emitters drift about on
   their own noise paths releasing dye (`ambientDye`), each with a slowly
   changing palette position. Pointer motion splats velocity along its direction
   plus dye (`pointerForce`, `pointerDye`, `brushRadius`); clicks splat a radial
   burst.
2. **Vorticity confinement** (`vorticity`) re-injects small-scale rotation that
   the coarse grid would otherwise smear out, keeping the swirls crisp.
3. **Advect velocity** semi-Lagrangian with bilinear sampling, then damp it
   (`velocityDamping`).
4. **Project**: Jacobi pressure solve (`pressureIterations`) and subtract the
   pressure gradient so the field is divergence-free. Walls reflect the normal
   velocity component.
5. **Advect dye.** Density `d` and premultiplied colour `cd = colourT · d` are
   advected together and dissipated (`dyeFade`); at render time
   `colourT = cd / d`, so colours blend correctly where dyes meet.

Rendering writes `bg + (palette(colourT) − bg) · min(1, d · exposure)` into an
`ImageData`, lifting toward white (dark palettes) or deepening (light) where the
dye is over-exposed, then upscales with bilinear smoothing and a small CSS blur
(`softness`). 144×78 cells cost ~0.8 ms/frame at 1440×780.

Velocity is stored in cells/s; pointer velocity is clamped to ±3000 px/s so a
teleporting pointer cannot destabilise the solve.

## Colour

Shared palettes, hue/saturation, Dark/Light and Settings JSON. The pointer's dye
colour cycles slowly through the palette; the emitters each carry their own.
