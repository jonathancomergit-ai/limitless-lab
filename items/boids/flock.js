/* ============================================================
   Boids Flocking - the rules, unit tested (no DOM)

   Craig Reynolds' boids (1987). Each bird only looks at the
   birds near it (inside its vision circle) and steers by three
   rules:

     separation  move away from birds that are too close
     alignment   turn to fly the same way as your neighbours
     cohesion    head for the middle of your neighbours

   Plus two extras: flee predators, and steer round walls.

   Steering is Reynolds-style: pick a desired velocity (full
   speed in the rule's direction), and turn towards it with a
   limited force. Units: CSS pixels and seconds.

   The world wraps round at the edges (fly off the right,
   come back on the left). A spatial grid finds neighbours
   quickly, so 600 birds stay smooth.
   ============================================================ */

export const PARAMS = {
  separation: 1.5,    // rule weights, 0 = off
  alignment: 1,
  cohesion: 1,
  vision: 50,         // px: how far a bird can see
  speed: 120          // px/s: top speed
};

const SEP_FRACTION = 0.5;    // "too close" = inside half the vision radius
const FLEE_WEIGHT = 5;
const AVOID_WEIGHT = 4;
const MIN_SPEED_FRACTION = 0.4;

/* ============================================================
   THE FLOCK: flat typed arrays, fast to loop over
   ============================================================ */
export function createFlock(n, w, h, rand = Math.random, speed = PARAMS.speed) {
  const f = { n, w, h, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    f.x[i] = rand() * w;
    f.y[i] = rand() * h;
    const a = rand() * Math.PI * 2;
    f.vx[i] = Math.cos(a) * speed * 0.7;
    f.vy[i] = Math.sin(a) * speed * 0.7;
  }
  return f;
}

/* The short way round a wrapping world. */
export function wrapDelta(d, size) {
  if (d > size / 2) { return d - size; }
  if (d < -size / 2) { return d + size; }
  return d;
}

/* ============================================================
   SPATIAL GRID
   Cells as big as the vision radius, so a bird's neighbours are
   always in its own cell or the 8 around it. Linked lists in
   typed arrays: no garbage each frame.
   ============================================================ */
export function buildGrid(f, cell) {
  const cols = Math.max(1, Math.floor(f.w / cell));
  const rows = Math.max(1, Math.floor(f.h / cell));
  const heads = new Int32Array(cols * rows).fill(-1);
  const next = new Int32Array(f.n);
  const cw = f.w / cols, ch = f.h / rows;     // cells stretch to fit exactly
  for (let i = 0; i < f.n; i++) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(f.x[i] / cw)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(f.y[i] / ch)));
    const k = r * cols + c;
    next[i] = heads[k];
    heads[k] = i;
  }
  return { cols, rows, cw, ch, heads, next };
}

/* Every other bird within radius of bird i. */
export function neighbours(f, grid, i, radius, out = []) {
  out.length = 0;
  const { cols, rows, cw, ch, heads, next } = grid;
  const c0 = Math.min(cols - 1, Math.max(0, Math.floor(f.x[i] / cw)));
  const r0 = Math.min(rows - 1, Math.max(0, Math.floor(f.y[i] / ch)));
  const r2 = radius * radius;
  /* With fewer than 3 cells across, the 3x3 block would visit a cell twice. */
  const dcs = cols >= 3 ? [-1, 0, 1] : [...Array(cols).keys()].map((c) => c - c0);
  const drs = rows >= 3 ? [-1, 0, 1] : [...Array(rows).keys()].map((r) => r - r0);
  for (const dr of drs) {
    const r = (r0 + dr + rows) % rows;
    for (const dc of dcs) {
      const c = (c0 + dc + cols) % cols;
      for (let j = heads[r * cols + c]; j !== -1; j = next[j]) {
        if (j === i) { continue; }
        const dx = wrapDelta(f.x[j] - f.x[i], f.w);
        const dy = wrapDelta(f.y[j] - f.y[i], f.h);
        if (dx * dx + dy * dy < r2) { out.push(j); }
      }
    }
  }
  return out;
}

/* ============================================================
   THE THREE RULES: raw directions (not yet steering)
   ============================================================ */
export function ruleDirections(f, i, nbrs, vision) {
  const sepR = vision * SEP_FRACTION;
  let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0;
  for (const j of nbrs) {
    const dx = wrapDelta(f.x[j] - f.x[i], f.w);
    const dy = wrapDelta(f.y[j] - f.y[i], f.h);
    const d2 = dx * dx + dy * dy;
    /* Separation: away from close birds, much harder the closer they are. */
    if (d2 < sepR * sepR && d2 > 1e-9) { sx -= dx / d2; sy -= dy / d2; }
    ax += f.vx[j]; ay += f.vy[j];
    cx += dx; cy += dy;
  }
  const n = nbrs.length;
  return {
    sep: [sx, sy],
    ali: n ? [ax / n, ay / n] : [0, 0],    // the average heading
    coh: n ? [cx / n, cy / n] : [0, 0]     // the way to the middle
  };
}

/* Turn towards "full speed in this direction", but only so hard. */
export function steer(dir, vx, vy, maxSpeed, maxForce) {
  const m = Math.hypot(dir[0], dir[1]);
  if (m < 1e-9) { return [0, 0]; }
  let sx = (dir[0] / m) * maxSpeed - vx;
  let sy = (dir[1] / m) * maxSpeed - vy;
  const s = Math.hypot(sx, sy);
  if (s > maxForce) { sx = (sx / s) * maxForce; sy = (sy / s) * maxForce; }
  return [sx, sy];
}

const maxForceOf = (p) => p.speed * 2.5;   // px/s^2: about half a second to turn round

/* All the forces on bird i, each already weighted. */
export function forces(f, i, nbrs, p, world = {}) {
  const dirs = ruleDirections(f, i, nbrs, p.vision);
  const mf = maxForceOf(p);
  const vx = f.vx[i], vy = f.vy[i];
  const sep = steer(dirs.sep, vx, vy, p.speed, mf).map((v) => v * p.separation);
  const ali = steer(dirs.ali, vx, vy, p.speed, mf).map((v) => v * p.alignment);
  const coh = steer(dirs.coh, vx, vy, p.speed, mf).map((v) => v * p.cohesion);

  /* Flee: away from any predator within 2x vision. */
  let fx = 0, fy = 0;
  for (const q of world.predators || []) {
    const dx = wrapDelta(f.x[i] - q.x, f.w), dy = wrapDelta(f.y[i] - q.y, f.h);
    const d = Math.hypot(dx, dy);
    const reach = p.vision * 2;
    if (d < reach && d > 1e-6) { const k = 1 - d / reach; fx += (dx / d) * k; fy += (dy / d) * k; }
  }
  const flee = steer([fx, fy], vx, vy, p.speed, mf).map((v) => v * FLEE_WEIGHT * Math.min(1, Math.hypot(fx, fy) * 2));

  /* Walls: away from any wall blob the bird can see, harder when close. */
  let ox = 0, oy = 0;
  for (const o of world.obstacles || []) {
    const dx = wrapDelta(f.x[i] - o.x, f.w), dy = wrapDelta(f.y[i] - o.y, f.h);
    const d = Math.hypot(dx, dy);
    const gap = d - o.r;
    if (gap < p.vision * 0.6 && d > 1e-6) { const k = 1 - Math.max(0, gap) / (p.vision * 0.6); ox += (dx / d) * k; oy += (dy / d) * k; }
  }
  const avoid = steer([ox, oy], vx, vy, p.speed, mf).map((v) => v * AVOID_WEIGHT * Math.min(1, Math.hypot(ox, oy)));

  return {
    sep, ali, coh, flee, avoid,
    total: [sep[0] + ali[0] + coh[0] + flee[0] + avoid[0], sep[1] + ali[1] + coh[1] + flee[1] + avoid[1]]
  };
}

/* ============================================================
   ONE TIME STEP for the whole flock
   All forces are worked out first, then everyone moves, so the
   order of the birds makes no difference.
   ============================================================ */
const scratch = { ax: new Float32Array(0), ay: new Float32Array(0), nb: [] };

export function stepFlock(f, p, dt, world = {}) {
  if (scratch.ax.length < f.n) { scratch.ax = new Float32Array(f.n); scratch.ay = new Float32Array(f.n); }
  const grid = buildGrid(f, Math.max(p.vision, 8));
  for (let i = 0; i < f.n; i++) {
    const nb = neighbours(f, grid, i, p.vision, scratch.nb);
    const { total } = forces(f, i, nb, p, world);
    scratch.ax[i] = total[0];
    scratch.ay[i] = total[1];
  }
  const vmin = p.speed * MIN_SPEED_FRACTION;
  for (let i = 0; i < f.n; i++) {
    let vx = f.vx[i] + scratch.ax[i] * dt;
    let vy = f.vy[i] + scratch.ay[i] * dt;
    const s = Math.hypot(vx, vy);
    if (s > p.speed) { vx *= p.speed / s; vy *= p.speed / s; }
    else if (s < vmin) {
      if (s < 1e-6) { vx = vmin; vy = 0; } else { vx *= vmin / s; vy *= vmin / s; }
    }
    f.vx[i] = vx;
    f.vy[i] = vy;
    let x = f.x[i] + vx * dt, y = f.y[i] + vy * dt;
    /* Never inside a wall: push straight back out to its edge. */
    for (const o of world.obstacles || []) {
      const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
      if (d < o.r && d > 1e-6) { x = o.x + (dx / d) * o.r; y = o.y + (dy / d) * o.r; }
    }
    f.x[i] = ((x % f.w) + f.w) % f.w;
    f.y[i] = ((y % f.h) + f.h) % f.h;
  }
  return f;
}

/* Predators drift towards the nearest bird, a bit slower than a bird. */
export function movePredators(world, f, p, dt) {
  for (const q of world.predators || []) {
    let best = Infinity, bx = 0, by = 0;
    for (let i = 0; i < f.n; i++) {
      const dx = wrapDelta(f.x[i] - q.x, f.w), dy = wrapDelta(f.y[i] - q.y, f.h);
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = dx; by = dy; }
    }
    const d = Math.sqrt(best);
    if (d > 1) {
      const v = Math.min(d / dt, p.speed * 0.75);
      q.x = (((q.x + (bx / d) * v * dt) % f.w) + f.w) % f.w;
      q.y = (((q.y + (by / d) * v * dt) % f.h) + f.h) % f.h;
    }
  }
}

/* How lined up the flock is: 0 = every way at once, 1 = all one way. */
export function order(f) {
  let sx = 0, sy = 0;
  for (let i = 0; i < f.n; i++) {
    const s = Math.hypot(f.vx[i], f.vy[i]) || 1;
    sx += f.vx[i] / s;
    sy += f.vy[i] / s;
  }
  return f.n ? Math.hypot(sx, sy) / f.n : 0;
}

/* Grow or shrink the flock, keeping the birds that are there. */
export function resizeFlock(f, n, rand = Math.random, speed = PARAMS.speed) {
  if (n === f.n) { return f; }
  const g = createFlock(n, f.w, f.h, rand, speed);
  const keep = Math.min(n, f.n);
  g.x.set(f.x.subarray(0, keep)); g.y.set(f.y.subarray(0, keep));
  g.vx.set(f.vx.subarray(0, keep)); g.vy.set(f.vy.subarray(0, keep));
  return g;
}

/* A seeded random number generator, for repeatable tests. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
