# Boids Flocking

Hundreds of birds following just three simple rules. Watch a flock appear out of nothing. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `boids` (= the folder name) |
| Wing | Lab |
| Save | the three rule weights, vision, top speed, bird count, the "one bird's view" toggle |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Drop a predator | Tap the sky | Arrows move a cursor, Enter (on the sky) |
| Draw a wall | Drag on the sky | Arrows, then W (on the sky) |
| Remove predators + walls | Clear | C |
| Show one bird's view | The toggle | V |
| Play / Pause | Pause | P |
| Scatter the birds | Scatter | S |
| Rule weights, vision, speed, count | Sliders | Tab + arrow keys |

## The rules

| Rule | Colour | Each bird steers... |
|---|---|---|
| Separation | hot pink | away from birds inside half its vision, harder the closer (`1/d`) |
| Alignment | amber | towards its neighbours' average velocity |
| Cohesion | green | towards its neighbours' centre |
| Flee | - | away from predators within 2× vision |
| Avoid | - | away from wall blobs it can see |

Steering is Reynolds-style: desired velocity = full speed in the rule's direction; steer = desired − current velocity, capped at a max force (2.5 × top speed per second), then times the slider weight.

## Reduced motion

- Starts paused, with a Play button.

## Smoke test

Lets it run and checks time and bird 0's distance flown went up. Sets Cohesion to 0 (tap at the slider's left end on phone, Home key on desktop) and checks the setting applied and the sim still runs. Taps / clicks the sky and checks a predator appeared. Desktop: V turns on the bird's view, C clears.

## Notes

| File | What's in it |
|---|---|
| `flock.js` | The rules, steering, spatial grid, step, predators, the "lined up" score. No DOM. |
| `tests/unit/boids.test.js` | Each rule's direction on hand-made setups, grid = brute force, wrap, a flock lines up. |

- The world wraps round (off the right edge, back on the left).
- The spatial grid uses cells the size of the vision radius, so each bird only checks 9 cells.
- Phones (or screens under 700 px) start with 150 birds, others 300.
- Birds see all the way round (360°); Reynolds' original gave them a blind spot behind.
- "Lined up" is the polarisation order parameter: the length of the average heading, 0 to 100%.
- Walls and predators are not saved.
