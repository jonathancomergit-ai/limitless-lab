/* ============================================================
   Pathfinding Race - the algorithms (no DOM, unit tested)

   A grid is { cols, rows, cells } where cells is a Uint8Array:
     0 = open (costs 1 to step on)
     1 = wall (can't go there)
     2 = mud  (costs MUD_COST to step on)
   Moves are up / down / left / right.

   search(grid, start, goal, algo) runs one algorithm all the
   way and returns a trace the page can replay one step at a time:
     order    cells in the order they were explored (closed)
     path     cells from start to goal, or null if there's none
     cost     total cost of the path (mud counts extra)
     at       the step on which each of those cells was explored
     steps    how many times it took a cell off its to-do list
   ============================================================ */

export const OPEN = 0, WALL = 1, MUD = 2;
export const MUD_COST = 5;
export const ALGOS = ["astar", "dijkstra", "bfs", "greedy"];
export const ALGO_NAMES = { astar: "A*", dijkstra: "Dijkstra", bfs: "Breadth-first", greedy: "Greedy best-first" };

export function createGrid(cols, rows) {
  cols = Math.max(2, Math.floor(cols));
  rows = Math.max(2, Math.floor(rows));
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

export const idx = (g, x, y) => y * g.cols + x;
export const xy = (g, i) => [i % g.cols, Math.floor(i / g.cols)];
export const inside = (g, x, y) => x >= 0 && y >= 0 && x < g.cols && y < g.rows;
export const stepCost = (g, i) => (g.cells[i] === MUD ? MUD_COST : 1);

function neighbours(g, i, out) {
  const x = i % g.cols, y = (i - x) / g.cols;
  out.length = 0;
  if (y > 0) { out.push(i - g.cols); }
  if (x < g.cols - 1) { out.push(i + 1); }
  if (y < g.rows - 1) { out.push(i + g.cols); }
  if (x > 0) { out.push(i - 1); }
  return out;
}

/* Manhattan distance: never more than the real cost, because
   every step costs at least 1. That keeps A* honest. */
export function manhattan(g, a, b) {
  const [ax, ay] = xy(g, a), [bx, by] = xy(g, b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/* ---- a small binary heap, ties broken first-in first-out ---- */
class Heap {
  constructor() { this.items = []; this.count = 0; }
  get size() { return this.items.length; }
  push(value, priority) {
    const a = this.items;
    a.push({ value, priority, order: this.count++ });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i], a[p])) { break; }
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) { m = l; }
        if (r < a.length && less(a[r], a[m])) { m = r; }
        if (m === i) { break; }
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top.value;
  }
}
const less = (a, b) => a.priority < b.priority || (a.priority === b.priority && a.order < b.order);

/* ---- the one search, four ways ---------------------------- */
export function search(g, start, goal, algo = "astar") {
  if (!ALGOS.includes(algo)) { throw new Error(`Unknown algorithm: ${algo}`); }
  const n = g.cols * g.rows;
  const order = [];
  const at = [];          // at[k] = the step on which order[k] was explored
  const result = { algo, order, at, path: null, cost: Infinity, steps: 0 };
  if (start < 0 || goal < 0 || start >= n || goal >= n) { return result; }
  if (g.cells[start] === WALL || g.cells[goal] === WALL) { return result; }

  const came = new Int32Array(n).fill(-1);
  const best = new Float64Array(n).fill(Infinity);     // cheapest cost found so far
  const closed = new Uint8Array(n);
  const nb = [];
  best[start] = 0;

  if (algo === "bfs") {
    /* A plain queue. Counts cells, not cost: mud means nothing to it. */
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    queue[tail++] = start;
    closed[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      result.steps++;
      order.push(i);
      at.push(result.steps);
      if (i === goal) { break; }
      for (const j of neighbours(g, i, nb)) {
        if (closed[j] || g.cells[j] === WALL) { continue; }
        closed[j] = 1;
        came[j] = i;
        best[j] = best[i] + stepCost(g, j);
        queue[tail++] = j;
      }
    }
  } else {
    const heap = new Heap();
    const h = (i) => manhattan(g, i, goal);
    const priority = (i) => (algo === "dijkstra" ? best[i] : algo === "astar" ? best[i] + h(i) : h(i));
    heap.push(start, priority(start));
    while (heap.size) {
      const i = heap.pop();
      result.steps++;
      if (closed[i]) { continue; }          // an old, worse copy
      closed[i] = 1;
      order.push(i);
      at.push(result.steps);
      if (i === goal) { break; }
      for (const j of neighbours(g, i, nb)) {
        if (closed[j] || g.cells[j] === WALL) { continue; }
        const c = best[i] + stepCost(g, j);
        if (algo === "greedy") {
          /* Greedy only cares how close a cell looks to the goal:
             it takes the first route it finds to each cell. */
          if (came[j] !== -1 || j === start) { continue; }
          came[j] = i;
          best[j] = c;
          heap.push(j, priority(j));
        } else if (c < best[j]) {
          best[j] = c;
          came[j] = i;
          heap.push(j, priority(j));
        }
      }
    }
  }

  if (start === goal || came[goal] !== -1) {
    const path = [goal];
    for (let i = goal; i !== start; i = came[i]) { path.push(came[i]); }
    path.reverse();
    result.path = path;
    result.cost = pathCost(g, path);
  }
  return result;
}

/* Cost of walking a path: every cell after the first. */
export function pathCost(g, path) {
  let c = 0;
  for (let k = 1; k < path.length; k++) { c += stepCost(g, path[k]); }
  return c;
}

/* ---- seeded randomness ------------------------------------ */
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

/* ============================================================
   PRESETS
   Each returns { start, goal } and fills the grid.
   ============================================================ */
export const PRESETS = ["empty", "maze", "spiral", "trap"];
export const PRESET_NAMES = { empty: "Empty", maze: "Maze", spiral: "Spiral", trap: "Greedy trap" };

export function applyPreset(g, name, seed = 1) {
  g.cells.fill(OPEN);
  const { cols, rows } = g;
  const midY = Math.floor(rows / 2);
  if (name === "maze") { return maze(g, seed); }
  if (name === "spiral") { return spiral(g); }
  if (name === "trap") {
    /* 1. A cup that opens towards the start. Greedy runs straight
          into it, because the goal LOOKS close from inside.
       2. The goal sits in a patch of mud with a dry lane in from
          the far side. Greedy (and BFS) wade straight through. */
    const cx = Math.floor(cols * 0.45);
    const h = Math.max(2, Math.floor(rows * 0.3));
    const depth = Math.max(2, Math.floor(cols * 0.15));
    for (let y = midY - h; y <= midY + h; y++) { setCell(g, cx, y, WALL); }
    for (let x = cx - depth; x <= cx; x++) { setCell(g, x, midY - h, WALL); setCell(g, x, midY + h, WALL); }
    const t = 3;                                   // mud thickness
    const gx = Math.max(cx + t + 2, Math.min(cols - t - 3, Math.floor(cols * 0.82)));
    for (let y = midY - t; y <= midY + t; y++) {
      for (let x = gx - t; x <= gx + t; x++) { if (x !== gx || y !== midY) { setCell(g, x, y, MUD); } }
    }
    for (let x = gx + 1; x <= gx + t; x++) { setCell(g, x, midY, OPEN); }   // the dry way in
    return { start: idx(g, Math.max(0, Math.floor(cols * 0.1)), midY), goal: idx(g, Math.min(cols - 1, gx), midY) };
  }
  return { start: idx(g, Math.max(0, Math.floor(cols * 0.15)), midY), goal: idx(g, Math.min(cols - 1, Math.floor(cols * 0.85)), midY) };
}

function setCell(g, x, y, v) { if (inside(g, x, y)) { g.cells[idx(g, x, y)] = v; } }

/* A maze: carve rooms on odd cells with a random depth-first
   walk, then knock out a few extra walls so there are loops
   (with loops, the algorithms really do pick different routes). */
function maze(g, seed) {
  const rnd = mulberry32(seed);
  const { cols, rows } = g;
  g.cells.fill(WALL);
  const W = Math.floor((cols - 1) / 2), H = Math.floor((rows - 1) / 2);
  if (W < 1 || H < 1) { g.cells.fill(OPEN); return { start: 0, goal: cols * rows - 1 }; }
  const seen = new Uint8Array(W * H);
  const stack = [[0, 0]];
  seen[0] = 1;
  setCell(g, 1, 1, OPEN);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[ny * W + nx]);
    if (!options.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = options[Math.floor(rnd() * options.length)];
    seen[ny * W + nx] = 1;
    setCell(g, 2 * cx + 1 + dx, 2 * cy + 1 + dy, OPEN);
    setCell(g, 2 * nx + 1, 2 * ny + 1, OPEN);
    stack.push([nx, ny]);
  }
  /* Loops: open about 1 in 12 of the inner walls between two rooms. */
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (g.cells[idx(g, x, y)] !== WALL) { continue; }
      const h = x % 2 === 0 && y % 2 === 1 && x + 1 < 2 * W + 1;
      const v = y % 2 === 0 && x % 2 === 1 && y + 1 < 2 * H + 1;
      if ((h || v) && rnd() < 0.08) { g.cells[idx(g, x, y)] = OPEN; }
    }
  }
  return { start: idx(g, 1, 1), goal: idx(g, 2 * W - 1, 2 * H - 1) };
}

/* Square rings, each with one gap, alternating sides. The goal
   sits in the middle; the start is outside. */
function spiral(g) {
  const { cols, rows } = g;
  const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
  let k = 0;
  for (let r = 2; r < Math.min(cols, rows) / 2 - 1; r += 2, k++) {
    const x0 = cx - r, x1 = cx + r, y0 = cy - r, y1 = cy + r;
    for (let x = x0; x <= x1; x++) { setCell(g, x, y0, WALL); setCell(g, x, y1, WALL); }
    for (let y = y0; y <= y1; y++) { setCell(g, x0, y, WALL); setCell(g, x1, y, WALL); }
    const side = k % 4;
    if (side === 0) { setCell(g, x1, cy, OPEN); }
    if (side === 1) { setCell(g, cx, y1, OPEN); }
    if (side === 2) { setCell(g, x0, cy, OPEN); }
    if (side === 3) { setCell(g, cx, y0, OPEN); }
  }
  return { start: idx(g, 0, 0), goal: idx(g, cx, cy) };
}

/* ---- save format: one character per cell ------------------ */
export function encodeCells(g) {
  let s = "";
  for (let i = 0; i < g.cells.length; i++) { s += g.cells[i]; }
  return s;
}

export function decodeCells(g, text) {
  if (typeof text !== "string" || text.length !== g.cols * g.rows || !/^[012]*$/.test(text)) { return false; }
  for (let i = 0; i < text.length; i++) { g.cells[i] = text.charCodeAt(i) - 48; }
  return true;
}

/* Copy a grid into another size (nearest cell). */
export function resample(g, cols, rows) {
  const out = createGrid(cols, rows);
  for (let y = 0; y < out.rows; y++) {
    const sy = Math.min(g.rows - 1, Math.floor(((y + 0.5) * g.rows) / out.rows));
    for (let x = 0; x < out.cols; x++) {
      const sx = Math.min(g.cols - 1, Math.floor(((x + 0.5) * g.cols) / out.cols));
      out.cells[y * out.cols + x] = g.cells[sy * g.cols + sx];
    }
  }
  return out;
}

/* Move a cell index from one grid size to another. */
export function moveIndex(from, i, to) {
  const [x, y] = xy(from, i);
  const nx = Math.min(to.cols - 1, Math.floor(((x + 0.5) * to.cols) / from.cols));
  const ny = Math.min(to.rows - 1, Math.floor(((y + 0.5) * to.rows) / from.rows));
  return ny * to.cols + nx;
}

/* Grid size for a stage: square cells about `cell` px. */
export function gridFor(width, height, cell) {
  const c = Math.max(8, cell);
  return {
    cols: Math.max(20, Math.min(80, Math.floor(width / c))),
    rows: Math.max(12, Math.min(60, Math.floor(height / c)))
  };
}
