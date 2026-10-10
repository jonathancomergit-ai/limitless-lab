/* ============================================================
   k-Means Clustering - the algorithm (no DOM, unit tested)

   Points live in a 1 x 1 square (x and y from 0 to 1), so the
   same dots work on any screen.

   k-means repeats two moves until nothing changes:
     1. ASSIGN  every point joins its nearest centre
     2. MOVE    every centre jumps to the middle (mean) of its points
   Both moves can only make the "spread" smaller or keep it the
   same. Spread = the sum of squared distances from each point
   to its centre. So it always settles down.

   The start is random (seeded, so it can be replayed), picked
   the k-means++ way: each new centre is likely to be far from
   the ones already picked.
   ============================================================ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/* k starting centres, k-means++ style. */
export function initCentres(points, k, seed = 1) {
  const rnd = mulberry32(seed);
  if (!points.length) { return []; }
  const centres = [{ ...points[Math.floor(rnd() * points.length)] }];
  while (centres.length < k) {
    const w = points.map((p) => Math.min(...centres.map((c) => d2(p, c))));
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum === 0) { centres.push({ ...points[Math.floor(rnd() * points.length)] }); continue; }
    let r = rnd() * sum, i = 0;
    while (i < w.length - 1 && r > w[i]) { r -= w[i]; i++; }
    centres.push({ ...points[i] });
  }
  return centres.map(({ x, y }) => ({ x, y }));
}

/* A fresh run. */
export function createRun(points, k, seed = 1) {
  const centres = initCentres(points, k, seed);
  return {
    points,
    k,
    seed,
    centres,
    assign: new Int16Array(points.length).fill(-1),
    trails: centres.map((c) => [{ ...c }]),
    phase: "assign",       // the NEXT move
    steps: 0,              // moves made (assign and move each count 1)
    changed: points.length,
    done: points.length === 0
  };
}

export function nearest(centres, p) {
  let best = 0, bestD = Infinity;
  for (let j = 0; j < centres.length; j++) {
    const d = d2(p, centres[j]);
    if (d < bestD) { bestD = d; best = j; }
  }
  return best;
}

/* One move: assign, or move the centres. */
export function step(run) {
  if (run.done || !run.centres.length) { run.done = true; return run; }
  if (run.phase === "assign") {
    let changed = 0;
    for (let i = 0; i < run.points.length; i++) {
      const j = nearest(run.centres, run.points[i]);
      if (j !== run.assign[i]) { run.assign[i] = j; changed++; }
    }
    run.changed = changed;
    run.phase = "move";
    run.steps++;
    /* Nobody switched groups after a move: it has settled. */
    if (changed === 0 && run.steps > 1) { run.done = true; }
    return run;
  }
  const sx = new Float64Array(run.k), sy = new Float64Array(run.k), n = new Int32Array(run.k);
  for (let i = 0; i < run.points.length; i++) {
    const j = run.assign[i];
    if (j < 0) { continue; }
    sx[j] += run.points[i].x; sy[j] += run.points[i].y; n[j]++;
  }
  run.centres.forEach((c, j) => {
    /* A centre with no points stays where it is. */
    if (n[j]) { c.x = sx[j] / n[j]; c.y = sy[j] / n[j]; }
    const t = run.trails[j];
    const last = t[t.length - 1];
    if (d2(last, c) > 1e-12) { t.push({ x: c.x, y: c.y }); }
  });
  run.phase = "assign";
  run.steps++;
  return run;
}

/* Two centres on the same spot. k-means++ does this when there
   are fewer different dots than k. Ties go to the lowest index,
   so the stacked ones would never get any dots. */
export function stacked(centres) {
  return centres.some((c, j) => centres.some((o, i) => i < j && d2(c, o) < 1e-12));
}

/* A dot was just pushed onto `points`. Before the first move, or
   while centres are stacked, start afresh so k-means++ sees every
   dot. Otherwise the centres stay put and the next move is an assign. */
export function addToRun(run, points, k, seed = 1) {
  if (run.centres.length < k || run.steps === 0 || stacked(run.centres)) { return createRun(points, k, seed); }
  const assign = new Int16Array(points.length).fill(-1);
  assign.set(run.assign.subarray(0, Math.min(run.assign.length, points.length - 1)));
  run.assign = assign;
  run.phase = "assign";
  run.done = false;
  return run;
}

/* Keep stepping until it settles (or max moves). */
export function runToEnd(run, max = 400) {
  for (let s = 0; s < max && !run.done; s++) { step(run); }
  return run;
}

/* The spread: sum of squared distances, point to its centre.
   Before the first assign, each point counts its nearest centre. */
export function spread(run) {
  let s = 0;
  run.points.forEach((p, i) => {
    const j = run.assign[i] >= 0 ? run.assign[i] : nearest(run.centres, p);
    s += d2(p, run.centres[j]);
  });
  return s;
}

/* Group sizes. */
export function sizes(run) {
  const n = Array(run.k).fill(0);
  for (const j of run.assign) { if (j >= 0) { n[j]++; } }
  return n;
}

/* The elbow: best (of `tries` seeds) settled spread for k = 1..kmax. */
export function elbow(points, kmax = 8, seed = 1, tries = 3) {
  const out = [];
  for (let k = 1; k <= kmax; k++) {
    let best = Infinity;
    for (let t = 0; t < tries; t++) {
      const r = runToEnd(createRun(points, Math.min(k, Math.max(1, points.length)), seed + t * 101 + k));
      best = Math.min(best, points.length ? spread(r) : 0);
    }
    out.push(best);
  }
  return out;
}

/* ---- presets: seeded clouds of dots ------------------------ */
export const PRESETS = ["blobs3", "blobs5", "smiley", "uneven"];
export const PRESET_NAMES = { blobs3: "3 blobs", blobs5: "5 blobs", smiley: "Smiley", uneven: "Uneven sizes" };

function gauss(rnd) {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp01 = (v) => Math.max(0.02, Math.min(0.98, v));

function blob(rnd, cx, cy, sd, n, out) {
  for (let k = 0; k < n; k++) { out.push({ x: clamp01(cx + gauss(rnd) * sd), y: clamp01(cy + gauss(rnd) * sd) }); }
}

export function preset(name, seed = 7) {
  const rnd = mulberry32(seed);
  const pts = [];
  if (name === "blobs5") {
    for (const [x, y] of [[0.2, 0.25], [0.75, 0.2], [0.5, 0.52], [0.22, 0.78], [0.8, 0.78]]) { blob(rnd, x, y, 0.06, 40, pts); }
  } else if (name === "smiley") {
    blob(rnd, 0.35, 0.33, 0.035, 35, pts);                 // eyes
    blob(rnd, 0.65, 0.33, 0.035, 35, pts);
    for (let k = 0; k < 90; k++) {                          // the smile
      const a = Math.PI * (0.15 + 0.7 * rnd());
      const r = 0.28 + gauss(rnd) * 0.02;
      pts.push({ x: clamp01(0.5 + Math.cos(a) * r), y: clamp01(0.45 + Math.sin(a) * r) });
    }
  } else if (name === "uneven") {
    blob(rnd, 0.32, 0.45, 0.13, 150, pts);                  // one big, wide group
    blob(rnd, 0.8, 0.22, 0.035, 18, pts);                   // two small, tight ones
    blob(rnd, 0.78, 0.78, 0.035, 18, pts);
  } else {
    for (const [x, y] of [[0.25, 0.3], [0.72, 0.3], [0.5, 0.75]]) { blob(rnd, x, y, 0.07, 50, pts); }
  }
  return pts;
}
