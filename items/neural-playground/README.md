# Neural Net Playground

Drop red and blue dots and watch a tiny neural network learn to tell them apart, live. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `neural-playground` (= the folder name) |
| Wing | Lab |
| Save | the dots, colour pick, layers, neurons, activation, learning rate, seed |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Add a dot | Tap the plot | Focus the plot, arrows, then Enter |
| Remove a dot | Tap the dot | Enter on it |
| Swap colour | Red dot / Blue dot | C |
| Play / Pause | Play | P |
| One step | Step | N |
| New random start | Reset | R |
| Load a preset | Blobs / Circle / XOR / Spiral | Tab + Enter |

## Reduced motion

Starts paused, with the Play button ready. Nothing else moves on its own.

## Smoke test

Resets the weights, adds a blue dot (tap on phone, keyboard cursor on desktop), presses Play (tap / P key), then checks the dot count went up, epochs ran and the loss dropped by at least 30%.

## Notes

| File | What's in it |
|---|---|
| `net.js` | The MLP: seeded init, forward pass, backprop, cross-entropy, Adam. No DOM. |
| `data.js` | The four seeded presets. |
| `contour.js` | Marching squares for the bright decision line. |
| `tests/unit/neural-playground.test.js` | Gradient check vs finite differences, XOR loss < 0.1, same seed = same run. |

- Output is one sigmoid neuron: the chance a spot is blue.
- The heatmap is worked out on a 50 x 50 grid, then scaled up smoothly.
- Each neuron in the diagram shows its own little map of the plot.
- Training runs 3 epochs a frame, capped at 7 ms, through `kit/loop.js` (pauses when the tab is hidden).
