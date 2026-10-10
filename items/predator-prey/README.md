# Predator & Prey

Rabbits eat grass, foxes eat rabbits. Watch the two populations boom and crash in waves, then try to make them live together.

| | |
|---|---|
| Slug | `predator-prey` (= the folder name) |
| Wing | Lab |
| Save | the five slider settings, Equations mode on/off, speed |
| Added | 2026-10-10 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Drop rabbits / foxes | Pick one, tap the field | R / F (random spot) |
| Play / Pause | Play button | P |
| New run (new luck, same sliders) | Button | N |
| Speed 1× / 2× / 4× | Button | S |
| Equations mode | The toggle | E |
| Presets: steady cycles, foxes die out, everything crashes | Buttons | 1 / 2 / 3 |
| Sliders: rabbit + fox births, rabbit + fox hunger limits, grass regrowth | Drag | Tab + arrows |

## Reduced motion

- Starts paused, with a Play button (the Lab rule).
- Nothing flashes or shakes. The charts draw only as days pass.

## Smoke test

- Pauses, taps the field (touch / mouse). Rabbits go up.
- Plays: 20+ days pass and the populations change by themselves.
- Equations mode: the maths run starts and advances.
- The "Everything crashes" preset sets the fox hunger slider to 30.
- Desktop: `F` drops foxes, `S` changes the speed.

## Notes

| File | What's in it |
|---|---|
| `model.js` | Grass, rabbits, foxes, the Lotka-Volterra equations, seeded random. No DOM. |
| `tests/unit/predator-prey.test.js` | LV conserved quantity within 1% over 10 cycles, a fox with no food starves at its hunger limit, same seed = same run, each preset tells its story. |

**The agents** (one step = one day, field 100 × 100, wraps at the edges)

- Grass: 50 × 50 patches. An eaten patch grows back with chance 1/regrow per day.
- Rabbits wander (speed 1). A hungry rabbit on grass eats it.
- Foxes wander (speed 1.5), chase the nearest rabbit within 7, eat one within 1.6.
- Fed recently (hunger under half the limit)? Then a birth chance each day.
- **A baby starts as hungry as its parent.** No free meals, so a family that never eats dies at the hunger limit.
- Caps: 4,000 rabbits, 1,000 foxes (keeps phones smooth).

**Presets** (all start 300 rabbits, 30 foxes, seed 7)

| Preset | Rabbit births | Fox births | Rabbit hunger | Fox hunger | Regrow |
|---|---|---|---|---|---|
| Steady cycles | 15% | 4% | 10 | 10 | 25 |
| Foxes die out | 15% | 4% | 10 | 4 | 60 |
| Everything crashes | 15% | 10% | 10 | 30 | 25 |

- Steady cycles was tuned by a grid search: 8 of 8 seeds survive 3,000 days, waves every ~150 days.

**The equations** (Lotka-Volterra)

- R' = aR − bRF, F' = dRF − gF.
- a = rabbit births × 0.75, b = 2 × sight × fox speed / field area, d = b × cubs per meal, g = 1 / fox hunger.
- A rough match, not a fit. No grass, no space, no luck: that's what you're comparing.
- Leapfrog (Störmer-Verlet) in log space, step 0.05 days. In log space LV is a separable Hamiltonian, so V = dR − g ln R + bF − a ln F stays put.
- It starts from the agents' numbers when you turn it on, change a slider, or start a run.
