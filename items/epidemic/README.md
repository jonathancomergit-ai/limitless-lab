# Epidemic Sim

Dots wander, meet and pass on a germ. Slide masks, vaccines and distancing and watch the curve flatten.

| | |
|---|---|
| Slug | `epidemic` (= the folder name) |
| Wing | Lab |
| Save | the six slider settings |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Make a dot sick | Tap it | I (a random dot) |
| Pause / Play | Pause button | P |
| New run (new dots) | Button | N |
| Compare (keep this curve, rerun same dots) | Button | C |
| Sliders: chance, days sick, vaccinated, masks, distancing, dots | Drag | Tab + arrows |

## Reduced motion

- Dots are a still grid of squares. Only their colours change.
- Starts paused, with a Play button. The chart still fills in.

## Smoke test

- Pauses, taps a healthy dot (touch / mouse). Sick count goes up by 1.
- Plays: days pass and the sick count changes by itself.
- Compare: a "last run" curve is kept.
- Desktop: `I` infects a random dot.

## Notes

| File | What's in it |
|---|---|
| `model.js` | Dots, movement, spread, recovery, history, seeded random. No DOM. |
| `tests/unit/epidemic.test.js` | 0% chance, same seed = same run, totals add up, flattening, vaccines, masks, recovery, tapping. |

- Box is 100 × 100. Dots move 6 units a day. Time step 0.05 days. 4 days pass per second.
- Contact circle: 2.5 units at 300 dots, scaled by √(300/n) so meetings per day stay about the same.
- Chance per contact per step = 1 − (1 − chance)^0.05. A mask halves it; two masks quarter it.
- Each dot has fixed random rolls for vaccine, mask and staying still. That makes sliders live and repeatable.
- The run starts with 3 sick dots. Compare reruns with the **same seed**, so differences come from the sliders.
