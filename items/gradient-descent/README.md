# Gradient Descent Hill

Drop a ball on a hilly landscape and watch it roll to the bottom. It's how AI learns, one small step at a time. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `gradient-descent` (= the folder name) |
| Wing | Lab |
| Save | landscape, learning rate, speed, which racers are on, drop point |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Drop the balls | Tap or drag the map | Arrows move a cursor, Enter drops (on the map; Shift = bigger moves) |
| Play / Pause | Play | P |
| One step | Step | N |
| Race again | Restart | R |
| Learning rate | Slider (log scale) | `[` and `]` |
| Landscape | Bowl / Valley / Bumpy / Saddle | 1 to 4 |
| Racer on / off | Tap its card | Tab to it, Enter |

## The racers

| Racer | Colour | Rule each step |
|---|---|---|
| Plain GD | hot pink | `x ← x − lr·∇f` |
| Momentum | amber | `v ← 0.9·v + ∇f`, `x ← x − lr·v` |
| Adam | cyan | running averages of `∇f` and `∇f²` (β1 0.9, β2 0.999), bias-corrected |

## Reduced motion

- Starts paused, with a Play button.
- Runs at 8 steps a second instead of 30.

## Smoke test

Taps (phone) or clicks (desktop) high on the hillside, waits for 20+ steps, and checks every ball's loss is below where it was dropped. Desktop also drops with Arrows + Enter, and checks `]` raises the learning rate.

## Notes

| File | What's in it |
|---|---|
| `descent.js` | The four landscapes with hand-worked gradients, the three optimisers, marching squares. No DOM. |
| `tests/unit/gradient-descent.test.js` | Gradients vs a numerical check, Adam reaches the bowl's bottom, huge rate blows up, saddle trap, Rosenbrock race, contours. |

- The valley is Rosenbrock with `b = 10` (not 100), so one learning-rate slider works for all three racers.
- Picking a landscape resets the learning rate to one that suits it.
- Bowl: Plain GD blows up above lr 0.5 (the steep side has slope `4y`). Momentum lasts to about 0.95. Adam's steps are about `lr` long, so it never flies off, it just bounces.
- A race stops after 3000 steps, or when every ball has settled or blown up.
- The map colours are a log of the height, so gentle bottoms still show detail.
