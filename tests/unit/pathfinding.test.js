/* ============================================================
   Pathfinding Race - the algorithms, unit tested

   - every algorithm finds a path when one exists
   - every algorithm reports none when the goal is walled off
   - A* and Dijkstra find the same (shortest) cost, also with mud
   - BFS finds the fewest cells; greedy falls for the trap
   - presets, save format, resampling
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGrid, search, applyPreset, idx, xy, pathCost, encodeCells, decodeCells, resample,
  moveIndex, gridFor, mulberry32, ALGOS, PRESETS, WALL, MUD, OPEN, MUD_COST
} from "../../items/pathfinding/search.js";

/* Is a path legal? Starts and ends right, each step is one
   cell up/down/left/right, never through a wall. */
function legal(g, path, start, goal) {
  assert.equal(path[0], start);
  assert.equal(path[path.length - 1], goal);
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = xy(g, path[k - 1]), [bx, by] = xy(g, path[k]);
    assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1, "not a single step");
    assert.notEqual(g.cells[path[k]], WALL, "walks through a wall");
  }
}

function randomGrid(seed, cols = 30, rows = 20, walls = 0.25, mud = 0) {
  const g = createGrid(cols, rows);
  const rnd = mulberry32(seed);
  for (let i = 0; i < g.cells.length; i++) {
    const r = rnd();
    g.cells[i] = r < walls ? WALL : r < walls + mud ? MUD : OPEN;
  }
  return g;
}

test("every algorithm finds a path when one exists", () => {
  for (const name of PRESETS) {
    const g = createGrid(31, 21);
    const { start, goal } = applyPreset(g, name, 3);
    for (const algo of ALGOS) {
      const r = search(g, start, goal, algo);
      assert.ok(r.path, `${algo} found no path on ${name}`);
      legal(g, r.path, start, goal);
      assert.ok(r.order.length > 0 && r.steps >= r.order.length);
    }
  }
});

test("every algorithm reports no path when the goal is walled off", () => {
  const g = createGrid(15, 15);
  for (let x = 0; x < 15; x++) { g.cells[idx(g, x, 7)] = WALL; }   // a wall right across
  for (const algo of ALGOS) {
    const r = search(g, idx(g, 2, 2), idx(g, 12, 12), algo);
    assert.equal(r.path, null, algo);
    assert.equal(r.cost, Infinity);
    /* It looked at every cell on its side before giving up. */
    assert.equal(r.order.length, 15 * 7, algo);
  }
  /* A goal that IS a wall: nothing to find. */
  const h = createGrid(5, 5);
  h.cells[idx(h, 4, 4)] = WALL;
  for (const algo of ALGOS) { assert.equal(search(h, 0, idx(h, 4, 4), algo).path, null); }
});

test("A* and Dijkstra find the same shortest length", () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = randomGrid(seed);
    const start = idx(g, 0, 0), goal = idx(g, 29, 19);
    g.cells[start] = OPEN; g.cells[goal] = OPEN;
    const a = search(g, start, goal, "astar");
    const d = search(g, start, goal, "dijkstra");
    const b = search(g, start, goal, "bfs");
    assert.equal(Boolean(a.path), Boolean(d.path), `seed ${seed}`);
    if (!a.path) { continue; }
    checked++;
    assert.equal(a.cost, d.cost, `seed ${seed}`);
    assert.equal(a.path.length, d.path.length, `seed ${seed}`);
    /* No mud: BFS is shortest too. */
    assert.equal(b.path.length, a.path.length, `seed ${seed}`);
    /* A* never explores more than Dijkstra. */
    assert.ok(a.order.length <= d.order.length);
  }
  assert.ok(checked > 10, `only ${checked} grids had a path`);
});

test("with mud, A* and Dijkstra still agree, and go round the mud", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = randomGrid(seed, 25, 18, 0.15, 0.3);
    const start = idx(g, 0, 0), goal = idx(g, 24, 17);
    g.cells[start] = OPEN; g.cells[goal] = OPEN;
    const a = search(g, start, goal, "astar");
    const d = search(g, start, goal, "dijkstra");
    if (!a.path) { continue; }
    assert.equal(a.cost, d.cost, `seed ${seed}`);
    assert.equal(a.cost, pathCost(g, a.path));
    /* BFS ignores mud, so it can never be cheaper. */
    const b = search(g, start, goal, "bfs");
    assert.ok(b.cost >= a.cost);
  }
  /* A mud strip with a dry way round: Dijkstra goes round. */
  const g = createGrid(9, 5);
  for (let y = 0; y < 4; y++) { for (let x = 3; x <= 5; x++) { g.cells[idx(g, x, y)] = MUD; } }
  const d = search(g, idx(g, 0, 1), idx(g, 8, 1), "dijkstra");
  assert.equal(d.cost, 14);                     // 3 down, 8 across, 3 up
  assert.ok(d.cost < 5 + 3 * MUD_COST);         // cheaper than wading through
  assert.ok(!d.path.some((i) => g.cells[i] === MUD));
});

test("greedy falls for the trap: its path costs more than A*'s", () => {
  for (const [cols, rows] of [[21, 28], [40, 24], [42, 17], [80, 60], [20, 12]]) {
    const g = createGrid(cols, rows);
    const { start, goal } = applyPreset(g, "trap");
    const a = search(g, start, goal, "astar");
    const gr = search(g, start, goal, "greedy");
    assert.ok(gr.cost > a.cost, `${cols}x${rows}: greedy ${gr.cost} vs A* ${a.cost}`);
    assert.equal(a.cost, search(g, start, goal, "dijkstra").cost);
  }
});

test("start = goal is a path of one cell", () => {
  const g = createGrid(5, 5);
  for (const algo of ALGOS) {
    const r = search(g, 7, 7, algo);
    assert.deepEqual(r.path, [7]);
    assert.equal(r.cost, 0);
  }
});

test("the maze is seeded and has loops", () => {
  const a = createGrid(31, 21), b = createGrid(31, 21), c = createGrid(31, 21);
  applyPreset(a, "maze", 5); applyPreset(b, "maze", 5); applyPreset(c, "maze", 6);
  assert.deepEqual([...a.cells], [...b.cells]);
  assert.notDeepEqual([...a.cells], [...c.cells]);
  /* A perfect maze on 15x10 rooms has 150 rooms + 149 passages open. */
  const open = a.cells.filter((v) => v === OPEN).length;
  assert.ok(open > 150 + 149, `open cells ${open}`);
});

test("save format round trip, and junk is refused", () => {
  const g = randomGrid(9, 12, 8, 0.3, 0.2);
  const back = createGrid(12, 8);
  assert.ok(decodeCells(back, encodeCells(g)));
  assert.deepEqual([...back.cells], [...g.cells]);
  assert.equal(decodeCells(back, "012"), false);
  assert.equal(decodeCells(back, "9".repeat(96)), false);
  assert.equal(decodeCells(back, null), false);
});

test("resampling keeps walls in roughly the same place", () => {
  const g = createGrid(20, 10);
  for (let y = 0; y < 10; y++) { g.cells[idx(g, 10, y)] = WALL; }
  const big = resample(g, 40, 20);
  assert.equal(big.cells.filter((v) => v === WALL).length, 40);
  const i = moveIndex(g, idx(g, 19, 9), big);
  assert.deepEqual(xy(big, i), [39, 19]);
});

test("grid size fits the stage", () => {
  const p = gridFor(390, 520, 18);
  assert.deepEqual(p, { cols: 21, rows: 28 });
  const tiny = gridFor(10, -5, 18);
  assert.ok(tiny.cols >= 20 && tiny.rows >= 12);
  const huge = gridFor(5000, 5000, 10);
  assert.ok(huge.cols <= 80 && huge.rows <= 60);
});
