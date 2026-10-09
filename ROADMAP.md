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

- [x] `neural-playground` - Neural Net Playground: Drop red and blue dots and watch a tiny neural network learn to tell them apart, live.
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

### Batch 2

- [ ] `gradient-descent` - Gradient Descent Hill: Drop a ball on a hilly landscape and watch it roll to the bottom. It's how AI learns, one small step at a time.
  - acceptance: A 2D landscape drawn as a contour heatmap; presets: bowl, long valley (Rosenbrock), bumpy (many dips), saddle
  - acceptance: Tap to drop a ball; race optimisers side by side: plain gradient descent, momentum and Adam, each its own colour with a trail
  - acceptance: Learning-rate slider (log scale) that shows overshooting and blowing up when too big
  - acceptance: Loss-over-steps chart and a step counter
  - acceptance: "What's happening?" panel + one "Try this" challenge; link to the Neural Net Playground
  - acceptance: Unit test (tests/unit): gradients match a numerical check, Adam reaches the bowl's bottom, a huge learning rate diverges
  - acceptance: smoke.js: drop a ball, check it moved downhill (loss went down)

- [x] `boids` - Boids Flocking: Hundreds of birds following just three simple rules. Watch a flock appear out of nothing.
  - acceptance: Reynolds' three rules: separation, alignment, cohesion, each with a slider; plus vision radius and speed
  - acceptance: 50 to 600 boids; a spatial grid keeps it smooth; fewer boids by default on phones
  - acceptance: Tap/click to drop a predator the flock flees; drag to draw obstacles; Clear
  - acceptance: Toggle to show one boid's vision circle and the three forces on it as arrows
  - acceptance: "What's happening?" panel + one "Try this" challenge (e.g. turn off cohesion)
  - acceptance: Unit test (tests/unit): each rule gives the expected direction on small hand-made setups
  - acceptance: smoke.js: let it run, change a slider, check the boids moved and the setting applied

- [x] `gravity-sandbox` - Gravity Sandbox: Fling planets and stars around and watch them orbit, slingshot and crash. Real Newtonian gravity.
  - acceptance: Drag to throw a new body (drag length = speed); pick its size
  - acceptance: Presets: sun and planets, binary stars, the figure-8 three-body orbit, a planet with moons
  - acceptance: A symplectic integrator (velocity Verlet / leapfrog) so orbits stay stable; collisions merge bodies and keep momentum
  - acceptance: Trails, pinch / scroll zoom, drag to pan, follow the centre of mass
  - acceptance: Readout: total energy and momentum
  - acceptance: "What's happening?" panel + one "Try this" challenge
  - acceptance: Unit test (tests/unit): a circular orbit keeps its radius within 1% over 10 orbits; a merge conserves momentum
  - acceptance: smoke.js: throw a body, check the body count went up and time advanced

- [x] `ripple-tank` - Ripple Tank: Tap the water to make waves. Build walls and slits and watch the waves interfere, just like light.
  - acceptance: 2D wave equation on a grid (finite differences) with gentle damping, drawn as a colour map
  - acceptance: Tap = a drop; drag = draw walls; tools: drop, wall, eraser
  - acceptance: Presets: single drop, two sources (interference), double slit, a wall with a gap
  - acceptance: Wave source frequency slider; Pause / Clear
  - acceptance: "What's happening?" panel + one "Try this" challenge (connect it to light and the double-slit experiment)
  - acceptance: Unit test (tests/unit): the time step respects the stability limit (no blow-up over many steps), and a centred drop stays symmetric
  - acceptance: smoke.js: tap the water, check the wave grid changed

- [x] `fractal-zoom` - Fractal Zoom: Dive into the Mandelbrot set. Zoom forever into shapes that never repeat, then jump to matching Julia sets.
  - acceptance: Mandelbrot with smooth colouring from the palette CSS variables
  - acceptance: Pinch / scroll to zoom, drag to pan, double-tap to zoom in; keyboard: arrows pan, +/- zoom
  - acceptance: Rendered in Web Workers in tiles, coarse first then sharp, so it never freezes
  - acceptance: Iterations rise with zoom (with a slider); show the zoom level and explain the ~10^13 precision limit when reached
  - acceptance: Tap a spot with Julia mode on to see that point's Julia set
  - acceptance: Bookmarks: save favourite spots on the device; Export/Import works
  - acceptance: "What's happening?" panel + one "Try this" challenge
  - acceptance: Unit test (tests/unit): known points inside / outside the set, and the smooth escape value
  - acceptance: smoke.js: zoom in, check the zoom level changed and the canvas re-rendered
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
