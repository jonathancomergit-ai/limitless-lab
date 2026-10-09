/* ============================================================
   Boids Flocking - main script

   The rules are in flock.js (separation, alignment, cohesion,
   flee, avoid, the spatial grid). This file runs the clock,
   draws, and listens.

   Sections:
     1. save       rule weights, vision, speed, bird count
     2. state      the flock, predators, walls
     3. loop       step the flock (update) + paint (draw)
     4. input      tap = predator, drag = wall, keys, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys, hasTouch } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  PARAMS, createFlock, resizeFlock, stepFlock, movePredators, order, buildGrid, neighbours, forces
} from "./flock.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");
const msg = $("msg");

const MAX_PREDATORS = 4;
const MAX_WALLS = 400;
const WALL_R = 9;              // px: one wall blob
const WALL_GAP = 11;           // px between blobs along a drag

/* ============================================================
   1. SAVE
   Phones (and small screens) start with fewer birds.
   ============================================================ */
const small = hasTouch() || window.innerWidth < 700;
const DEFAULTS = { ...PARAMS, count: small ? 150 : 300, showVision: false };

const inRange = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
function validate(d) {
  for (const k of ["separation", "alignment", "cohesion"]) { if (!inRange(d[k], 0, 3)) { return `The ${k} in that save is out of range.`; } }
  if (!inRange(d.vision, 20, 120)) { return "The vision in that save is out of range."; }
  if (!inRange(d.speed, 40, 260)) { return "The speed in that save is out of range."; }
  if (!Number.isInteger(d.count) || d.count < 50 || d.count > 600) { return "The bird count in that save is out of range."; }
  if (typeof d.showVision !== "boolean") { return "That save is missing the view toggle."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

function persist() {
  const { separation, alignment, cohesion, vision, speed } = state.params;
  save.set({ separation, alignment, cohesion, vision, speed, count: state.flock.n, showVision: state.showVision });
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();

const view = createCanvas(stage, { onResize: (v) => resized(v) });
const ctx = view.ctx;

const state = {
  params: { ...PARAMS },
  flock: createFlock(DEFAULTS.count, view.width, view.height),
  world: { predators: [], obstacles: [] },
  showVision: false,
  cursor: null,        // keyboard cursor [x, y], or null
  t: 0,                // seconds simulated
  travelled: 0         // how far bird 0 has flown, in px (for the smoke test)
};

/* Keep everyone in the same place, relatively, when the sky changes size. */
function resized(v) {
  const f = state.flock;
  const sx = v.width / f.w, sy = v.height / f.h;
  if (Number.isFinite(sx) && Number.isFinite(sy) && (sx !== 1 || sy !== 1)) {
    for (let i = 0; i < f.n; i++) { f.x[i] = Math.min(v.width - 0.01, f.x[i] * sx); f.y[i] = Math.min(v.height - 0.01, f.y[i] * sy); }
    for (const q of [...state.world.predators, ...state.world.obstacles]) { q.x *= sx; q.y *= sy; }
    f.w = v.width;
    f.h = v.height;
  }
  draw();
}

function scatter() {
  state.flock = createFlock(state.flock.n, view.width, view.height, Math.random, state.params.speed);
  draw();
}

exposeForTests({
  get t() { return state.t; },
  get count() { return state.flock.n; },
  get params() { return { ...state.params }; },
  get order() { return order(state.flock); },
  get first() { return [state.flock.x[0], state.flock.y[0]]; },
  get travelled() { return state.travelled; },
  get predators() { return state.world.predators.length; },
  get walls() { return state.world.obstacles.length; },
  get running() { return Boolean(loop) && !loop.paused; }
});

onMotionChange((v) => { calm = v; });

/* ============================================================
   3. LOOP
   ============================================================ */
function update(dt) {
  if (dt <= 0) { return; }
  /* Small steps keep fast birds from skipping through walls. */
  const n = Math.ceil(dt / (1 / 60));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    const x0 = state.flock.x[0], y0 = state.flock.y[0];
    stepFlock(state.flock, state.params, h, state.world);
    movePredators(state.world, state.flock, state.params, h);
    state.travelled += Math.hypot(state.flock.vx[0], state.flock.vy[0]) * h;
    if (!Number.isFinite(x0 + y0)) { scatter(); }
    state.t += h;
  }
}

/* ---- drawing ---------------------------------------------- */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), line: color("--line"), lineBright: color("--line-bright"),
  text: color("--text"), dim: color("--text-dim"),
  hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber"), green: color("--green")
};

/* A bird: a slim arrowhead pointing where it flies. */
function birdPath(c, x, y, vx, vy, size) {
  const s = Math.hypot(vx, vy) || 1;
  const ux = vx / s, uy = vy / s;
  c.moveTo(x + ux * size * 1.6, y + uy * size * 1.6);
  c.lineTo(x - ux * size - uy * size * 0.8, y - uy * size + ux * size * 0.8);
  c.lineTo(x - ux * size * 0.45, y - uy * size * 0.45);
  c.lineTo(x - ux * size + uy * size * 0.8, y - uy * size - ux * size * 0.8);
  c.closePath();
}

function arrow(x, y, fx, fy, col, scale) {
  const len = Math.hypot(fx, fy) * scale;
  if (len < 2) { return; }
  const ux = fx / Math.hypot(fx, fy), uy = fy / Math.hypot(fx, fy);
  const ex = x + ux * len, ey = y + uy * len;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex - ux * 6, ey - uy * 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - ux * 10 - uy * 6, ey - uy * 10 + ux * 6);
  ctx.lineTo(ex - ux * 10 + uy * 6, ey - uy * 10 - ux * 6);
  ctx.closePath();
  ctx.fill();
}

function draw() {
  const W = view.width, H = view.height;
  const f = state.flock;
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, W, H);

  /* Walls. */
  if (state.world.obstacles.length) {
    ctx.fillStyle = C.lineBright;
    ctx.beginPath();
    for (const o of state.world.obstacles) { ctx.moveTo(o.x + o.r, o.y); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); }
    ctx.fill();
  }

  /* Predators: a hot-pink hunter with a faint ring where birds start to flee. */
  for (const q of state.world.predators) {
    ctx.strokeStyle = "rgba(255, 45, 120, .22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(q.x, q.y, state.params.vision * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.hot;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* Birds, all in one path (fast). Bigger birds on bigger screens. */
  const size = Math.max(3.2, Math.min(4.6, Math.min(W, H) / 110));
  ctx.fillStyle = C.cyan;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  for (let i = 0; i < f.n; i++) { birdPath(ctx, f.x[i], f.y[i], f.vx[i], f.vy[i], size); }
  ctx.fill();
  ctx.globalAlpha = 1;

  if (state.showVision && f.n) { drawVision(size); }

  /* Keyboard cursor. */
  if (state.cursor) {
    const [cx, cy] = state.cursor;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 14);
    ctx.stroke();
  }

  hud();
}

/* One bird's view: what it can see, who its neighbours are,
   and the three rule forces on it as arrows. */
function drawVision(size) {
  const f = state.flock, p = state.params;
  const x = f.x[0], y = f.y[0];
  const grid = buildGrid(f, Math.max(p.vision, 8));
  const nb = neighbours(f, grid, 0, p.vision);
  const fo = forces(f, 0, nb, p, state.world);

  ctx.fillStyle = "rgba(236, 238, 246, .05)";
  ctx.strokeStyle = "rgba(236, 238, 246, .55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, p.vision, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 45, 120, .5)";
  ctx.beginPath();
  ctx.arc(x, y, p.vision * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  /* Neighbours light up white (drawn at the near copy across an edge). */
  ctx.fillStyle = C.text;
  ctx.beginPath();
  for (const j of nb) {
    let dx = f.x[j] - x, dy = f.y[j] - y;
    if (dx > f.w / 2) { dx -= f.w; } else if (dx < -f.w / 2) { dx += f.w; }
    if (dy > f.h / 2) { dy -= f.h; } else if (dy < -f.h / 2) { dy += f.h; }
    birdPath(ctx, x + dx, y + dy, f.vx[j], f.vy[j], size);
  }
  ctx.fill();

  /* Arrows: full force (max turn) = 46 px. */
  const scale = 46 / (p.speed * 2.5);
  arrow(x, y, fo.sep[0], fo.sep[1], C.hot, scale);
  arrow(x, y, fo.ali[0], fo.ali[1], C.amber, scale);
  arrow(x, y, fo.coh[0], fo.coh[1], C.green, scale);

  /* The bird itself: bigger, white-edged. */
  ctx.beginPath();
  birdPath(ctx, x, y, f.vx[0], f.vy[0], size * 2);
  ctx.fillStyle = C.cyan;
  ctx.fill();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  /* A small legend in the corner. */
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const rows = [["separation", C.hot], ["alignment", C.amber], ["cohesion", C.green]];
  const bx = 10, by = view.height - 12 - rows.length * 17;
  ctx.fillStyle = "rgba(7, 7, 12, .72)";
  ctx.beginPath();
  ctx.roundRect(bx - 4, by - 10, 116, rows.length * 17 + 6, 6);
  ctx.fill();
  rows.forEach(([name, col], k) => {
    ctx.fillStyle = col;
    ctx.fillRect(bx + 2, by + k * 17 - 2, 14, 4);
    ctx.fillStyle = C.text;
    ctx.fillText(name, bx + 22, by + k * 17);
  });
}

function hud() {
  $("count-hud").textContent = String(state.flock.n);
  $("order").textContent = `${Math.round(order(state.flock) * 100)}%`;
}

/* ============================================================
   4. INPUT
   Tap = predator. Drag = draw a wall.
   ============================================================ */
let press = null;     // { x, y, drawing, lx, ly }

function addPredator(x, y) {
  state.world.predators.push({ x, y });
  if (state.world.predators.length > MAX_PREDATORS) { state.world.predators.shift(); }
  draw();
}
function addWall(x, y) {
  if (state.world.obstacles.length >= MAX_WALLS) { return; }
  state.world.obstacles.push({ x, y, r: WALL_R });
}
function clearWorld() {
  state.world.predators = [];
  state.world.obstacles = [];
  draw();
}

pointer(stage, {
  down(p) {
    state.cursor = null;
    /* kit's pointer() stops the default, so focus by hand: keys work after a tap. */
    stage.focus({ preventScroll: true });
    press = { x: p.x, y: p.y, drawing: false, lx: p.x, ly: p.y };
  },
  move(p, held) {
    if (!held || !press) { return; }
    if (!press.drawing && Math.hypot(p.x - press.x, p.y - press.y) > 8) {
      press.drawing = true;
      addWall(press.x, press.y);
    }
    if (press.drawing) {
      /* Lay blobs evenly along the drag. */
      let d = Math.hypot(p.x - press.lx, p.y - press.ly);
      while (d >= WALL_GAP) {
        const k = WALL_GAP / d;
        press.lx += (p.x - press.lx) * k;
        press.ly += (p.y - press.ly) * k;
        addWall(press.lx, press.ly);
        d = Math.hypot(p.x - press.lx, p.y - press.ly);
      }
      draw();
    }
  },
  up(p) {
    if (press && !press.drawing && !p.cancelled) { addPredator(press.x, press.y); }
    press = null;
  }
});

/* Keyboard on the focused sky: arrows move a cursor. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const d = e.shiftKey ? 40 : 12;
  const c = state.cursor || [view.width / 2, view.height / 2];
  if (e.key === "ArrowLeft") { c[0] -= d; }
  else if (e.key === "ArrowRight") { c[0] += d; }
  else if (e.key === "ArrowUp") { c[1] -= d; }
  else if (e.key === "ArrowDown") { c[1] += d; }
  else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addPredator(...c); state.cursor = c; return; }
  else if (e.key === "w" || e.key === "W") { e.preventDefault(); addWall(...c); state.cursor = c; draw(); return; }
  else { return; }
  e.preventDefault();
  state.cursor = [Math.min(view.width, Math.max(0, c[0])), Math.min(view.height, Math.max(0, c[1]))];
  draw();
});
stage.addEventListener("blur", () => { if (state.cursor) { state.cursor = null; draw(); } });

function toggleVision() {
  state.showVision = !state.showVision;
  syncControls();
  persist();
  draw();
}

playBtn.addEventListener("click", () => loop.toggle());
$("clear").addEventListener("click", clearWorld);
$("scatter").addEventListener("click", scatter);
$("vision-toggle").addEventListener("click", toggleVision);

const keys = createKeys({ play: ["KeyP"], clear: ["KeyC"], vision: ["KeyV"], scatter: ["KeyS"] });
keys.on("play", () => loop.toggle());
keys.on("clear", clearWorld);
keys.on("vision", toggleVision);
keys.on("scatter", scatter);

/* ---- sliders ---------------------------------------------- */
const SLIDERS = {
  separation: (v) => v.toFixed(1),
  alignment: (v) => v.toFixed(1),
  cohesion: (v) => v.toFixed(1),
  vision: (v) => `${v} px`,
  speed: (v) => `${v} px/s`,
  count: (v) => String(v)
};
const valueOf = (name) => (name === "count" ? state.flock.n : state.params[name]);

for (const name of Object.keys(SLIDERS)) {
  $(name).addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (name === "count") {
      state.flock = resizeFlock(state.flock, Math.round(v), Math.random, state.params.speed);
    } else {
      state.params = { ...state.params, [name]: Math.round(v * 10) / 10 };
    }
    syncControls();
    persist();
    draw();
  });
}

function syncControls() {
  for (const [name, show] of Object.entries(SLIDERS)) {
    $(name).value = String(valueOf(name));
    $(`${name}-out`).textContent = show(valueOf(name));
  }
  $("vision-toggle").setAttribute("aria-pressed", String(state.showVision));
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  const { separation, alignment, cohesion, vision, speed } = ok;
  state.params = { separation, alignment, cohesion, vision, speed };
  state.showVision = ok.showVision;
  if (ok.count !== state.flock.n) { state.flock = resizeFlock(state.flock, ok.count, Math.random, speed); }
  syncControls();
  if (loop) { draw(); }
}

/* ============================================================
   GO
   Reduced motion: starts paused, with a Play button.
   ============================================================ */
let loop = null;
apply(save.get());
loop = startLoop({
  update,
  draw,
  startPaused: calm,
  onPauseChange(paused) {
    playBtn.textContent = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-pressed", String(!paused));
    msg.hidden = !paused;
  }
});
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));
msg.hidden = !loop.paused;

stage.dataset.ready = "true";
