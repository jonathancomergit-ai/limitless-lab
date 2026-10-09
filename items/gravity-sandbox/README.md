# Gravity Sandbox

Fling planets and stars around and watch them orbit, slingshot and crash. Real Newtonian gravity. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `gravity-sandbox` (= the folder name) |
| Wing | Lab |
| Save | preset, body size, speed, trail length, follow centre of mass |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Throw a body | Drag in space (longer = faster); a dotted line shows its path | Enter = into a circular orbit at the centre (on space) |
| Zoom | Pinch | + / - (or scroll the mouse wheel) |
| Pan | Two fingers, or Move view then drag | Arrow keys (on space; Shift = further) |
| Follow centre of mass | Follow centre | F |
| Play / Pause | Pause | P |
| Start again | Reset | R |
| Size of the next body | Moon / Planet / Star | 1 / 2 / 3 |
| Speed, trail length | Sliders | Tab + arrow keys |

## Reduced motion

- Starts paused, with a Play button.

## Smoke test

Drags out in empty space (a real touch drag on phone, a mouse drag on desktop) and checks the body count went up by one and time moved on. Desktop also presses Enter on space (another body) and `-` (zoom goes down).

## Notes

| File | What's in it |
|---|---|
| `physics.js` | Newton's gravity, leapfrog (kick-drift-kick), merges, energy, momentum, presets. No DOM. |
| `tests/unit/gravity-sandbox.test.js` | Circular orbit within 1% over 10 orbits, merge keeps momentum, energy within 0.5% on every preset, figure-8 returns, time-reversible. |

- Units: G = 1000, world units ≈ screen px at zoom 1, seconds. Fixed step 1/600 s.
- A tiny softening (0.5 units) stops the force blowing up at zero distance.
- Merges keep mass, momentum and volume (`r³` adds up). Energy drops on a crash (it's an inelastic collision), so the drift readout restarts from there.
- Figure-8: Chenciner & Montgomery's orbit, scaled by L = V = 150, so one lap takes about 6.3 s.
- Up to 80 bodies. Bodies are not saved, only the settings.
