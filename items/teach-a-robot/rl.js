/* ============================================================
   Teach a Robot - the learning, unit tested (no DOM)

   1. RANDOM      a small seeded random number generator
   2. Q-LEARNING  the table, picking moves, the update rule
   3. MAZE        a grid world: walls, pits, a start and a goal
   4. CART-POLE   the classic balancing pole, binned into boxes

   Q-learning in one line: after every move, nudge
     Q(state, move)  towards  reward + discount * best Q(next state)
   ============================================================ */

/* ============================================================
   1. RANDOM (mulberry32): same seed, same run
   ============================================================ */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   2. Q-LEARNING
   Q is a flat table: Q[state * nActions + action].
   It starts at all zeros: the robot knows nothing.
   ============================================================ */
export function createQ(nStates, nActions) {
  return { n: nStates, nA: nActions, q: new Float64Array(nStates * nActions) };
}

/* The move with the highest Q. Ties are broken at random, so a
   brand-new robot doesn't always walk the same way. */
export function bestAction(Q, s, rand = Math.random) {
  const base = s * Q.nA;
  let best = 0, bestV = -Infinity, ties = 0;
  for (let a = 0; a < Q.nA; a++) {
    const v = Q.q[base + a];
    if (v > bestV) { bestV = v; best = a; ties = 1; }
    else if (v === bestV) { ties += 1; if (rand() * ties < 1) { best = a; } }
  }
  return best;
}

export function maxQ(Q, s) {
  const base = s * Q.nA;
  let m = Q.q[base];
  for (let a = 1; a < Q.nA; a++) { if (Q.q[base + a] > m) { m = Q.q[base + a]; } }
  return m;
}

/* Epsilon-greedy: with chance eps try something random (explore),
   otherwise do what looks best (exploit). */
export function chooseAction(Q, s, eps, rand = Math.random) {
  if (eps > 0 && rand() < eps) { return Math.floor(rand() * Q.nA); }
  return bestAction(Q, s, rand);
}

/* The Q-learning update. Returns the surprise (TD error). */
export function qUpdate(Q, s, a, r, s2, done, alpha, gamma) {
  const i = s * Q.nA + a;
  const target = done ? r : r + gamma * maxQ(Q, s2);
  const err = target - Q.q[i];
  Q.q[i] += alpha * err;
  return err;
}

/* Exploration that fades: eps0 x rate^episode, never below floor. */
export function exploreAt(eps0, episode, { decay = true, rate = 0.99, floor = 0 } = {}) {
  if (!decay) { return eps0; }
  return Math.max(Math.min(eps0, floor), eps0 * Math.pow(rate, episode));
}

/* ============================================================
   3. MAZE
   Cells: 0 empty, 1 wall, 2 pit. States are cell indexes.
   Moves: 0 up, 1 right, 2 down, 3 left.
   ============================================================ */
export const EMPTY = 0, WALL = 1, PIT = 2;
export const MOVES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const MAZE_REWARD = Object.freeze({ step: -1, goal: 20, pit: -20 });

/* rows: strings, "S" start, "G" goal, "#" wall, "O" pit, "." empty */
export function parseMaze(rows) {
  const h = rows.length, w = rows[0].length;
  const cells = new Array(w * h).fill(EMPTY);
  let start = 0, goal = w * h - 1;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x], i = y * w + x;
      if (ch === "#") { cells[i] = WALL; }
      else if (ch === "O") { cells[i] = PIT; }
      else if (ch === "S") { start = i; }
      else if (ch === "G") { goal = i; }
    }
  });
  return { w, h, cells, start, goal };
}

/* The maze the page opens with. Two ways round; the short one
   squeezes past two pits. */
export const DEFAULT_ROWS = [
  "S..#....",
  ".#.#.##.",
  ".#...O..",
  ".###.#..",
  "...#.#O.",
  "##.#....",
  "....##.#",
  ".##....G"
];
export function defaultMaze() { return parseMaze(DEFAULT_ROWS); }

/* One move. Walls (and the edge) bump you back where you were. */
export function mazeMove(m, s, a) {
  const x = s % m.w, y = (s - x) / m.w;
  const nx = x + MOVES[a][0], ny = y + MOVES[a][1];
  if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || m.cells[ny * m.w + nx] === WALL) {
    return { s2: s, r: MAZE_REWARD.step, done: false, what: "bump" };
  }
  const s2 = ny * m.w + nx;
  if (s2 === m.goal) { return { s2, r: MAZE_REWARD.goal, done: true, what: "goal" }; }
  if (m.cells[s2] === PIT) { return { s2, r: MAZE_REWARD.pit, done: true, what: "pit" }; }
  return { s2, r: MAZE_REWARD.step, done: false, what: "move" };
}

export function mazeMaxSteps(m) { return m.w * m.h * 3; }

/* One move of a practice run: pick, move, learn. */
export function mazeTick(m, Q, s, { alpha, gamma, eps }, rand) {
  const a = chooseAction(Q, s, eps, rand);
  const res = mazeMove(m, s, a);
  qUpdate(Q, s, a, res.r, res.s2, res.done, alpha, gamma);
  res.a = a;
  return res;
}

/* One whole practice run, learning as it goes. */
export function mazeEpisode(m, Q, params, rand, maxSteps = mazeMaxSteps(m)) {
  let s = m.start, total = 0, steps = 0, what = "timeout";
  while (steps < maxSteps) {
    const res = mazeTick(m, Q, s, params, rand);
    total += res.r;
    steps += 1;
    s = res.s2;
    if (res.done) { what = res.what; break; }
  }
  return { reward: total, steps, what };
}

/* Follow the best arrows from the start. Stops at the goal, a pit,
   a wall bump or the first repeat (a loop). */
export function greedyRoute(m, Q) {
  const route = [m.start];
  const seen = new Set(route);
  let s = m.start;
  for (let k = 0; k < m.w * m.h; k++) {
    if (allSame(Q, s)) { break; }
    const res = mazeMove(m, s, bestAction(Q, s, () => 0));
    if (res.what === "bump" || seen.has(res.s2)) { break; }
    route.push(res.s2);
    seen.add(res.s2);
    s = res.s2;
    if (res.done) { break; }
  }
  return route;
}

/* True if every Q in this state is equal (it has learned nothing here). */
export function allSame(Q, s) {
  const base = s * Q.nA;
  for (let a = 1; a < Q.nA; a++) { if (Q.q[base + a] !== Q.q[base]) { return false; } }
  return true;
}

/* Fewest moves from start to goal, avoiding walls and pits (-1 = no way). */
export function shortestPath(m) {
  const dist = new Int32Array(m.w * m.h).fill(-1);
  dist[m.start] = 0;
  const queue = [m.start];
  for (let qi = 0; qi < queue.length; qi++) {
    const s = queue[qi];
    if (s === m.goal) { return dist[s]; }
    for (let a = 0; a < 4; a++) {
      const res = mazeMove(m, s, a);
      if (res.what === "bump" || res.what === "pit" || dist[res.s2] >= 0) { continue; }
      dist[res.s2] = dist[s] + 1;
      queue.push(res.s2);
    }
  }
  return -1;
}

/* ============================================================
   4. CART-POLE
   The standard equations (Barto, Sutton & Anderson, 1983; the
   same as OpenAI Gym), stepped with Euler at a fixed 0.02 s.
   State: [x, xDot, theta, thetaDot]. theta = 0 is upright,
   positive leans right. Action 0 pushes left, 1 pushes right.
   ============================================================ */
export const CART = Object.freeze({
  gravity: 9.8,
  massCart: 1.0,
  massPole: 0.1,
  halfLength: 0.5,        // half the pole's length, metres
  force: 10,              // newtons, each push
  tau: 0.02,              // seconds per step
  xLimit: 2.4,            // the track ends here
  thetaLimit: 12 * Math.PI / 180,
  maxSteps: 2500          // 50 seconds: "it can do it"
});

export function cartStep(st, action, c = CART) {
  const [x, xDot, th, thDot] = st;
  const f = action === 1 ? c.force : -c.force;
  const total = c.massCart + c.massPole;
  const pml = c.massPole * c.halfLength;
  const cos = Math.cos(th), sin = Math.sin(th);
  const temp = (f + pml * thDot * thDot * sin) / total;
  const thAcc = (c.gravity * sin - cos * temp) / (c.halfLength * (4 / 3 - (c.massPole * cos * cos) / total));
  const xAcc = temp - (pml * thAcc * cos) / total;
  return [x + c.tau * xDot, xDot + c.tau * xAcc, th + c.tau * thDot, thDot + c.tau * thAcc];
}

export function cartFailed(st, c = CART) {
  return Math.abs(st[0]) > c.xLimit || Math.abs(st[2]) > c.thetaLimit;
}

/* A fresh start: everything a tiny random amount off zero. */
export function cartStart(rand) {
  return [0, 0, 0, 0].map(() => (rand() - 0.5) * 0.1);
}

/* Binning: the table can't hold every exact state, so each of the
   four numbers is sorted into a few boxes: 6 x 4 x 6 x 6 = 864. */
export const CART_EDGES = Object.freeze([
  [-1.6, -0.8, 0, 0.8, 1.6],                     // where the cart is (m)
  [-0.5, 0, 0.5],                                // how fast it's rolling (m/s)
  [-0.105, -0.035, 0, 0.035, 0.105],             // pole angle (+-2 and +-6 degrees)
  [-0.9, -0.3, 0, 0.3, 0.9]                      // how fast the pole tips (rad/s)
]);

export function makeBinner(edges = CART_EDGES) {
  const sizes = edges.map((e) => e.length + 1);
  const n = sizes.reduce((x, y) => x * y, 1);
  function bin(st) {
    let s = 0;
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k];
      let i = 0;
      while (i < e.length && st[k] >= e[i]) { i++; }
      s = s * sizes[k] + i;
    }
    return s;
  }
  return { n, bin };
}

const BINNER = makeBinner();
export const CART_STATES = BINNER.n;
export const cartBin = BINNER.bin;

/* Rewards: +1 for every step the pole stays up, -100 for falling. */
export const CART_REWARD = Object.freeze({ step: 1, fall: -100 });

/* One step of a practice run: pick, push, learn. */
export function cartTick(Q, st, { alpha, gamma, eps }, rand) {
  const s = cartBin(st);
  const a = chooseAction(Q, s, eps, rand);
  const next = cartStep(st, a);
  const failed = cartFailed(next);
  const r = failed ? CART_REWARD.fall : CART_REWARD.step;
  /* Falling ends it: no future reward from there. */
  qUpdate(Q, s, a, r, cartBin(next), failed, alpha, gamma);
  return { st: next, a, r, failed };
}

/* One whole practice run. Stops when the pole falls, or at maxSteps. */
export function cartEpisode(Q, params, rand, maxSteps = CART.maxSteps) {
  let st = cartStart(rand), total = 0, steps = 0, fell = false;
  while (steps < maxSteps) {
    const res = cartTick(Q, st, params, rand);
    st = res.st;
    total += res.r;
    steps += 1;
    if (res.failed) { fell = true; break; }
  }
  return { reward: total, steps, what: fell ? "fell" : "goal" };
}
