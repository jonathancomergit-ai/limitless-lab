/* ============================================================
   Ripple Tank - the physics, unit tested. No DOM.

   The 2D wave equation   d²u/dt² = c² (d²u/dx² + d²u/dy²)
   on a grid of cells, with finite differences ("leapfrog"):

     u_next = 2u - u_prev + C² · lap(u)

   lap(u) = left + right + up + down - 4·centre   (5-point stencil)
   C      = c·dt/dx, the Courant number.

   Stability: in 2D this scheme only stays bounded when
   C ≤ 1/√2 (the CFL limit). We use C = 0.5, well inside it.

   Extras, each one small:
   - gentle damping everywhere, so the tank calms down
   - a "sponge" border that soaks up waves, so the edges
     act like open water instead of mirrors
   - walls: cells held at u = 0, which reflect waves
   - sources: cells pushed up and down as a sine wave
   ============================================================ */

export const STABILITY_LIMIT = 1 / Math.SQRT2;   // biggest safe Courant number in 2D
export const COURANT = 0.5;                       // what we use
export const STEPS_PER_SECOND = 360;              // sim steps per real second at 1× speed
export const DAMPING = 0.0012;                    // per step, everywhere
export const SPONGE_CELLS = 14;                   // width of the soaking border
export const SPONGE_MAX = 0.16;                   // damping at the very edge

/* ---- the tank ------------------------------------------- */

/* A tank `cols` wide and `rows` tall. Plain typed arrays, row by row:
   cell (x, y) lives at index y * cols + x. */
export function createTank(cols, rows, { courant = COURANT, damping = DAMPING, sponge = SPONGE_CELLS, spongeMax = SPONGE_MAX } = {}) {
  const n = cols * rows;
  const tank = {
    cols,
    rows,
    courant,
    u: new Float32Array(n),       // height now
    prev: new Float32Array(n),    // height one step ago
    next: new Float32Array(n),    // scratch for the step
    wall: new Uint8Array(n),      // 1 = wall
    damp: new Float32Array(n),    // damping per cell (base + sponge)
    sources: [],                  // { x, y, phase } in cells
    t: 0,                         // steps taken
    freq: 10,                     // source frequency, in Hz at 1× speed
    amp: 1
  };
  /* Damping rises smoothly (quadratic) towards every edge. */
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const edge = Math.min(x, y, cols - 1 - x, rows - 1 - y);
      const s = sponge > 0 ? Math.max(0, (sponge - edge) / sponge) : 0;
      tank.damp[y * cols + x] = damping + spongeMax * s * s;
    }
  }
  return tank;
}

/* Wavelength in cells for a source frequency (Hz at 1× speed).
   The wave moves C cells per step, so λ = C · steps per period. */
export function wavelength(freq, courant = COURANT) {
  return (courant * STEPS_PER_SECOND) / freq;
}

/* One time step. The outer ring of cells is always 0 (a fixed rim
   hidden under the sponge), so the stencil never reads outside. */
export function step(tank) {
  const { cols, rows, u, prev, next, wall, damp } = tank;
  const c2 = tank.courant * tank.courant;

  for (let y = 1; y < rows - 1; y++) {
    let i = y * cols + 1;
    for (let x = 1; x < cols - 1; x++, i++) {
      if (wall[i]) { next[i] = 0; continue; }
      const lap = (u[i - 1] + u[i + 1]) + (u[i - cols] + u[i + cols]) - 4 * u[i];
      const d = damp[i];
      /* Damping slows the velocity (u - prev) by a factor (1 - d). */
      next[i] = (2 - d) * u[i] - (1 - d) * prev[i] + c2 * lap;
    }
  }

  /* Sources: driven up and down, faded in over the first period
     so they start smoothly instead of with a jolt. */
  tank.t += 1;
  if (tank.sources.length) {
    const w = (2 * Math.PI * tank.freq) / STEPS_PER_SECOND;
    for (const s of tank.sources) {
      const age = tank.t - (s.born || 0);
      const ramp = Math.min(1, (age * tank.freq) / STEPS_PER_SECOND);
      const i = s.y * cols + s.x;
      if (!wall[i]) { next[i] = tank.amp * ramp * Math.sin(w * age + (s.phase || 0)); }
    }
  }

  /* Rotate the three buffers: prev <- u <- next. */
  tank.prev = u;
  tank.u = next;
  tank.next = prev;
}

/* Run n steps. */
export function run(tank, n) {
  for (let k = 0; k < n; k++) { step(tank); }
}

/* ---- things you do to the water ---------------------------- */

/* A drop: a smooth round bump (a Gaussian) centred on (cx, cy).
   Both u and prev get it, so it starts still and spreads out
   as a ring. Walls stay dry. */
export function drop(tank, cx, cy, { radius = 3, height = 2.5 } = {}) {
  const { cols, rows, u, prev, wall } = tank;
  const reach = Math.ceil(radius * 3);
  const x0 = Math.max(1, Math.floor(cx - reach)), x1 = Math.min(cols - 2, Math.ceil(cx + reach));
  const y0 = Math.max(1, Math.floor(cy - reach)), y1 = Math.min(rows - 2, Math.ceil(cy + reach));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * cols + x;
      if (wall[i]) { continue; }
      const r2 = ((x - cx) ** 2 + (y - cy) ** 2) / (radius * radius);
      const h = height * Math.exp(-r2);
      u[i] += h;
      prev[i] += h;
    }
  }
}

/* Paint (value 1) or erase (value 0) wall in a round brush. */
export function paintWall(tank, cx, cy, radius, value = 1) {
  const { cols, rows, wall, u, prev } = tank;
  const r = Math.max(0.5, radius);
  const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(cols - 2, Math.ceil(cx + r));
  const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(rows - 2, Math.ceil(cy + r));
  let changed = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) { continue; }
      const i = y * cols + x;
      if (wall[i] !== value) { wall[i] = value; changed++; }
      if (value) { u[i] = 0; prev[i] = 0; }
    }
  }
  return changed;
}

/* Paint a straight wall from (ax, ay) to (bx, by): a line of brushes. */
export function paintLine(tank, ax, ay, bx, by, radius, value = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(0.5, radius * 0.5)));
  let changed = 0;
  for (let k = 0; k <= n; k++) {
    changed += paintWall(tank, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, radius, value);
  }
  return changed;
}

/* Fill a rectangle of wall (inclusive cell bounds). */
export function wallRect(tank, x0, y0, x1, y1, value = 1) {
  const { cols, rows, wall } = tank;
  for (let y = Math.max(1, y0); y <= Math.min(rows - 2, y1); y++) {
    for (let x = Math.max(1, x0); x <= Math.min(cols - 2, x1); x++) { wall[y * cols + x] = value; }
  }
}

/* Calm the water (walls and sources stay). */
export function calm(tank) {
  tank.u.fill(0);
  tank.prev.fill(0);
  tank.next.fill(0);
  tank.t = 0;
  for (const s of tank.sources) { s.born = 0; }
}

/* Empty the tank: no water movement, no walls, no sources. */
export function clearAll(tank) {
  calm(tank);
  tank.wall.fill(0);
  tank.sources = [];
}

/* ---- presets ------------------------------------------------
   Laid out in fractions of the tank, so they fit any size.
   ------------------------------------------------------------ */
export const PRESETS = ["drop", "two", "slit2", "gap"];
export const PRESET_NAMES = { drop: "Single drop", two: "Two sources", slit2: "Double slit", gap: "Wall with a gap" };

export function applyPreset(tank, name) {
  clearAll(tank);
  const { cols, rows } = tank;
  const X = (f) => Math.round(f * (cols - 1));
  const Y = (f) => Math.round(f * (rows - 1));
  const thick = 1;                                   // wall half-thickness, cells

  /* A straight line of sources near the left edge = a flat
     (plane) wave, like light from far away. */
  const planeWave = () => {
    const x = Math.min(X(0.08), SPONGE_CELLS + 2);
    for (let y = 1; y < rows - 1; y++) { tank.sources.push({ x, y, phase: 0, born: 0 }); }
  };
  /* A barrier across the tank with openings: [centre, width] in cells. */
  const barrier = (fx, gaps) => {
    const x = X(fx);
    wallRect(tank, x - thick, 1, x + thick, rows - 2, 1);
    for (const [cy, w] of gaps) {
      wallRect(tank, x - thick, Math.round(cy - w / 2), x + thick, Math.round(cy + w / 2), 0);
    }
  };
  const lambda = wavelength(tank.freq, tank.courant);

  if (name === "drop") {
    drop(tank, X(0.5), Y(0.5), { radius: 3, height: 3 });
  } else if (name === "two") {
    /* Two sources about 2.5 wavelengths apart, near one end, so
       the pattern fans out across the long side of the tank. */
    const half = Math.max(4, Math.round(Math.min(lambda * 1.25, Math.min(cols, rows) * 0.18)));
    if (cols >= rows) {
      tank.sources.push({ x: X(0.3), y: Y(0.5) - half, phase: 0, born: 0 }, { x: X(0.3), y: Y(0.5) + half, phase: 0, born: 0 });
    } else {
      tank.sources.push({ x: X(0.5) - half, y: Y(0.3), phase: 0, born: 0 }, { x: X(0.5) + half, y: Y(0.3), phase: 0, born: 0 });
    }
  } else if (name === "slit2") {
    planeWave();
    const sep = Math.max(6, Math.round(Math.min(lambda * 2.2, rows * 0.3)));
    const w = Math.max(2, Math.round(lambda * 0.35));
    barrier(0.3, [[Y(0.5) - sep / 2, w], [Y(0.5) + sep / 2, w]]);
  } else if (name === "gap") {
    planeWave();
    const w = Math.max(4, Math.round(lambda * 1.6));
    barrier(0.35, [[Y(0.5), w]]);
  }
  return tank;
}

/* ---- readouts --------------------------------------------- */

/* Sum of u² over the water: a rough "how much wave is there". */
export function waveEnergy(tank) {
  let e = 0;
  for (let i = 0; i < tank.u.length; i++) { e += tank.u[i] * tank.u[i]; }
  return e;
}

/* Biggest |u|. Infinity if anything has blown up to NaN. */
export function maxHeight(tank) {
  let m = 0;
  for (let i = 0; i < tank.u.length; i++) {
    const a = Math.abs(tank.u[i]);
    if (a > m) { m = a; } else if (!(a <= m)) { return Infinity; }
  }
  return m;
}

export function wallCount(tank) {
  let n = 0;
  for (let i = 0; i < tank.wall.length; i++) { n += tank.wall[i]; }
  return n;
}

/* ---- saving walls -----------------------------------------
   The wall mask as a short string: run lengths of alternating
   empty / wall cells, starting with empty. "5,3,12" = 5 water,
   3 wall, 12 water. Small enough for a save.
   ------------------------------------------------------------ */
export function encodeWalls(tank) {
  const runs = [];
  let cur = 0, len = 0;
  for (let i = 0; i < tank.wall.length; i++) {
    if (tank.wall[i] === cur) { len++; } else { runs.push(len); cur = tank.wall[i]; len = 1; }
  }
  runs.push(len);
  return { cols: tank.cols, rows: tank.rows, runs: runs.join(",") };
}

/* Load a saved mask into a tank of any size (nearest cell). */
export function decodeWalls(tank, saved) {
  if (!saved || !Number.isInteger(saved.cols) || !Number.isInteger(saved.rows) || typeof saved.runs !== "string") { return false; }
  const { cols, rows } = saved;
  if (cols < 3 || rows < 3 || cols * rows > 4_000_000) { return false; }
  const src = new Uint8Array(cols * rows);
  let i = 0, v = 0;
  for (const part of saved.runs.split(",")) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || i + n > src.length) { return false; }
    if (v) { src.fill(1, i, i + n); }
    i += n;
    v = 1 - v;
  }
  if (i !== src.length) { return false; }
  tank.wall.fill(0);
  for (let y = 1; y < tank.rows - 1; y++) {
    const sy = Math.min(rows - 1, Math.round((y * (rows - 1)) / (tank.rows - 1)));
    for (let x = 1; x < tank.cols - 1; x++) {
      const sx = Math.min(cols - 1, Math.round((x * (cols - 1)) / (tank.cols - 1)));
      tank.wall[y * tank.cols + x] = src[sy * cols + sx];
    }
  }
  return true;
}

/* How many cells for a stage this big. Fewer on phones,
   so the step stays cheap; never under 40 either way. */
export function gridSize(width, height, budget) {
  const cell = Math.max(1.5, Math.sqrt((width * height) / budget));
  return {
    cols: Math.max(40, Math.round(width / cell)),
    rows: Math.max(40, Math.round(height / cell)),
    cell
  };
}

/* ---- the "screen" -------------------------------------------
   Like the screen in a double-slit experiment: how bright each
   spot along the far edge is, on average. Brightness of a wave
   goes with height squared, so we keep a running average of u²
   down one column, just inside the sponge.
   ------------------------------------------------------------ */
export function screenColumn(tank) {
  return Math.max(1, tank.cols - SPONGE_CELLS - 3);
}

/* Blend this step's u² into acc (one value per row). k = how much
   the newest step counts (small k = long, smooth average). */
export function accumulateScreen(tank, acc, k = 0.01) {
  const x = screenColumn(tank);
  for (let y = 0; y < tank.rows; y++) {
    const v = tank.u[y * tank.cols + x];
    acc[y] += k * (v * v - acc[y]);
  }
  return acc;
}
