# ROADMAP

What to build next, in order. **Take the top unticked line.**

- One line = one item = one PR.
- Tick it (`[x]`) in the same PR that adds the item.
- Every item also has to meet the rules in `CLAUDE.md` (phone test, privacy, saves).

## How to read a line

```
- [ ] `slug` - one-line pitch
  - acceptance: thing that must be true
  - acceptance: another thing
```

## Up next

Tonight's three for 🔬 Lab, in this order.

- [ ] `neural-playground` - Neural Net Playground: Drop red and blue dots and watch a tiny neural network learn to tell them apart, live.
  - acceptance: Tap/click the plot to add a dot; a toggle picks red or blue; presets: two blobs, circle, XOR, spiral; Clear
  - acceptance: A small neural network written in plain JS in items/neural-playground/net.js (no libraries): 1-3 hidden layers, 1-8 neurons each, tanh/ReLU/sigmoid, learning rate slider
  - acceptance: Play / Pause / Step / Reset; shows epoch and loss, with a small loss chart
  - acceptance: Live decision boundary drawn as a soft red/blue heatmap behind the dots
  - acceptance: Network diagram: neurons as circles, weights as lines coloured by sign and thick by size
  - acceptance: A short "What's happening?" panel for students: 4-6 bullets, plain words
  - acceptance: Saves the dot set and settings; Export/Import works
  - acceptance: Unit test (tests/unit): gradients match a numerical check, and training on XOR gets loss under 0.1
  - acceptance: smoke.js: add a dot, press Play, check the loss went down

- [x] `fourier-draw` - Fourier Draw: Draw any shape with your finger, then watch spinning circles redraw it. That's a Fourier series.
  - acceptance: Draw a path with touch or mouse; it's resampled to evenly spaced points
  - acceptance: Discrete Fourier transform in plain JS (items/fourier-draw/dft.js); circles sorted biggest first
  - acceptance: Circles chain tip-to-tip and trace the drawing; slider for how many circles (1 to all); speed slider
  - acceptance: Presets: heart, star, music note, so there's something to see before drawing
  - acceptance: A short "What's happening?" panel: 4-6 bullets, plain words
  - acceptance: Saves the last drawing and settings; Export/Import works
  - acceptance: Reduced motion: slower, with no fading trail
  - acceptance: Unit test (tests/unit): DFT then inverse gives back the original points
  - acceptance: smoke.js: draw a stroke, check the number of circles is above 0 and the trace is running

- [x] `double-pendulum` - Double Pendulum Chaos: Start two pendulums a tiny 0.001° apart and watch them end up doing totally different things.
  - acceptance: Exact double-pendulum equations, RK4 integrator with a fixed time step (items/double-pendulum/physics.js)
  - acceptance: 2 to 10 pendulums, each started 0.001° apart, each its own colour, with fading trails
  - acceptance: Drag a bob to set the start angle (touch + mouse); sliders: count, lengths, masses, gravity; Play/Pause/Reset
  - acceptance: Readout: total energy (to show the simulation is honest) and time until the pendulums visibly split apart
  - acceptance: A short "What's happening?" panel: sensitive dependence on starting conditions, in plain words
  - acceptance: Saves settings; Export/Import works
  - acceptance: Reduced motion: no trails, slower default speed
  - acceptance: Unit test (tests/unit): energy stays within 0.5% over 10 simulated seconds
  - acceptance: smoke.js: let it run, check time advanced and the first two pendulums' angles differ

## Ideas (not ready yet)

- (add more here)

---

## Example lines, per wing

### 🎮 Arcade

- [ ] `snake-360` - snake that fits a phone held in one hand
  - acceptance: swipe on the stage AND arrow keys both steer
  - acceptance: on-screen pad shows on touch screens only
  - acceptance: best length saves; Export/Import works
  - acceptance: smoke.js: start, turn twice, length or score changes

### 🔬 Lab

- [ ] `pendulum` - drag a pendulum and watch energy swap between height and speed
  - acceptance: live energy bars (kinetic / potential)
  - acceptance: reduced motion: starts paused with a Play button
  - acceptance: a "what's going on" panel in 5 short bullets
  - acceptance: smoke.js: drag the bob, press Play, angle changes

### 🧰 Workshop

- [ ] `image-shrink` - make images smaller, entirely in your browser
  - acceptance: pick or drop a file; nothing is uploaded (no new origins)
  - acceptance: shows before/after size in a table
  - acceptance: download button gives the new file
  - acceptance: smoke.js: load a tiny test image, output is smaller
