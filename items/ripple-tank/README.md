# Ripple Tank

Tap the water to make waves. Build walls and slits and watch the waves interfere, just like light. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `ripple-tank` (= the folder name) |
| Wing | Lab |
| Save | preset, frequency, tool, and any walls you drew |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Make a drop | Drop tool, tap (drag = a trail of drops) | `1`, then Space (on the stage) |
| Draw a wall | Wall tool, drag | `2`, Space = pen down/up, arrows draw |
| Rub out a wall | Eraser tool, drag | `3`, Space = pen down/up, arrows rub |
| Move the cursor | - | Arrows (Shift = faster) |
| Presets | Buttons | Tab to them, Enter |
| Wave frequency | Slider | Tab + arrow keys |
| Pause / Play | Pause button | P |
| Calm water / Clear all | Buttons | C / X |

## Reduced motion

- Starts paused, with a Play button.
- The first ~1.7 s is run straight away, so the still picture already shows the pattern.
- Runs at half speed.

## Smoke test

- Pauses, then taps the water (touch on phone, mouse on desktop).
- Checks the drop count went up and the wave grid changed.
- Presses Play: time moves on and the grid keeps changing.
- Desktop: `2`, Space, arrows, Space draws a wall (wall count goes up); `1` + Space drops.

## Notes

| File | What's in it |
|---|---|
| `physics.js` | Wave equation step, drops, walls, sources, presets, the "screen", wall save format. No DOM. |
| `tests/unit/ripple-tank.test.js` | Stability limit, no blow-up, blow-up past the limit, symmetry, wave speed, wavelength, walls, fringes. |

- Scheme: leapfrog finite differences, `u_next = 2u - u_prev + C²·lap(u)`, 5-point Laplacian.
- Courant number **C = 0.5**. The 2D stability limit is 1/√2 ≈ 0.707.
- 360 steps per second at 1× speed. Wavelength = 0.5 × 360 / f cells (18 cells at 10 Hz).
- Damping: 0.12% per step everywhere, plus a 14-cell "sponge" border so edges don't echo.
- Walls are cells held at 0 (they reflect). Sources are cells driven as a sine wave, faded in over one period.
- Grid: about 36k cells on phones, 64k on desktop. Up to 12 steps per frame.
- The screen strip is a running average of u² down one column near the right edge.
