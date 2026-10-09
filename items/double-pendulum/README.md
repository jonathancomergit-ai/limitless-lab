# Double Pendulum Chaos

Start pendulums a tiny 0.001° apart and watch them end up doing totally different things. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `double-pendulum` (= the folder name) |
| Wing | Lab |
| Save | start angles, pendulum count, rod lengths, masses, gravity |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Set the start | Drag a bob | Left / Right = top rod, Up / Down = bottom rod (on the stage; Shift = 15°) |
| Play / Pause | Pause button | P, or Space on the stage |
| Start again | Reset | R |
| Random big swing | New start | N |
| Count, speed, lengths, masses, gravity | Sliders | Tab + arrow keys |

## Reduced motion

- Starts paused, with a Play button.
- Default speed 0.5× instead of 1×.
- No trails. The split ring doesn't pulse.

## Smoke test

Drags the lower bob to a new spot (real touch drag on phone, mouse on desktop) and checks the start angle changed. Presses Play, waits for over 1 s of sim time, and checks the first two pendulums' angles differ. Desktop also checks an arrow key nudges the start by 5°.

## Notes

| File | What's in it |
|---|---|
| `physics.js` | Exact equations of motion, RK4, energy, fixed-step clock, split test. No DOM. |
| `tests/unit/double-pendulum.test.js` | Energy within 0.5% over 10 s (4 setups), normal-mode check, determinism, split. |

- Fixed time step: 1/600 s, whatever the frame rate.
- Each pendulum starts 0.001° further round on the **top** rod.
- "Split apart" = the first two lower bobs are 5% of the full reach apart.
- With the default 150° / 150° start, they split at about 8.7 s.
- Energy is measured from the lowest spot each bob can reach, so it's never negative.
