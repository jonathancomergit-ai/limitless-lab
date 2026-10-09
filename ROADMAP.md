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

- [x] `gradient-descent` - Gradient Descent Hill: Drop a ball on a hilly landscape and watch it roll to the bottom. It's how AI learns, one small step at a time.
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
### Batch 3

Six more labs, in this order. Every one gets a "What's happening?" panel (4-6 bullets, plain words) and one "Try this" challenge.

- [x] `life-lab` - Life Lab: Draw some cells, hit play and watch patterns grow, crawl and explode. Then invent your own rules.
  - acceptance: Conway's Game of Life on a wrapping grid; tap/drag to draw cells (touch + mouse), erase mode; Play / Pause / Step / Clear / Random
  - acceptance: Speed slider; grid size scales to the screen; generation and population counters
  - acceptance: Presets: glider, glider gun, pulsar, R-pentomino, spaceship
  - acceptance: Rule editor: birth/survive checkboxes (B3/S23 notation shown), with presets HighLife, Seeds, Day & Night
  - acceptance: Pure rules in items/life-lab/life.js (step function, rule parser)
  - acceptance: Saves the board and rules; Export/Import works
  - acceptance: Reduced motion: slow default speed
  - acceptance: Unit test (tests/unit): a blinker flips back after 2 steps, a glider moves 1 cell diagonally after 4, the rule parser reads "B36/S23"
  - acceptance: smoke.js: draw cells, press Step, check the generation went up

- [x] `pathfinding` - Pathfinding Race: Draw walls and watch A*, Dijkstra and breadth-first search race to the goal.
  - acceptance: A grid; drag to draw/erase walls (touch + mouse); drag the start and goal markers
  - acceptance: Run A*, Dijkstra, BFS and greedy best-first side by side (or one at a time), each showing the cells it explored and its final path
  - acceptance: Readout per algorithm: cells explored, path length, time steps
  - acceptance: Presets: empty, maze (generated), spiral, "trap" (where greedy fails); optional "mud" cells that cost more
  - acceptance: Pure algorithms in items/pathfinding/search.js
  - acceptance: Saves the grid; Export/Import works
  - acceptance: Unit test (tests/unit): every algorithm finds a path when one exists and reports none when walled off; A* and Dijkstra find the same shortest length
  - acceptance: smoke.js: draw a wall, press Run, check a path length is shown

- [x] `epidemic` - Epidemic Sim: Dots wander, meet and pass on a germ. Slide masks, vaccines and distancing and watch the curve flatten.
  - acceptance: 100-1000 dots move around; colours for healthy, sick, recovered, vaccinated; tap to infect a dot
  - acceptance: Sliders: infection chance, days sick, % vaccinated, % masked, distancing (fewer moving dots)
  - acceptance: Live stacked chart of healthy / sick / recovered over time, with the peak marked
  - acceptance: A "compare" button that overlays the last run's curve, to see flattening
  - acceptance: Pure model in items/epidemic/model.js with a seeded random generator
  - acceptance: Saves settings; Export/Import works
  - acceptance: Reduced motion: dots shown as a still grid, chart only
  - acceptance: Unit test (tests/unit): with 0% infection chance nobody else gets sick; same seed gives the same run; totals always add up
  - acceptance: smoke.js: start a run, check the sick count changed

- [x] `light-lenses` - Light & Lenses: Drag lenses, mirrors and prisms around and watch light bend, focus and split into a rainbow.
  - acceptance: A light source (laser or lamp) and draggable, rotatable pieces: convex lens, concave lens, flat mirror, curved mirror, prism, glass block
  - acceptance: Ray tracing with Snell's law and reflection; total internal reflection shows up in the glass block
  - acceptance: White light through a prism splits into colours (refractive index changes with wavelength)
  - acceptance: Readout: angle in / angle out when you tap a surface; focal point marked for lenses
  - acceptance: Pure optics in items/light-lenses/optics.js
  - acceptance: Saves the layout; Export/Import works
  - acceptance: Unit test (tests/unit): Snell's law angles match known values, total internal reflection past the critical angle, a mirror reflects at equal angles
  - acceptance: smoke.js: drag a lens, check the ray path changed

- [ ] `k-means` - k-Means Clustering: Tap to drop dots and watch a computer sort them into groups by itself.
  - acceptance: Tap/drag to drop dots (touch + mouse); presets: 3 blobs, 5 blobs, smiley, uneven sizes
  - acceptance: Slider for k (2-8); Step shows the two moves (assign, then move the centres) one at a time; Play runs to the end
  - acceptance: Each group coloured, centres drawn as big markers with a trail of where they moved; the Voronoi regions shaded softly
  - acceptance: "Elbow" chart: total distance for k = 1..8, to show how to pick k
  - acceptance: Pure algorithm in items/k-means/kmeans.js with a seeded random start
  - acceptance: Saves dots and settings; Export/Import works
  - acceptance: Unit test (tests/unit): finds the obvious 3 groups on 3 far-apart blobs, total distance never goes up between steps
  - acceptance: smoke.js: load a preset, press Play, check the step count went up

- [ ] `sorting-race` - Sorting Race: Bubble, insertion, merge and quick sort race on the same bars, with sound.
  - acceptance: 2-4 lanes of bars, same shuffled start; algorithms: bubble, insertion, selection, merge, quick, heap
  - acceptance: Each lane shows compares and swaps live; highlight the bars being compared
  - acceptance: Sound on/off (pitch follows bar height, via Web Audio, off by default)
  - acceptance: Starting order presets: random, nearly sorted, reversed, few unique
  - acceptance: Pure algorithms in items/sorting-race/sorts.js as step generators
  - acceptance: Saves settings; Export/Import works
  - acceptance: Reduced motion: no flashing highlights
  - acceptance: Unit test (tests/unit): every algorithm sorts random, sorted, reversed and duplicate arrays correctly
  - acceptance: smoke.js: press Race, check the compare counter went up

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
