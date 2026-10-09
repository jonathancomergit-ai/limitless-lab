/* ============================================================
   Gradient Descent Hill - main script

   The maths is in descent.js (hills, optimisers, contours).
   This file runs the race, draws, and listens.

   Sections:
     1. save       landscape, learning rate, racers, drop point
     2. state      the balls, their trails and loss histories
     3. drawing    the map (cached), trails + balls, loss chart
     4. loop       a fixed number of steps per second
     5. input      tap/drag the map, keys, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { HILLS, HILL_IDS, OPTIMISERS, createBall, step, lrFromExp, contourSegments } from "./descent.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");
const msg = $("msg");

const SPEEDS = [2, 8, 30, 90, 240];      // steps per second
const MAX_STEPS = 3000;
const LR_MIN = -3, LR_MAX = 0.5;
const RACER_IDS = OPTIMISERS.map((o) => o.id);

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = {
  hill: "bowl",
  lrExp: HILLS.bowl.lrExp,
  speed: 2,
  racers: { gd: true, momentum: true, adam: true },
  drop: [...HILLS.bowl.start]
};

const inRange = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
function validate(d) {
  if (!HILL_IDS.includes(d.hill)) { return "That save has an unknown landscape."; }
  if (!inRange(d.lrExp, LR_MIN, LR_MAX)) { return "The learning rate in that save is out of range."; }
  if (!Number.isInteger(d.speed) || d.speed < 0 || d.speed >= SPEEDS.length) { return "The speed in that save is out of range."; }
  if (!d.racers || typeof d.racers !== "object" || !RACER_IDS.every((k) => typeof d.racers[k] === "boolean")) { return "The racers in that save are not right."; }
  const [x0, x1, y0, y1] = HILLS[d.hill].box;
  if (!Array.isArray(d.drop) || d.drop.length !== 2 || !inRange(d.drop[0], x0, x1) || !inRange(d.drop[1], y0, y1)) { return "The drop point in that save is off the map."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
function persist() {
  save.set({
    hill: state.hill,
    lrExp: round(state.lrExp, 2),
    speed: state.speed,
    racers: { ...state.racers },
    drop: [round(state.drop[0]), round(state.drop[1])]
  });
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();

const state = {
  hill: DEFAULTS.hill,
  lrExp: DEFAULTS.lrExp,
  speed: calm ? 1 : DEFAULTS.speed,
  racers: { ...DEFAULTS.racers },
  drop: [...DEFAULTS.drop],
  steps: 0,
  balls: [],            // { ball, trail: [x, y, ...], loss: [..] } for each racer that's on
  cursor: null,         // keyboard cursor [x, y] in map units, or null
  acc: 0                // part-steps carried between frames
};
const hill = () => HILLS[state.hill];
const lr = () => lrFromExp(state.lrExp);

function restart() {
  const h = hill();
  const [x, y] = state.drop;
  state.steps = 0;
  state.acc = 0;
  state.balls = RACER_IDS.filter((id) => state.racers[id]).map((id) => ({
    ball: createBall(id, x, y),
    trail: [x, y],
    loss: [h.f(x, y)]
  }));
}

function finished() {
  return state.steps >= MAX_STEPS || state.balls.every((b) => b.ball.status !== "rolling");
}

function stepAll() {
  if (finished()) { return false; }
  const h = hill();
  for (const b of state.balls) {
    if (b.ball.status !== "rolling") { continue; }
    step(b.ball, h, lr());
    b.trail.push(b.ball.x, b.ball.y);
    b.loss.push(h.f(b.ball.x, b.ball.y));
  }
  state.steps += 1;
  return true;
}

exposeForTests({
  get steps() { return state.steps; },
  get hill() { return state.hill; },
  get lr() { return lr(); },
  get startLoss() { return state.balls.length ? state.balls[0].loss[0] : null; },
  get balls() {
    return state.balls.map((b) => ({ kind: b.ball.kind, x: b.ball.x, y: b.ball.y, status: b.ball.status, loss: b.loss[b.loss.length - 1] }));
  },
  get running() { return Boolean(loop) && !loop.paused; }
});

/* ============================================================
   3. DRAWING
   ============================================================ */
const view = createCanvas(stage, { onResize: () => { mapCache = null; draw(); } });
const ctx = view.ctx;
const chart = createCanvas($("chart-box"), { onResize: () => drawChart() });

const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), surface: color("--surface"), line: color("--line"),
  lineBright: color("--line-bright"), field: color("--line-field"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"),
  hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber"), green: color("--green")
};
const RACER_COLOUR = { gd: C.hot, momentum: C.amber, adam: C.cyan };

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/* The height colours: low = near-black, high = a soft grey-blue. */
const RAMP = [C.bg2, C.lineBright, C.field].map(hexToRgb);
function ramp(t) {
  const u = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(u));
  const k = u - i;
  return RAMP[i].map((v, c) => v + (RAMP[i + 1][c] - v) * k);
}

/* Map units <-> CSS pixels on the stage (y flipped: up is up). */
function toScreen(x, y) {
  const [x0, x1, y0, y1] = hill().box;
  return [((x - x0) / (x1 - x0)) * view.width, (1 - (y - y0) / (y1 - y0)) * view.height];
}
function toMap(sx, sy) {
  const [x0, x1, y0, y1] = hill().box;
  return [x0 + (sx / view.width) * (x1 - x0), y0 + (1 - sy / view.height) * (y1 - y0)];
}

/* The landscape only changes with the hill or the size, so it's
   painted once into its own canvas and copied in every frame. */
let mapCache = null;
function buildMap() {
  const h = hill();
  const [x0, x1, y0, y1] = h.box;
  const N = 120;                                   // grid cells per side
  const vals = new Float64Array((N + 1) * (N + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const v = h.f(x0 + (i / N) * (x1 - x0), y0 + (j / N) * (y1 - y0));
      vals[j * (N + 1) + i] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  /* Heights are squashed with a log, so gentle bottoms still show detail. */
  const squash = (v) => Math.log1p((v - lo) * 4);
  const top = squash(hi);
  const g = vals.map((v) => squash(v) / top);

  /* Heat map: one pixel per grid point, smoothed when scaled up. */
  const img = new ImageData(N + 1, N + 1);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const [r, gg, b] = ramp(g[j * (N + 1) + i] ** 0.9);
      const k = ((N - j) * (N + 1) + i) * 4;      // flip: row 0 is the top
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  const small = document.createElement("canvas");
  small.width = N + 1;
  small.height = N + 1;
  small.getContext("2d").putImageData(img, 0, 0);

  const big = document.createElement("canvas");
  big.width = Math.round(view.width * view.dpr);
  big.height = Math.round(view.height * view.dpr);
  const b2 = big.getContext("2d");
  b2.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  b2.imageSmoothingEnabled = true;
  b2.imageSmoothingQuality = "high";
  b2.drawImage(small, 0, 0, view.width, view.height);

  /* Contour lines: 14 evenly spaced (squashed) heights. */
  const sx = view.width / N, sy = view.height / N;
  b2.lineWidth = 1;
  const LEVELS = 14;
  for (let L = 1; L < LEVELS; L++) {
    const segs = contourSegments(g, N, N, L / LEVELS);
    b2.strokeStyle = `rgba(236, 238, 246, ${L % 4 === 0 ? 0.22 : 0.1})`;
    b2.beginPath();
    for (let k = 0; k < segs.length; k += 4) {
      b2.moveTo(segs[k] * sx, view.height - segs[k + 1] * sy);
      b2.lineTo(segs[k + 2] * sx, view.height - segs[k + 3] * sy);
    }
    b2.stroke();
  }

  /* The true bottom(s): a small green target. */
  b2.strokeStyle = "rgba(61, 245, 160, .75)";
  b2.lineWidth = 1.5;
  b2.beginPath();
  for (const m of [h.min, ...(h.alsoMin || [])]) {
    const [mx, my] = toScreen(...m);
    b2.moveTo(mx + 7, my);
    b2.arc(mx, my, 7, 0, Math.PI * 2);
    b2.moveTo(mx - 11, my); b2.lineTo(mx - 4, my);
    b2.moveTo(mx + 4, my); b2.lineTo(mx + 11, my);
    b2.moveTo(mx, my - 11); b2.lineTo(mx, my - 4);
    b2.moveTo(mx, my + 4); b2.lineTo(mx, my + 11);
  }
  b2.stroke();

  mapCache = { canvas: big, w: view.width, h: view.height, hill: state.hill };
}

/* Keep wild positions drawable (a blown-up ball heads for infinity). */
const clampPx = (v, lim) => Math.max(-lim, Math.min(lim, v));

function draw() {
  if (!mapCache || mapCache.hill !== state.hill || mapCache.w !== view.width || mapCache.h !== view.height) { buildMap(); }
  ctx.drawImage(mapCache.canvas, 0, 0, view.width, view.height);

  const W = view.width, H = view.height;
  const lim = 4 * Math.max(W, H);

  /* Trails: the path each ball took, every step a dot on the line. */
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const b of state.balls) {
    const col = RACER_COLOUR[b.ball.kind];
    const t = b.trail;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < t.length; k += 2) {
      const [px, py] = toScreen(t[k], t[k + 1]);
      if (k === 0) { ctx.moveTo(clampPx(px, lim), clampPx(py, lim)); } else { ctx.lineTo(clampPx(px, lim), clampPx(py, lim)); }
    }
    ctx.stroke();
    /* Small dots at each step show how big the steps are. */
    if (t.length < 400) {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55;
      for (let k = 2; k < t.length; k += 2) {
        const [px, py] = toScreen(t[k], t[k + 1]);
        if (px < -5 || py < -5 || px > W + 5 || py > H + 5) { continue; }
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* The drop point. */
  const [dx, dy] = toScreen(...state.drop);
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(dx, dy, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  /* The balls, last racer underneath. Off the map = a hollow ring on the edge. */
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const b = state.balls[i].ball;
    const col = RACER_COLOUR[b.kind];
    let [px, py] = toScreen(b.x, b.y);
    const off = !(px >= 0 && px <= W && py >= 0 && py <= H) || b.status === "blew up";
    if (off) {
      px = Number.isFinite(px) ? Math.min(W - 10, Math.max(10, px)) : W / 2;
      py = Number.isFinite(py) ? Math.min(H - 10, Math.max(10, py)) : H / 2;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C.bg;
    ctx.stroke();
  }

  /* Keyboard cursor. */
  if (state.cursor) {
    const [cx, cy] = toScreen(...state.cursor);
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 14);
    ctx.stroke();
  }

  /* Landscape name, bottom left. */
  ctx.font = "600 12px 'JetBrains Mono', monospace";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = C.dim;
  ctx.fillText(`${hill().name.toUpperCase()} · TRUE BOTTOM ⊕`, 12, H - 12);

  drawChart();
  hud();
}

/* Loss over steps, log scale, one line per racer. */
function drawChart() {
  const c = chart.ctx;
  const W = chart.width, H = chart.height;
  c.clearRect(0, 0, W, H);
  const padL = 34, padB = 4, padT = 6;
  const all = state.balls.flatMap((b) => b.loss.filter(Number.isFinite));
  if (!all.length) { return; }
  const floor = 1e-6;
  const start = state.balls[0].loss[0];
  const topV = Math.max(start, floor * 10) * 4;
  const lowV = Math.max(floor, Math.min(...all, start / 10));
  const top = Math.log10(topV), bot = Math.log10(lowV);
  const n = Math.max(60, state.steps);
  const X = (k) => padL + (k / n) * (W - padL - 4);
  const Y = (v) => {
    const l = Math.log10(Math.max(floor, v));
    return padT + ((top - Math.min(top, l)) / (top - bot || 1)) * (H - padT - padB);
  };

  /* Gridlines at each power of ten. */
  c.font = "500 10px 'JetBrains Mono', monospace";
  c.textAlign = "right";
  c.textBaseline = "middle";
  const every = Math.max(1, Math.ceil((top - bot) / 4));
  for (let p = Math.ceil(bot); p <= Math.floor(top); p += every) {
    const y = Y(10 ** p);
    c.strokeStyle = C.line;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(padL, y); c.lineTo(W, y);
    c.stroke();
    c.fillStyle = C.faint;
    c.fillText(p === 0 ? "1" : `1e${p}`, padL - 4, y);
  }

  for (const b of state.balls) {
    c.strokeStyle = RACER_COLOUR[b.ball.kind];
    c.lineWidth = 2;
    c.beginPath();
    const L = b.loss;
    /* No need for more than ~2 points per pixel. */
    const stride = Math.max(1, Math.floor(L.length / (2 * W)));
    for (let k = 0; k < L.length; k += stride) {
      const v = Number.isFinite(L[k]) ? L[k] : topV;
      if (k === 0) { c.moveTo(X(k), Y(v)); } else { c.lineTo(X(k), Y(v)); }
    }
    const last = L.length - 1;
    c.lineTo(X(last), Y(Number.isFinite(L[last]) ? L[last] : topV));
    c.stroke();
  }
}

function fmtLoss(v) {
  if (!Number.isFinite(v)) { return "∞"; }
  if (v === 0) { return "0"; }
  if (v < 0.001 || v >= 1e5) { return v.toExponential(1); }
  return v < 10 ? v.toFixed(3) : v.toPrecision(3);
}
function fmtLr(v) { return v >= 1 ? v.toFixed(2) : v.toPrecision(2); }

function hud() {
  $("steps").textContent = String(state.steps);
  $("lr-hud").textContent = fmtLr(lr());
  for (const id of RACER_IDS) {
    const b = state.balls.find((x) => x.ball.kind === id);
    const card = document.querySelector(`[data-racer="${id}"]`);
    const status = b ? b.ball.status : "off";
    $(`loss-${id}`).textContent = b ? fmtLoss(b.loss[b.loss.length - 1]) : "-";
    $(`note-${id}`).textContent = status === "blew up" ? "blew up!" : status === "settled" ? `done in ${b.ball.t}` : status;
    card.classList.toggle("is-blown", status === "blew up");
    card.classList.toggle("is-settled", status === "settled");
  }
}

/* ============================================================
   4. LOOP
   ============================================================ */
function update(dt) {
  state.acc += dt * SPEEDS[state.speed];
  let n = Math.floor(state.acc);
  state.acc -= n;
  while (n-- > 0) { if (!stepAll()) { break; } }
  /* Race over: stop the clock (Play starts a new race). */
  if (finished() && loop && !loop.paused) { loop.pause(); }
}

/* ============================================================
   5. INPUT
   ============================================================ */
function dropAt(x, y, { go = true } = {}) {
  const [x0, x1, y0, y1] = hill().box;
  state.drop = [Math.min(x1, Math.max(x0, x)), Math.min(y1, Math.max(y0, y))];
  restart();
  msg.hidden = true;
  if (go && loop && loop.paused) { loop.resume(); }
  draw();
}

pointer(stage, {
  down(p) {
    state.cursor = null;
    dropAt(...toMap(p.x, p.y));
  },
  move(p, held) { if (held) { dropAt(...toMap(p.x, p.y)); } },
  up() { persist(); }
});

/* Keyboard on the focused map: arrows move a cursor, Enter drops. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const [x0, x1] = hill().box;
  const d = ((x1 - x0) / 40) * (e.shiftKey ? 4 : 1);
  const c = state.cursor || [...state.drop];
  if (e.key === "ArrowLeft") { c[0] -= d; }
  else if (e.key === "ArrowRight") { c[0] += d; }
  else if (e.key === "ArrowUp") { c[1] += d; }
  else if (e.key === "ArrowDown") { c[1] -= d; }
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    dropAt(...c);
    persist();
    return;
  } else { return; }
  e.preventDefault();
  const [, , y0, y1] = hill().box;
  state.cursor = [Math.min(x1, Math.max(x0, c[0])), Math.min(y1, Math.max(y0, c[1]))];
  draw();
});
stage.addEventListener("blur", () => { if (state.cursor) { state.cursor = null; draw(); } });

function play() {
  if (loop.paused && finished()) { restart(); }
  loop.toggle();
  draw();
}
function oneStep() {
  if (!loop.paused) { loop.pause(); }
  if (finished()) { restart(); }
  stepAll();
  draw();
}
function again() {
  restart();
  if (loop.paused) { loop.resume(); }
  draw();
}

playBtn.addEventListener("click", play);
$("step").addEventListener("click", oneStep);
$("reset").addEventListener("click", again);

const keys = createKeys({
  play: ["KeyP"], step: ["KeyN"], reset: ["KeyR"],
  slower: ["BracketLeft"], faster: ["BracketRight"],
  h1: ["Digit1"], h2: ["Digit2"], h3: ["Digit3"], h4: ["Digit4"]
});
keys.on("play", play);
keys.on("step", oneStep);
keys.on("reset", again);
keys.on("slower", () => setLr(state.lrExp - 0.1));
keys.on("faster", () => setLr(state.lrExp + 0.1));
HILL_IDS.forEach((id, i) => keys.on(`h${i + 1}`, () => setHill(id)));

/* ---- landscapes ------------------------------------------- */
function setHill(id) {
  state.hill = id;
  state.lrExp = HILLS[id].lrExp;
  state.cursor = null;
  syncControls();
  dropAt(...HILLS[id].start);
  persist();
}
for (const b of document.querySelectorAll("[data-hill]")) {
  b.addEventListener("click", () => setHill(b.dataset.hill));
}

/* ---- racers on / off -------------------------------------- */
for (const b of document.querySelectorAll("[data-racer]")) {
  b.addEventListener("click", () => {
    const id = b.dataset.racer;
    state.racers[id] = !state.racers[id];
    if (!RACER_IDS.some((k) => state.racers[k])) { state.racers[id] = true; }   // keep at least one
    syncControls();
    again();
    persist();
  });
}

/* ---- sliders ---------------------------------------------- */
function setLr(e) {
  state.lrExp = round(Math.min(LR_MAX, Math.max(LR_MIN, e)), 2);
  syncControls();
  again();
  persist();
}
$("lr").addEventListener("input", (e) => setLr(Number(e.target.value)));
$("speed").addEventListener("input", (e) => {
  state.speed = Math.round(Number(e.target.value));
  syncControls();
  persist();
});

function syncControls() {
  $("lr").value = String(state.lrExp);
  $("lr-out").textContent = fmtLr(lr());
  $("speed").value = String(state.speed);
  $("speed-out").textContent = `${SPEEDS[state.speed]} steps/s`;
  for (const b of document.querySelectorAll("[data-hill]")) { b.setAttribute("aria-pressed", String(b.dataset.hill === state.hill)); }
  for (const b of document.querySelectorAll("[data-racer]")) { b.setAttribute("aria-pressed", String(state.racers[b.dataset.racer])); }
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.hill = ok.hill;
  state.lrExp = ok.lrExp;
  state.speed = ok.speed;
  state.racers = { ...ok.racers };
  state.drop = [...ok.drop];
  syncControls();
  restart();
  if (loop) { draw(); }
}

onMotionChange((v) => { calm = v; });

/* ============================================================
   GO
   Reduced motion: starts paused and slower (8 steps a second).
   ============================================================ */
let loop = null;
apply(save.get());
if (calm) { state.speed = Math.min(state.speed, 1); syncControls(); }
loop = startLoop({
  update,
  draw,
  startPaused: calm,
  onPauseChange(paused) {
    playBtn.textContent = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-pressed", String(!paused));
  }
});
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));
msg.hidden = !calm;

stage.dataset.ready = "true";
