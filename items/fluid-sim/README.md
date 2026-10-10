# Fluid Sim

Stir smoke and ink with your finger and watch it swirl, curl and mix. Real fluid equations (Navier-Stokes, "stable fluids"), running live in plain JS. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `fluid-sim` (= the folder name) |
| Wing | Lab |
| Save | preset, viscosity, dye fade, swirl, ink colour, arrows/pressure toggles, tool |
| Added | 2026-10-10 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Stir | Stir tool, drag (each finger = its own stream) | `1`, then arrows (on the tank) |
| Drop a blob of ink | Stir tool, tap | Space (on the tank) |
| Draw a wall | Wall tool, drag | `2`, Space = pen down/up, arrows draw |
| Rub out a wall | Eraser tool, drag | `3`, Space = pen down/up, arrows rub |
| Ink colour | Colour buttons (Rainbow or 6 colours) | `C` = next colour |
| Presets | Two jets / Rising smoke / Wind + ball | Tab to them, Enter |
| Viscosity, dye fade, swirl | Sliders | Tab + arrow keys |
| Velocity arrows / pressure view | Toggles | `V` / `H` |
| Pause / Play | Pause button | `P` |
| Clear ink / Clear all | Buttons | `I` / `X` |

## Reduced motion

- Starts paused, with a Play button.
- The first ~1 s is run straight away, so the still picture already has ink in it.
- Runs at half speed.

## Smoke test

- Pauses, presses Clear all: dye and speed are 0.
- Drags across the tank: **two fingers at once** on the phone (real touch events), the mouse on desktop.
- Checks dye and speed went up (and 2 streams on the phone).
- Presses Play: time moves on, the ink is still there.
- Desktop: arrows stir, `2` + Space + arrows + Space draws a wall, `V` turns the arrows on.

## Notes

| File | What's in it |
|---|---|
| `fluid.js` | The solver: sources, vorticity, buoyancy, diffusion, projection, advection, walls, presets, resampling. No DOM. |
| `tests/unit/fluid-sim.test.js` | Divergence ~0 after projection (also round walls), dye kept within 1%, dye moves with the flow, fade rate, dry walls, viscosity, presets stay finite, resize. |

- Grid: **staggered (MAC)**: speeds live on cell edges, dye and pressure in cells. Projection is then exact (divergence → 0).
- Pressure: red-black Gauss-Seidel with over-relaxation (ω = 1.8), 24 sweeps, warm-started. Drops to 18 / 12 sweeps if a step is slow.
- Advection: semi-Lagrangian, RK2 backtrace, bilinear. Wall corners are left out of the blend.
- Dye: semi-Lagrangian leaks ~1%/s in a swirl, so each step puts the leak back in proportion (not for the wind preset, where dye leaves through the exit).
- Swirl = vorticity confinement. Smoke = buoyancy (dye floats up).
- Grid: ~8,500 cells on phones, ~16,000 on desktop. 60 steps a second, up to 2 per frame. ~4 ms a step on the phone grid (laptop CPU).
- Drawn into an ImageData one pixel per cell, then scaled up smoothly. Dye glows: `1 - e^(-1.8 d)` per channel.
- Wind preset: left edge blows in, right edge is an open exit (pressure 0).
