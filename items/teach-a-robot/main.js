/* ============================================================
   Teach a Robot - main script

   The learning lives in rl.js (Q-learning, the maze, the
   cart-pole). This file only does pictures, buttons and saving.

   Sections:
     1. save       the maze + settings for each scene
     2. state      one "brain" (Q table + history) per scene
     3. learning   Train (many runs a frame) and Watch (real time)
     4. drawing    maze, cart-pole, reward chart
     5. input      tap/click, keyboard, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave, isPlainObject } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import * as RL from "./rl.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const msg = $("msg");

const SCENES = ["maze", "cart"];
const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500];      // practice runs per frame
const DISCOUNTS = [0, 0.5, 0.8, 0.9, 0.95, 0.98, 0.99, 0.995, 0.999];
const FADE = { maze: 0.98, cart: 0.998 };                   // exploration x this, each run
const BUDGET_MS = 8;           // never spend longer than this per frame training
const MAZE_MOVES_PER_S = 7;    // Watch speed in the maze
const CART_HZ = 1 / RL.CART.tau;
const HISTORY_MAX = 400;
const POKE = 0.5;              // rad/s added to the pole's spin by a poke

/* ============================================================
   1. SAVE
   ============================================================ */
const mazeData = (m) => ({ w: m.w, h: m.h, cells: [...m.cells], start: m.start, goal: m.goal });
const DEFAULT_SETTINGS = {
  maze: { lr: 50, discount: 4, explore: 20, decay: true, speed: 0 },
  cart: { lr: 20, discount: 6, explore: 20, decay: true, speed: 3 }
};
const DEFAULTS = { scene: "maze", maze: mazeData(RL.defaultMaze()), settings: structuredClone(DEFAULT_SETTINGS) };

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function validate(d) {
  if (!SCENES.includes(d.scene)) { return "That save is for a scene this page doesn't have."; }
  const m = d.maze;
  if (!isPlainObject(m) || !isInt(m.w, 3, 12) || !isInt(m.h, 3, 12) || !Array.isArray(m.cells) || m.cells.length !== m.w * m.h) {
    return "The maze in that save doesn't look right.";
  }
  if (!m.cells.every((c) => c === RL.EMPTY || c === RL.WALL || c === RL.PIT)) { return "One of the maze squares in that save is broken."; }
  const n = m.w * m.h;
  if (!isInt(m.start, 0, n - 1) || !isInt(m.goal, 0, n - 1) || m.start === m.goal || m.cells[m.start] || m.cells[m.goal]) {
    return "The start or goal in that save is in the wrong place.";
  }
  if (!isPlainObject(d.settings)) { return "That save has no settings."; }
  for (const id of SCENES) {
    const s = d.settings[id];
    if (!isPlainObject(s) || !isInt(s.lr, 1, 100) || !isInt(s.discount, 0, DISCOUNTS.length - 1) ||
        !isInt(s.explore, 0, 20) || typeof s.decay !== "boolean" || !isInt(s.speed, 0, SPEEDS.length - 1)) {
      return "The settings in that save are out of range.";
    }
  }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

const loaded = save.get();
const start = validate(loaded) === true ? loaded : structuredClone(DEFAULTS);

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save.set({ scene: state.scene, maze: mazeData(state.maze), settings: state.settings }), 300);
}

/* ============================================================
   2. STATE
   Each scene has its own brain, so you can flip between them
   without either forgetting.
   ============================================================ */
const state = {
  scene: start.scene,
  maze: start.maze,
  settings: start.settings,
  mode: "off",          // "train" | "watch" | "off"
  lastMode: "train",
  cursor: { x: 0, y: 0, show: false }
};
let seed = 1;

function newBrain(scene) {
  seed += 1;
  return {
    Q: scene === "maze" ? RL.createQ(state.maze.w * state.maze.h, 4) : RL.createQ(RL.CART_STATES, 2),
    episode: 0,
    sinceChange: 0,      // runs since the exploration last woke up
    history: [],         // reward per run, averaged in blocks as it grows
    stride: 1,
    block: [0, 0],       // [sum, count] of the block being filled
    first: [],           // the first 20 rewards
    recent: [],          // the last 20 rewards
    last: null,
    best: null,
    bestSteps: 0,
    rand: RL.rng(seed * 7919)
  };
}
const brains = { maze: newBrain("maze"), cart: newBrain("cart") };
const brain = () => brains[state.scene];
const set = () => state.settings[state.scene];

function exploreNow(b = brain(), scene = state.scene) {
  const s = state.settings[scene];
  return RL.exploreAt(s.explore / 20, b.sinceChange, { decay: s.decay, rate: FADE[scene] });
}
function params() {
  const s = set();
  return { alpha: s.lr / 100, gamma: DISCOUNTS[s.discount], eps: exploreNow() };
}

/* What the robot on screen is doing right now. In Watch it's a
   real practice run. In Train it's a live test of its best guesses
   (no exploring, no learning) while the fast practice runs behind. */
const runner = { s: 0, prev: 0, st: [0, 0, 0, 0], acc: 0, steps: 0, reward: 0, rest: 0, end: null, push: 0 };

function restartRunner() {
  const b = brain();
  runner.s = runner.prev = state.maze.start;
  runner.st = RL.cartStart(b.rand);
  runner.acc = 0;
  runner.steps = 0;
  runner.reward = 0;
  runner.rest = 0;
  runner.end = null;
  runner.push = 0;
}

let calm = reducedMotion();
onMotionChange((v) => { calm = v; });

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const countCells = (v) => state.maze.cells.filter((c) => c === v).length;

/* Read-only window for smoke.js. */
exposeForTests({
  get scene() { return state.scene; },
  get mode() { return state.mode; },
  get running() { return Boolean(loop) && !loop.paused; },
  get episodes() { return brain().episode; },
  get firstAvg() { return mean(brain().first); },
  get recentAvg() { return mean(brain().recent); },
  get walls() { return countCells(RL.WALL); },
  get pits() { return countCells(RL.PIT); }
});

/* ============================================================
   3. LEARNING
   ============================================================ */
function record(b, reward, steps) {
  b.episode += 1;
  b.bestSteps = Math.max(b.bestSteps, steps);
  b.sinceChange += 1;
  b.last = reward;
  b.best = b.best == null ? reward : Math.max(b.best, reward);
  if (b.first.length < 20) { b.first.push(reward); }
  b.recent.push(reward);
  if (b.recent.length > 20) { b.recent.shift(); }
  b.block[0] += reward;
  b.block[1] += 1;
  if (b.block[1] >= b.stride) {
    b.history.push(b.block[0] / b.block[1]);
    b.block = [0, 0];
    if (b.history.length > HISTORY_MAX) {
      /* Keep the chart a fixed size: average pairs, halve the rate. */
      const h = b.history;
      b.history = Array.from({ length: h.length >> 1 }, (_, i) => (h[2 * i] + h[2 * i + 1]) / 2);
      b.stride *= 2;
    }
  }
}

/* Train: lots of whole practice runs, inside a time budget. */
function trainFrame() {
  const b = brain();
  const t0 = performance.now();
  for (let i = 0; i < SPEEDS[set().speed]; i++) {
    const res = state.scene === "maze"
      ? RL.mazeEpisode(state.maze, b.Q, params(), b.rand)
      : RL.cartEpisode(b.Q, params(), b.rand);
    record(b, res.reward, res.steps);
    if (performance.now() - t0 > BUDGET_MS) { break; }
  }
  routeDirty = true;
}

/* One move of the robot on screen. learn = Watch mode. */
function mazeMove(learn) {
  const b = brain(), m = state.maze;
  const res = learn
    ? RL.mazeTick(m, b.Q, runner.s, params(), b.rand)
    : RL.mazeMove(m, runner.s, RL.bestAction(b.Q, runner.s, b.rand));
  runner.prev = runner.s;
  runner.s = res.s2;
  runner.steps += 1;
  runner.reward += res.r;
  if (learn) { routeDirty = true; }
  if (res.done || runner.steps >= RL.mazeMaxSteps(m)) {
    runner.end = res.done ? res.what : "timeout";
    if (learn) { record(b, runner.reward, runner.steps); }
    runner.rest = 0.7;
  }
}

function cartMove(learn) {
  const b = brain();
  let failed;
  if (learn) {
    const res = RL.cartTick(b.Q, runner.st, params(), b.rand);
    runner.st = res.st;
    runner.push = res.a ? 1 : -1;
    runner.reward += res.r;
    failed = res.failed;
  } else {
    const a = RL.bestAction(b.Q, RL.cartBin(runner.st), b.rand);
    runner.st = RL.cartStep(runner.st, a);
    runner.push = a ? 1 : -1;
    failed = RL.cartFailed(runner.st);
  }
  runner.steps += 1;
  if (failed || runner.steps >= RL.CART.maxSteps) {
    runner.end = failed ? "fell" : "goal";
    if (learn) { record(b, runner.reward, runner.steps); }
    runner.rest = failed ? 0.8 : 1.5;
  }
}

/* Move the on-screen robot in real time. */
function animate(dt) {
  const learn = state.mode === "watch";
  if (runner.end) {
    runner.rest -= dt;
    if (runner.rest <= 0) { restartRunner(); }
    return;
  }
  const rate = state.scene === "maze" ? MAZE_MOVES_PER_S : CART_HZ;
  runner.acc += dt * rate;
  while (runner.acc >= 1 && !runner.end) {
    runner.acc -= 1;
    if (state.scene === "maze") { mazeMove(learn); } else { cartMove(learn); }
  }
}

function update(dt) {
  if (state.mode === "off") { return; }
  if (state.mode === "train") { trainFrame(); }
  animate(dt);
}

/* ============================================================
   4. DRAWING
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber"), green: color("--green"),
  bg: color("--bg"), bg2: color("--bg-2"), surface: color("--surface"), surface2: color("--surface-2"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"),
  line: color("--line"), lineBright: color("--line-bright")
};
function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const BASE = rgb(C.bg2), CYAN = rgb(C.cyan);
const mix = (t) => `rgb(${BASE.map((v, i) => Math.round(v + (CYAN[i] - v) * t)).join(", ")})`;

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;
const HUD_ROOM = 46;   // keep the top clear for the Run / Reward readout

/* ---- the robot -------------------------------------------- */
function drawRobot(cx, cy, size, mood = "ok") {
  const w = size * 0.62, h = size * 0.5;
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx, cy - h / 2 - size * 0.14);
  ctx.stroke();
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.arc(cx, cy - h / 2 - size * 0.16, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mood === "sad" ? C.hot : C.text;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, size * 0.12);
  ctx.fill();
  ctx.fillStyle = C.bg;
  const eye = size * 0.07;
  ctx.beginPath();
  ctx.arc(cx - w * 0.22, cy - h * 0.06, eye, 0, Math.PI * 2);
  ctx.arc(cx + w * 0.22, cy - h * 0.06, eye, 0, Math.PI * 2);
  ctx.fill();
  if (mood === "happy") {
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = Math.max(1.2, size * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy + h * 0.06, w * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

/* ---- the maze --------------------------------------------- */
let route = [];
let routeDirty = true;

function mazeBox() {
  const m = state.maze;
  const pad = 10;
  const room = Math.min(view.width - 2 * pad, view.height - HUD_ROOM - pad);
  const cell = Math.max(8, Math.floor(room / Math.max(m.w, m.h)));
  const x = Math.round((view.width - cell * m.w) / 2);
  const y = Math.round(HUD_ROOM + (view.height - HUD_ROOM - pad - cell * m.h) / 2);
  return { x, y, cell };
}
const cellCentre = (b, s) => {
  const m = state.maze, cx = s % m.w;
  return [b.x + (cx + 0.5) * b.cell, b.y + ((s - cx) / m.w + 0.5) * b.cell];
};

function drawArrow(cx, cy, a, len) {
  const [dx, dy] = RL.MOVES[a];
  const tx = cx + dx * len, ty = cy + dy * len;
  const bx = cx - dx * len * 0.6, by = cy - dy * len * 0.6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  const hx = -dy * len * 0.45, hy = dx * len * 0.45;
  ctx.moveTo(tx - dx * len * 0.5 + hx, ty - dy * len * 0.5 + hy);
  ctx.lineTo(tx, ty);
  ctx.lineTo(tx - dx * len * 0.5 - hx, ty - dy * len * 0.5 - hy);
  ctx.stroke();
}

function drawMaze() {
  const m = state.maze, b = mazeBox(), Q = brain().Q, k = b.cell;
  if (routeDirty) { route = RL.greedyRoute(m, Q); routeDirty = false; }
  const onRoute = new Set(route);

  /* The value heatmap: how much reward the robot expects from each square. */
  let lo = Infinity, hi = -Infinity;
  const V = new Float64Array(m.w * m.h);
  const known = new Uint8Array(m.w * m.h);
  for (let s = 0; s < V.length; s++) {
    if (m.cells[s] !== RL.EMPTY || s === m.goal || RL.allSame(Q, s)) { continue; }
    known[s] = 1;
    V[s] = RL.maxQ(Q, s);
    lo = Math.min(lo, V[s]);
    hi = Math.max(hi, V[s]);
  }
  const span = Math.max(1e-6, hi - lo);

  for (let s = 0; s < V.length; s++) {
    const x = b.x + (s % m.w) * k, y = b.y + Math.floor(s / m.w) * k;
    const c = m.cells[s];
    if (c === RL.WALL) {
      ctx.fillStyle = C.surface2;
      ctx.fillRect(x, y, k, k);
      ctx.strokeStyle = C.lineBright;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, k - 5, k - 5);
      continue;
    }
    ctx.fillStyle = known[s] ? mix(0.08 + 0.62 * Math.pow((V[s] - lo) / span, 1.4)) : C.bg2;
    ctx.fillRect(x, y, k, k);
    if (c === RL.PIT) {
      ctx.fillStyle = C.bg;
      ctx.beginPath();
      ctx.arc(x + k / 2, y + k / 2, k * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.hot;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* Grid lines. */
  ctx.strokeStyle = "rgba(236, 238, 246, .07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= m.w; i++) { ctx.moveTo(b.x + i * k + 0.5, b.y); ctx.lineTo(b.x + i * k + 0.5, b.y + m.h * k); }
  for (let j = 0; j <= m.h; j++) { ctx.moveTo(b.x, b.y + j * k + 0.5); ctx.lineTo(b.x + m.w * k, b.y + j * k + 0.5); }
  ctx.stroke();

  /* The goal: a flag. The start: a ring. */
  const [gx, gy] = cellCentre(b, m.goal);
  ctx.fillStyle = "rgba(61, 245, 160, .22)";
  ctx.fillRect(gx - k / 2, gy - k / 2, k, k);
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx - k * 0.16, gy + k * 0.3);
  ctx.lineTo(gx - k * 0.16, gy - k * 0.3);
  ctx.stroke();
  ctx.fillStyle = C.green;
  ctx.beginPath();
  ctx.moveTo(gx - k * 0.16, gy - k * 0.3);
  ctx.lineTo(gx + k * 0.24, gy - k * 0.17);
  ctx.lineTo(gx - k * 0.16, gy - k * 0.04);
  ctx.fill();
  const [sx, sy] = cellCentre(b, m.start);
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(sx - k / 2 + 3, sy - k / 2 + 3, k - 6, k - 6);
  ctx.setLineDash([]);

  /* Arrows: the best move it knows from each square. */
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let s = 0; s < V.length; s++) {
    if (!known[s] || onRoute.has(s)) { continue; }
    const [cx, cy] = cellCentre(b, s);
    ctx.strokeStyle = "rgba(236, 238, 246, .5)";
    ctx.lineWidth = Math.max(1.2, k * 0.04);
    drawArrow(cx, cy, RL.bestAction(Q, s, () => 0), k * 0.2);
  }

  /* Its best route from the start, in amber. */
  if (route.length > 1) {
    const solved = route[route.length - 1] === m.goal;
    ctx.strokeStyle = solved ? C.amber : "rgba(255, 201, 60, .55)";
    ctx.lineWidth = Math.max(2, k * 0.07);
    ctx.setLineDash(solved ? [] : [k * 0.12, k * 0.12]);
    ctx.beginPath();
    route.forEach((s, i) => {
      const [cx, cy] = cellCentre(b, s);
      if (i) { ctx.lineTo(cx, cy); } else { ctx.moveTo(cx, cy); }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* The robot, gliding between squares. */
  const t = runner.end || state.mode === "off" ? 1 : Math.min(1, runner.acc);
  const [ax, ay] = cellCentre(b, runner.prev);
  const [bx, by] = cellCentre(b, runner.s);
  const mood = runner.end === "goal" ? "happy" : runner.end === "pit" ? "sad" : "ok";
  drawRobot(ax + (bx - ax) * t, ay + (by - ay) * t, k * 0.9, mood);

  /* Keyboard cursor. */
  if (state.cursor.show) {
    ctx.strokeStyle = C.hot;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + state.cursor.x * k + 2, b.y + state.cursor.y * k + 2, k - 4, k - 4);
  }
}

/* ---- the cart-pole ---------------------------------------- */
function cartBox() {
  const ppm = (view.width * 0.84) / (2 * RL.CART.xLimit);   // pixels per metre
  return { ppm, x0: view.width / 2, y0: HUD_ROOM + (view.height - HUD_ROOM) * 0.66 };
}

function drawCart() {
  const { ppm, x0, y0 } = cartBox();
  const [x, , th] = runner.st;
  const W = view.width;

  /* The track, with stops at the ends. */
  ctx.strokeStyle = C.lineBright;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.04, y0 + 0.5);
  ctx.lineTo(W * 0.96, y0 + 0.5);
  ctx.stroke();
  ctx.fillStyle = C.hot;
  for (const side of [-1, 1]) {
    ctx.fillRect(x0 + side * RL.CART.xLimit * ppm - 2, y0 - 14, 4, 14);
  }
  ctx.fillStyle = C.faint;
  ctx.fillRect(x0 - 1, y0 + 4, 2, 6);

  const cx = x0 + x * ppm;
  const cw = 0.5 * ppm, ch = 0.3 * ppm;
  const top = y0 - ch - 6;

  /* The safe zone for the pole: +-12 degrees. */
  const len = 2 * RL.CART.halfLength * ppm * 1.6;
  ctx.fillStyle = "rgba(61, 245, 160, .07)";
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.arc(cx, top, len * 1.08, -Math.PI / 2 - RL.CART.thetaLimit, -Math.PI / 2 + RL.CART.thetaLimit);
  ctx.closePath();
  ctx.fill();

  /* The push it chose: an arrow on the side it pushes from. */
  if (runner.push && state.mode !== "off" && !runner.end) {
    const dir = runner.push;
    const ax = cx - dir * (cw / 2 + 6);
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.moveTo(ax, top + ch / 2);
    ctx.lineTo(ax - dir * 12, top + ch / 2 - 7);
    ctx.lineTo(ax - dir * 12, top + ch / 2 + 7);
    ctx.fill();
  }

  /* Wheels, then the cart (with a face: it's the robot). */
  ctx.fillStyle = C.dim;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * cw * 0.3, y0 - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = runner.end === "fell" ? C.hot : C.text;
  ctx.beginPath();
  ctx.roundRect(cx - cw / 2, top, cw, ch, 5);
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.beginPath();
  ctx.arc(cx - cw * 0.2, top + ch * 0.45, 2.6, 0, Math.PI * 2);
  ctx.arc(cx + cw * 0.2, top + ch * 0.45, 2.6, 0, Math.PI * 2);
  ctx.fill();

  /* The pole (drawn 1.6x long so it's easy to see). */
  ctx.strokeStyle = runner.end === "fell" ? C.hot : C.amber;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx + Math.sin(th) * len, top - Math.cos(th) * len);
  ctx.stroke();
  ctx.fillStyle = C.lineBright;
  ctx.beginPath();
  ctx.arc(cx, top, 4, 0, Math.PI * 2);
  ctx.fill();

  /* What just happened. */
  if (runner.end) {
    ctx.fillStyle = runner.end === "fell" ? C.hot : C.green;
    ctx.font = "700 15px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(runner.end === "fell" ? "Fell over!" : "Made it to 50 s!", W / 2, y0 + 34);
  }
}

/* ---- the reward chart ------------------------------------- */
const chartView = createCanvas($("chart-box"), { onResize: () => drawChart() });
const cctx = chartView.ctx;

function drawChart() {
  const W = chartView.width, H = chartView.height;
  cctx.fillStyle = C.surface;
  cctx.fillRect(0, 0, W, H);
  const h = brain().history;
  if (h.length < 2) {
    cctx.fillStyle = C.faint;
    cctx.font = "500 12px 'JetBrains Mono', monospace";
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    cctx.fillText("Press Train to start", W / 2, H / 2);
    return;
  }
  let lo = 0, hi = 1;
  for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = 6;
  const yOf = (v) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad);
  const xOf = (i) => (i / (h.length - 1)) * W;

  /* Zero reward. */
  cctx.strokeStyle = C.line;
  cctx.lineWidth = 1;
  cctx.beginPath();
  cctx.moveTo(0, Math.round(yOf(0)) + 0.5);
  cctx.lineTo(W, Math.round(yOf(0)) + 0.5);
  cctx.stroke();

  cctx.beginPath();
  h.forEach((v, i) => (i ? cctx.lineTo(xOf(i), yOf(v)) : cctx.moveTo(xOf(i), yOf(v))));
  cctx.lineTo(W, yOf(lo));
  cctx.lineTo(0, yOf(lo));
  cctx.closePath();
  cctx.fillStyle = "rgba(53, 214, 245, .14)";
  cctx.fill();
  cctx.beginPath();
  h.forEach((v, i) => (i ? cctx.lineTo(xOf(i), yOf(v)) : cctx.moveTo(xOf(i), yOf(v))));
  cctx.strokeStyle = C.cyan;
  cctx.lineWidth = 2;
  cctx.lineJoin = "round";
  cctx.stroke();
}

/* ---- all together ----------------------------------------- */
function draw() {
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);
  if (state.scene === "maze") { drawMaze(); } else { drawCart(); }
  drawChart();
  hud();
}

const fmt = (v) => (v == null ? "-" : String(Math.round(v * 10) / 10));
function hud() {
  const b = brain();
  $("episode").textContent = String(b.episode);
  if (state.scene === "maze") {
    $("score-label").textContent = "Reward";
    $("score").textContent = state.mode === "watch" ? fmt(runner.reward) : fmt(b.last);
    const solved = route.length > 1 && route[route.length - 1] === state.maze.goal;
    $("brain-note").textContent = solved ? `Best route: ${route.length - 1} moves` : "No route yet";
  } else {
    $("score-label").textContent = "Up";
    $("score").textContent = `${(runner.steps * RL.CART.tau).toFixed(1)} s`;
    $("brain-note").textContent = b.episode ? `Best run: ${(b.bestSteps * RL.CART.tau).toFixed(1)} s` : "";
  }
  const avg = mean(b.recent);
  $("avg").textContent = avg == null ? "" : `last 20: ${fmt(avg)}`;
  $("eps-now").textContent = exploreNow().toFixed(2);
  msg.hidden = state.mode !== "off";
}

/* ============================================================
   5. INPUT
   ============================================================ */

/* ---- maze editing ----------------------------------------- */
function cellAt(px, py) {
  const m = state.maze, b = mazeBox();
  const cx = Math.floor((px - b.x) / b.cell), cy = Math.floor((py - b.y) / b.cell);
  return cx < 0 || cy < 0 || cx >= m.w || cy >= m.h ? -1 : cy * m.w + cx;
}

/* Empty -> wall -> pit -> empty. The start and goal stay put. */
function setCell(s, value) {
  const m = state.maze;
  if (s < 0 || s === m.start || s === m.goal || m.cells[s] === value) { return false; }
  m.cells[s] = value;
  return true;
}

function mazeChanged() {
  /* A new maze: exploring wakes up again, and the robot starts over. */
  brain().sinceChange = 0;
  routeDirty = true;
  restartRunner();
  persist();
  draw();
}

let paint = null;   // the value a drag paints with
pointer(stage, {
  down(p) {
    state.cursor.show = false;
    if (state.scene === "cart") {
      /* Tap beside the pole: a poke from the left tips it right. */
      poke(p.x < cartBox().x0 + runner.st[0] * cartBox().ppm ? 1 : -1);
      return;
    }
    const s = cellAt(p.x, p.y);
    if (s < 0) { return; }
    paint = (state.maze.cells[s] + 1) % 3;
    if (setCell(s, paint)) { mazeChanged(); }
  },
  move(p, held) {
    if (!held || paint == null || state.scene !== "maze") { return; }
    if (setCell(cellAt(p.x, p.y), paint)) { mazeChanged(); }
  },
  up() { paint = null; }
});

/* Poke the pole: dir -1 tips it left, +1 tips it right. */
function poke(dir) {
  if (state.scene !== "cart" || runner.end) { return; }
  runner.st = [runner.st[0], runner.st[1], runner.st[2], runner.st[3] + dir * POKE];
  draw();
}

/* Keyboard on the focused stage: a cursor in the maze, pokes on the cart. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const c = state.cursor, m = state.maze;
  if (state.scene === "cart") {
    if (e.key === "ArrowLeft") { poke(-1); } else if (e.key === "ArrowRight") { poke(1); } else { return; }
    e.preventDefault();
    return;
  }
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (moves[e.key]) {
    c.x = Math.max(0, Math.min(m.w - 1, c.x + moves[e.key][0]));
    c.y = Math.max(0, Math.min(m.h - 1, c.y + moves[e.key][1]));
  } else if (e.key === "Enter" || e.key === " ") {
    const s = c.y * m.w + c.x;
    if (setCell(s, (m.cells[s] + 1) % 3)) { mazeChanged(); }
  } else {
    return;
  }
  e.preventDefault();
  c.show = true;
  draw();
});
stage.addEventListener("blur", () => { state.cursor.show = false; draw(); });

/* ---- modes ------------------------------------------------ */
function setMode(mode) {
  if (mode !== "off") { state.lastMode = mode; }
  state.mode = mode;
  restartRunner();
  if (mode === "off") { loop.pause(); } else { loop.resume(); }
  showMode();
  draw();
}
const toggleMode = (mode) => setMode(state.mode === mode ? "off" : mode);

function showMode() {
  for (const id of ["train", "watch"]) {
    const on = state.mode === id;
    $(id).setAttribute("aria-pressed", String(on));
    $(id).textContent = on ? "Stop" : id === "train" ? "Train" : "Watch";
  }
}

function resetBrain() {
  brains[state.scene] = newBrain(state.scene);
  routeDirty = true;
  restartRunner();
  draw();
}

function setScene(id) {
  if (!SCENES.includes(id) || id === state.scene) { return; }
  state.scene = id;
  routeDirty = true;
  restartRunner();
  syncControls();
  persist();
  draw();
}

/* ---- shortcut keys, anywhere on the page ------------------ */
const keys = createKeys({
  train: ["KeyT"], watch: ["KeyW"], pause: ["KeyP"], reset: ["KeyR"],
  maze: ["Digit1"], cart: ["Digit2"], slower: ["BracketLeft"], faster: ["BracketRight"]
});
keys.on("train", () => toggleMode("train"));
keys.on("watch", () => toggleMode("watch"));
keys.on("pause", () => setMode(state.mode === "off" ? state.lastMode : "off"));
keys.on("reset", resetBrain);
keys.on("maze", () => setScene("maze"));
keys.on("cart", () => setScene("cart"));
keys.on("slower", () => setSetting("speed", set().speed - 1));
keys.on("faster", () => setSetting("speed", set().speed + 1));

/* ---- buttons ---------------------------------------------- */
$("train").addEventListener("click", () => toggleMode("train"));
$("watch").addEventListener("click", () => toggleMode("watch"));
$("reset").addEventListener("click", resetBrain);
$("clear-maze").addEventListener("click", () => {
  state.maze.cells.fill(RL.EMPTY);
  mazeChanged();
});
$("default-maze").addEventListener("click", () => {
  state.maze = mazeData(RL.defaultMaze());
  brains.maze = newBrain("maze");
  mazeChanged();
});
$("poke-left").addEventListener("click", () => poke(-1));
$("poke-right").addEventListener("click", () => poke(1));
for (const btn of document.querySelectorAll("[data-scene]")) {
  btn.addEventListener("click", () => setScene(btn.dataset.scene));
}
$("decay").addEventListener("click", () => {
  set().decay = !set().decay;
  brain().sinceChange = 0;
  syncControls();
  persist();
  draw();
});

/* ---- sliders ---------------------------------------------- */
const sliders = ["speed", "lr", "discount", "explore"];
function setSetting(name, value) {
  const input = $(name);
  const v = Math.max(Number(input.min), Math.min(Number(input.max), value));
  set()[name] = v;
  /* A new exploration level starts its fade again. */
  if (name === "explore") { brain().sinceChange = 0; }
  syncControls();
  persist();
  draw();
}
for (const name of sliders) {
  $(name).addEventListener("input", () => setSetting(name, Number($(name).value)));
}

function syncControls() {
  const s = set();
  for (const name of sliders) { $(name).value = String(s[name]); }
  const n = SPEEDS[s.speed];
  $("speed-out").textContent = `${n} run${n > 1 ? "s" : ""} / frame`;
  $("lr-out").textContent = (s.lr / 100).toFixed(2);
  $("discount-out").textContent = String(DISCOUNTS[s.discount]);
  $("explore-out").textContent = (s.explore / 20).toFixed(2);
  $("decay").setAttribute("aria-pressed", String(s.decay));
  $("decay").textContent = s.decay ? "Fades over time" : "Stays the same";
  for (const btn of document.querySelectorAll("[data-scene]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.scene === state.scene));
  }
  $("maze-tools").hidden = state.scene !== "maze";
  $("cart-tools").hidden = state.scene !== "cart";
  $("scene-canvas").setAttribute("aria-label", state.scene === "maze"
    ? "A grid maze. Brighter squares are where the robot expects more reward, and arrows show its best move from each square."
    : "A cart on a track with a pole balanced on top. The robot pushes the cart left or right to keep the pole up.");
}

/* Load a whole save (import, delete) into the page. */
function apply(d) {
  state.scene = d.scene;
  state.maze = d.maze;
  state.settings = d.settings;
  brains.maze = newBrain("maze");
  brains.cart = newBrain("cart");
  routeDirty = true;
  restartRunner();
  syncControls();
  draw();
}

/* ============================================================
   GO
   Reduced motion: start paused, with Train ready.
   ============================================================ */
restartRunner();
syncControls();
const loop = startLoop({ update, draw, startPaused: true });
if (!calm) { setMode("train"); } else { showMode(); }

stage.dataset.ready = "true";
