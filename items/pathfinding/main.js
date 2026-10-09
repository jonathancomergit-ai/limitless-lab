/* ============================================================
   Pathfinding Race - main script

   The algorithms are in search.js. Each one runs to the end in
   one go; this file replays their traces at the same speed, so
   it's a fair race, and paints them side by side.

   Sections:
     1. save       grid, start, goal, tool, view, speed
     2. state      the grid and the race
     3. loop       advance the race (update) + paint (draw)
     4. input      drag walls / markers, keys, buttons
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion } from "../../kit/motion.js";
import {
  createGrid, search, applyPreset, idx, xy, encodeCells, decodeCells, resample, moveIndex, gridFor,
  ALGOS, ALGO_NAMES, PRESETS, OPEN, WALL, MUD
} from "./search.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");

const TOOLS = ["wall", "mud", "erase"];
const VIEWS = ["all", "one"];
const SPEEDS = [5, 10, 20, 40, 80, 160, 320, 640, 1280];   // steps per second
const calm = reducedMotion();

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = {
  grid: null, start: null, goal: null, preset: "trap",
  tool: "wall", view: "all", solo: "astar", speed: calm ? 3 : 5
};

function validate(d) {
  if (!TOOLS.includes(d.tool) || !VIEWS.includes(d.view) || !ALGOS.includes(d.solo)) { return "Unknown setting in that save."; }
  if (!Number.isInteger(d.speed) || d.speed < 1 || d.speed > SPEEDS.length) { return "The speed in that save is out of range."; }
  if (d.preset !== null && !PRESETS.includes(d.preset)) { return "Unknown preset in that save."; }
  if (d.grid !== null) {
    const g = d.grid;
    if (!g || typeof g !== "object" || !Number.isInteger(g.cols) || !Number.isInteger(g.rows) ||
        g.cols < 2 || g.rows < 2 || g.cols > 200 || g.rows > 200 || typeof g.cells !== "string" ||
        !decodeCells(createGrid(g.cols, g.rows), g.cells)) {
      return "The grid in that save is broken.";
    }
    const n = g.cols * g.rows;
    if (!Number.isInteger(d.start) || !Number.isInteger(d.goal) || d.start < 0 || d.goal < 0 || d.start >= n || d.goal >= n) {
      return "The start or goal in that save is off the grid.";
    }
  }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

function persist() {
  save.set({
    grid: { cols: grid.cols, rows: grid.rows, cells: encodeCells(grid) },
    start: state.start, goal: state.goal, preset: state.preset,
    tool: state.tool, view: state.view, solo: state.solo, speed: state.speed
  });
}

/* ============================================================
   2. STATE
   ============================================================ */
const state = {
  start: 0,
  goal: 1,
  preset: "trap",
  tool: "wall",
  view: "all",
  solo: "astar",
  speed: 5,
  phase: "idle",       // idle | running | done
  t: 0,                // race clock, in steps
  cursor: null,
  races: 0
};

let grid = createGrid(30, 20);
let results = null;    // { astar: trace, ... } once a race has started
let drag = null;       // { kind: "start" | "goal" | "paint", value, last }

const view = createCanvas(stage, { onResize: () => { fitGrid(); draw(); } });
const ctx = view.ctx;

function cellTarget() { return Math.max(18, Math.min(30, view.width / 40)); }

/* Fit the grid to the stage. A different size is resampled
   from the current grid, and the start and goal move with it. */
function fitGrid() {
  const { cols, rows } = gridFor(view.width, view.height, cellTarget());
  if (cols === grid.cols && rows === grid.rows) { return false; }
  const next = resample(grid, cols, rows);
  state.start = moveIndex(grid, state.start, next);
  state.goal = moveIndex(grid, state.goal, next);
  if (state.cursor) { state.cursor = xy(next, moveIndex(grid, idx(grid, ...state.cursor), next)); }
  grid = next;
  freeMarkers();
  if (results) { recompute(); }
  return true;
}

/* The start and goal never sit on a wall, or on each other. */
function freeMarkers() {
  if (grid.cells[state.start] === WALL) { grid.cells[state.start] = OPEN; }
  if (grid.cells[state.goal] === WALL) { grid.cells[state.goal] = OPEN; }
  if (state.goal === state.start) { state.goal = (state.start + 1) % grid.cells.length; grid.cells[state.goal] = OPEN; }
}

exposeForTests({
  get phase() { return state.phase; },
  get t() { return state.t; },
  get races() { return state.races; },
  get walls() { return grid.cells.reduce((n, v) => n + (v === WALL), 0); },
  get mud() { return grid.cells.reduce((n, v) => n + (v === MUD), 0); },
  get grid() { return [grid.cols, grid.rows]; },
  get start() { return xy(grid, state.start); },
  get goal() { return xy(grid, state.goal); },
  get tool() { return state.tool; },
  get view() { return state.view; },
  /* What the table shows, per algorithm. */
  get results() {
    if (!results) { return null; }
    return Object.fromEntries(ALGOS.map((a) => [a, row(a)]));
  }
});

/* ============================================================
   3. LOOP
   ============================================================ */
function recompute() {
  results = Object.fromEntries(ALGOS.map((a) => [a, search(grid, state.start, state.goal, a)]));
}

const longest = () => Math.max(...ALGOS.map((a) => results[a].steps));

function race() {
  recompute();
  state.t = 0;
  state.phase = "running";
  state.races += 1;
  draw();
}

function update(dt) {
  if (state.phase !== "running") { return; }
  state.t += dt * SPEEDS[state.speed - 1];
  if (state.t >= longest()) { state.t = longest(); state.phase = "done"; }
}

/* How far one algorithm has got at the current race clock. */
function row(a) {
  const r = results[a];
  const t = state.phase === "done" ? Infinity : state.t;
  let explored = r.order.length;
  if (t < r.steps) {
    /* Binary search: how many cells were explored by step t. */
    let lo = 0, hi = r.at.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (r.at[m] <= t) { lo = m + 1; } else { hi = m; } }
    explored = lo;
  }
  const finished = t >= r.steps;
  return {
    explored,
    steps: finished ? r.steps : Math.floor(t),
    finished,
    found: finished ? Boolean(r.path) : null,
    length: finished && r.path ? r.path.length - 1 : null,
    cost: finished && r.path ? r.cost : null
  };
}

/* ---- drawing ---------------------------------------------- */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), line: color("--line"), lineB: color("--line-bright"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"),
  astar: color("--cyan"), dijkstra: color("--amber"), bfs: color("--green"), greedy: color("--hot")
};
const WALL_FILL = "#5C6382";
const MUD_FILL = "#5A3D22";

function rgba(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* Where each panel goes: 2 x 2 for the race, one big one solo. */
function panels() {
  if (state.view === "one") { return [{ algo: state.solo, x: 0, y: 0, w: view.width, h: view.height }]; }
  const w = view.width / 2, h = view.height / 2;
  return ALGOS.map((algo, k) => ({ algo, x: (k % 2) * w, y: Math.floor(k / 2) * h, w, h }));
}

/* Cell size and offset inside a panel (cells stay square). */
function layout(p) {
  const pad = state.view === "all" ? 3 : 0;
  const top = state.view === "all" ? 18 : 0;
  const cs = Math.max(1, Math.min((p.w - pad * 2) / grid.cols, (p.h - pad * 2 - top) / grid.rows));
  const ox = p.x + (p.w - cs * grid.cols) / 2;
  const oy = p.y + top + (p.h - top - cs * grid.rows) / 2;
  return { cs, ox, oy };
}

function draw() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, view.width, view.height);
  for (const p of panels()) { drawPanel(p); }
}

function drawPanel(p) {
  const { cs, ox, oy } = layout(p);
  const { cols, rows, cells } = grid;
  const col = C[p.algo];

  ctx.fillStyle = C.bg2;
  ctx.fillRect(ox, oy, cs * cols, cs * rows);

  /* Explored cells, in this algorithm's colour. */
  if (results) {
    const r = results[p.algo];
    const n = row(p.algo).explored;
    ctx.fillStyle = rgba(col, 0.28);
    for (let k = 0; k < n; k++) {
      const [x, y] = xy(grid, r.order[k]);
      ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
    }
    /* The newest few, brighter: where it's looking right now. */
    if (n < r.order.length) {
      ctx.fillStyle = rgba(col, 0.7);
      for (let k = Math.max(0, n - 6); k < n; k++) {
        const [x, y] = xy(grid, r.order[k]);
        ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
      }
    }
  }

  /* Walls and mud. */
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === OPEN) { continue; }
    const x = i % cols, y = (i - x) / cols;
    ctx.fillStyle = cells[i] === WALL ? WALL_FILL : MUD_FILL;
    ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
  }

  /* Grid lines, when the cells are big enough to see them. */
  if (cs >= 9) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) { const px = Math.round(ox + x * cs) + 0.5; ctx.moveTo(px, oy); ctx.lineTo(px, oy + rows * cs); }
    for (let y = 0; y <= rows; y++) { const py = Math.round(oy + y * cs) + 0.5; ctx.moveTo(ox, py); ctx.lineTo(ox + cols * cs, py); }
    ctx.stroke();
  }

  /* The path, once this algorithm has finished. */
  if (results) {
    const r = results[p.algo];
    const st = row(p.algo);
    if (st.finished && r.path && r.path.length > 1) {
      const pts = r.path.map((i) => xy(grid, i)).map(([x, y]) => [ox + (x + 0.5) * cs, oy + (y + 0.5) * cs]);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = C.bg;
      ctx.lineWidth = Math.max(3, cs * 0.5);
      stroke(pts);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, cs * 0.3);
      stroke(pts);
    }
  }

  marker(state.start, "S", C.bfs, cs, ox, oy);
  marker(state.goal, "G", C.greedy, cs, ox, oy);

  /* Keyboard cursor, only while the grid has focus. */
  if (state.cursor && document.activeElement === stage) {
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(ox + state.cursor[0] * cs, oy + state.cursor[1] * cs, cs, cs);
    ctx.setLineDash([]);
  }

  /* Label (race view): name, plus a tick or cross when done. */
  if (state.view === "all") {
    ctx.font = "700 12px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = col;
    ctx.fillRect(p.x + 6, p.y + 6, 8, 8);
    ctx.fillStyle = C.text;
    let label = ALGO_NAMES[p.algo];
    if (results) {
      const st = row(p.algo);
      label += st.finished ? (st.found ? `  ✓ ${st.explored} explored` : "  ✗ no path") : `  ${st.explored}…`;
    }
    ctx.fillText(label, p.x + 18, p.y + 10.5);
  }
}

function stroke(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) { ctx.lineTo(x, y); }
  ctx.stroke();
}

function marker(i, letter, fill, cs, ox, oy) {
  const [x, y] = xy(grid, i);
  const cx = ox + (x + 0.5) * cs, cy = oy + (y + 0.5) * cs;
  const r = Math.max(4, cs * 0.48);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (r >= 6) {
    ctx.fillStyle = C.bg;
    ctx.font = `700 ${Math.round(r * 1.2)}px 'Space Grotesk', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, cx, cy + 1);
  }
}

/* ---- the results table ------------------------------------ */
const tbody = $("results");
const rowEls = {};
for (const a of ALGOS) {
  const tr = document.createElement("tr");
  const name = document.createElement("td");
  const dot = document.createElement("span");
  dot.className = `pf-dot is-${a}`;
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = a === "greedy" ? "Greedy" : a === "bfs" ? "BFS" : ALGO_NAMES[a];
  const win = document.createElement("span");
  win.className = "pf-win";
  name.append(dot, label, win);
  const cells = [name, ...Array.from({ length: 4 }, () => document.createElement("td"))];
  tr.append(...cells);
  tbody.append(tr);
  rowEls[a] = { tr, win, explored: cells[1], length: cells[2], cost: cells[3], steps: cells[4] };
}

function table() {
  const rows = results ? Object.fromEntries(ALGOS.map((a) => [a, row(a)])) : null;
  /* The race winner: fewest steps among those that found a path. */
  let best = null;
  if (rows && state.phase === "done") {
    for (const a of ALGOS) { if (rows[a].found && (!best || results[a].steps < results[best].steps)) { best = a; } }
  }
  /* Cheapest path (Dijkstra and A* always tie here). */
  const cheapest = rows && state.phase === "done" ? Math.min(...ALGOS.map((a) => rows[a].cost ?? Infinity)) : null;
  for (const a of ALGOS) {
    const el = rowEls[a];
    const r = rows && rows[a];
    el.explored.textContent = r ? String(r.explored) : "-";
    el.steps.textContent = r ? String(r.steps) : "-";
    el.length.textContent = r && r.finished ? (r.found ? String(r.length) : "none") : "-";
    el.cost.textContent = r && r.finished && r.found ? `${r.cost}${r.cost === cheapest ? " ★" : ""}` : "-";
    el.win.textContent = a === best ? "1st" : "";
    el.tr.classList.toggle("is-dim", state.view === "one" && a !== state.solo);
  }
}

/* ============================================================
   4. INPUT
   ============================================================ */

/* Which panel and cell a point is over (or null). */
function hit(p) {
  for (const pan of panels()) {
    if (p.x < pan.x || p.x >= pan.x + pan.w || p.y < pan.y || p.y >= pan.y + pan.h) { continue; }
    const { cs, ox, oy } = layout(pan);
    const x = Math.floor((p.x - ox) / cs), y = Math.floor((p.y - oy) / cs);
    return {
      x: Math.max(0, Math.min(grid.cols - 1, x)),
      y: Math.max(0, Math.min(grid.rows - 1, y)),
      inside: x >= 0 && y >= 0 && x < grid.cols && y < grid.rows
    };
  }
  return null;
}

/* Something changed the grid: a finished race re-runs instantly,
   a running one carries on with the new grid. */
function edited() {
  if (results) { recompute(); if (state.phase === "done") { state.t = longest(); } }
  state.preset = null;
  syncPresetButtons();
}

function paintCell(x, y, value) {
  const i = idx(grid, x, y);
  if (i === state.start || i === state.goal || grid.cells[i] === value) { return false; }
  grid.cells[i] = value;
  return true;
}

function paintLine(from, to, value) {
  const n = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  let changed = false;
  for (let k = 0; k <= n; k++) {
    changed = paintCell(Math.round(from.x + ((to.x - from.x) * k) / n), Math.round(from.y + ((to.y - from.y) * k) / n), value) || changed;
  }
  return changed;
}

const toolValue = (start) => {
  if (state.tool === "erase") { return OPEN; }
  const v = state.tool === "wall" ? WALL : MUD;
  /* Starting a stroke on that same thing rubs it out instead. */
  return grid.cells[start] === v ? OPEN : v;
};

pointer(stage, {
  down(p) {
    const c = hit(p);
    if (!c || !c.inside) { return; }
    const i = idx(grid, c.x, c.y);
    if (i === state.start) { drag = { kind: "start" }; return; }
    if (i === state.goal) { drag = { kind: "goal" }; return; }
    drag = { kind: "paint", value: toolValue(i), last: c };
    if (paintLine(c, c, drag.value)) { edited(); draw(); table(); }
  },
  move(p, held) {
    if (!held || !drag) { return; }
    const c = hit(p);
    if (!c) { return; }
    if (drag.kind === "paint") {
      if (paintLine(drag.last, c, drag.value)) { edited(); draw(); table(); }
      drag.last = c;
    } else {
      moveMarker(drag.kind, idx(grid, c.x, c.y));
    }
  },
  up() { if (drag) { drag = null; persist(); } }
});

function moveMarker(kind, i) {
  const other = kind === "start" ? state.goal : state.start;
  if (i === other || i === state[kind]) { return; }
  state[kind] = i;
  if (grid.cells[i] === WALL) { grid.cells[i] = OPEN; }
  edited();
  draw();
  table();
}

/* Keyboard on the focused grid: a cursor that paints. */
stage.addEventListener("focus", () => {
  if (!state.cursor) { state.cursor = xy(grid, state.start); }
  draw();
});
stage.addEventListener("blur", () => draw());

stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const c = state.cursor || xy(grid, state.start);
  const d = e.shiftKey ? 4 : 1;
  const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
  if (moves[e.key]) {
    const [dx, dy] = moves[e.key];
    state.cursor = [Math.max(0, Math.min(grid.cols - 1, c[0] + dx)), Math.max(0, Math.min(grid.rows - 1, c[1] + dy))];
  } else if (e.key === " " || e.key === "Enter") {
    state.cursor = c;
    const i = idx(grid, c[0], c[1]);
    if (paintCell(c[0], c[1], toolValue(i))) { edited(); persist(); }
  } else if (e.key === "s" || e.key === "S" || e.key === "g" || e.key === "G") {
    state.cursor = c;
    moveMarker(e.key.toLowerCase() === "s" ? "start" : "goal", idx(grid, c[0], c[1]));
    persist();
  } else { return; }
  e.preventDefault();
  draw();
  table();
});

const keys = createKeys({ run: ["KeyR"], clear: ["KeyX"], t1: ["Digit1", "Numpad1"], t2: ["Digit2", "Numpad2"], t3: ["Digit3", "Numpad3"] });
keys.on("run", () => race());
keys.on("clear", () => doClear());
keys.on("t1", () => setTool("wall"));
keys.on("t2", () => setTool("mud"));
keys.on("t3", () => setTool("erase"));

function doClear() {
  grid.cells.fill(OPEN);
  edited();
  persist();
  draw();
  table();
}

function doReset() {
  results = null;
  state.phase = "idle";
  state.t = 0;
  draw();
  table();
}

let mazeSeed = 1;
function setPreset(name) {
  const { start, goal } = applyPreset(grid, name, name === "maze" ? mazeSeed++ : 1);
  state.start = start;
  state.goal = goal;
  state.preset = name;
  freeMarkers();
  syncPresetButtons();
  doReset();
  persist();
}

function setTool(t) {
  state.tool = t;
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === t)); }
  persist();
}

function setView(v, solo = state.solo) {
  state.view = v;
  state.solo = solo;
  for (const b of document.querySelectorAll("[data-view]")) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); }
  for (const b of document.querySelectorAll("[data-solo]")) { b.setAttribute("aria-pressed", String(b.dataset.solo === solo)); }
  $("solo").hidden = v !== "one";
  persist();
  draw();
  table();
}

function syncPresetButtons() {
  for (const b of document.querySelectorAll("[data-preset]")) { b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)); }
}

function syncSpeed() {
  $("speed").value = String(state.speed);
  $("speed-out").textContent = `${SPEEDS[state.speed - 1]} steps/s`;
}

for (const b of document.querySelectorAll("[data-tool]")) { b.addEventListener("click", () => setTool(b.dataset.tool)); }
for (const b of document.querySelectorAll("[data-view]")) { b.addEventListener("click", () => setView(b.dataset.view)); }
for (const b of document.querySelectorAll("[data-solo]")) { b.addEventListener("click", () => setView("one", b.dataset.solo)); }
for (const b of document.querySelectorAll("[data-preset]")) { b.addEventListener("click", () => setPreset(b.dataset.preset)); }
$("run").addEventListener("click", race);
$("reset").addEventListener("click", doReset);
$("clear").addEventListener("click", doClear);
$("speed").addEventListener("input", (e) => {
  state.speed = Math.max(1, Math.min(SPEEDS.length, Math.round(Number(e.target.value))));
  syncSpeed();
  persist();
});

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.tool = ok.tool;
  state.speed = ok.speed;
  if (ok.grid) {
    const saved = createGrid(ok.grid.cols, ok.grid.rows);
    decodeCells(saved, ok.grid.cells);
    state.start = moveIndex(saved, ok.start, grid);
    state.goal = moveIndex(saved, ok.goal, grid);
    grid = resample(saved, grid.cols, grid.rows);
    state.preset = ok.preset;
    freeMarkers();
  } else {
    setPreset(ok.preset || "trap");
  }
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)); }
  syncPresetButtons();
  syncSpeed();
  doReset();
  setView(ok.view, ok.solo);
}

/* ============================================================
   GO
   Reduced motion: the race replays slowly (20 steps/s). Nothing
   moves until you press Race!.
   ============================================================ */
fitGrid();
apply(save.get());
let lastPhase = "";
let lastRow = "";
startLoop({
  update,
  draw() {
    draw();
    /* The table only changes while racing: skip DOM work otherwise. */
    const sig = state.phase + (results ? state.t.toFixed(0) : "");
    if (sig !== lastRow || state.phase !== lastPhase) { table(); lastRow = sig; lastPhase = state.phase; }
  }
});

stage.dataset.ready = "true";
