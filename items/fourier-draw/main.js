/* ============================================================
   Fourier Draw - main script

   The maths is in dft.js (resample, DFT, adding up circles)
   and shapes.js (the presets). This file draws and listens.

   Sections:
     1. save       the last drawing + settings
     2. state      the circles, the clock, the trail
     3. drawing    pen strokes in, circles out
     4. loop       spin (update) + paint (draw)
     5. input      buttons, sliders, keys
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { resample, dft, tip, idft, pathLength } from "./dft.js";
import { makeShape, SHAPES } from "./shapes.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const msg = $("msg");
const playBtn = $("play");

const N = 256;              // points per drawing = circles available
const TRAIL = 2 * N;        // trail samples per trip round the drawing
const round3 = (v) => Math.round(v * 1000) / 1000;

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { points: [], preset: "heart", circles: 100, speed: 4, ghost: true };

function validate(d) {
  if (!Array.isArray(d.points) || d.points.length > N) { return "The drawing in that save doesn't look right."; }
  if (!d.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Math.abs(v) <= 5))) {
    return "One of the points in that save is broken.";
  }
  if (d.preset !== null && !SHAPES.includes(d.preset)) { return "That save names a preset that doesn't exist."; }
  if (!Number.isInteger(d.circles) || d.circles < 1 || d.circles > N) { return "The circle count in that save is out of range."; }
  if (!Number.isInteger(d.speed) || d.speed < 1 || d.speed > 10) { return "The speed in that save is out of range."; }
  if (typeof d.ghost !== "boolean") { return "That save has unexpected settings."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

function persist() {
  save.set({
    points: state.preset ? [] : state.points.map(([x, y]) => [round3(x), round3(y)]),
    preset: state.preset, circles: state.circles, speed: state.speed, ghost: state.ghost
  });
}

/* ============================================================
   2. STATE
   Drawings live in "units": the stage's short side is 2 units
   across, centred, y pointing down like the screen.
   ============================================================ */
const state = {
  points: [],           // the drawing, resampled to N points
  preset: null,         // which preset it came from (null = hand drawn)
  coeffs: [],           // the circles, biggest first
  circles: 100,
  speed: 4,
  ghost: true,
  t: 0,                 // 0..1 = one trip round the drawing
  match: null,
  stroke: null,         // the pen stroke being drawn right now
  drawn: 0              // how many shapes have been set up (for tests)
};

/* The trail: tip positions at evenly spaced times. */
const trailX = new Float32Array(TRAIL);
const trailY = new Float32Array(TRAIL);
let trailHead = -1;     // index of the newest sample (counts up forever)
let trailFilled = 0;

let calm = reducedMotion();
onMotionChange((v) => { calm = v; resetTrail(); });

exposeForTests({
  get circles() { return Math.min(state.circles, state.coeffs.length); },
  get t() { return state.t; },
  get drawn() { return state.drawn; },
  get running() { return Boolean(loop) && !loop.paused; },
  get drawing() { return Boolean(state.stroke); }
});

/* ============================================================
   3. DRAWING -> CIRCLES
   ============================================================ */
function setShape(path, preset = null) {
  state.points = resample(path, N);
  state.coeffs = dft(state.points);
  state.preset = preset;
  state.t = 0;
  state.drawn += 1;
  resetTrail();
  measureMatch();
  syncControls();
}

/* Fill the trail with the last full trip, so a new shape shows
   up straight away instead of growing from nothing. */
function resetTrail() {
  trailFilled = 0;
  trailHead = Math.floor(state.t * TRAIL) - TRAIL;
  sampleUpTo(state.t);
}

/* How close the circles we're using get to the drawing: 100% means
   it lands on every dot. */
function measureMatch() {
  if (!state.coeffs.length) { state.match = null; return; }
  const back = idft(state.coeffs.slice(0, state.circles), N);
  const c = state.coeffs.find((k) => k.freq === 0) || { re: 0, im: 0 };
  let err = 0, size = 0;
  state.points.forEach(([x, y], i) => {
    err += (back[i][0] - x) ** 2 + (back[i][1] - y) ** 2;
    size += (x - c.re) ** 2 + (y - c.im) ** 2;
  });
  state.match = Math.max(0, 1 - Math.sqrt(err / Math.max(size, 1e-9)));
}

/* Add trail samples for every time step up to t (wrapping). */
function sampleUpTo(t) {
  if (!state.coeffs.length) { return; }
  const target = Math.floor(t * TRAIL);
  let guard = 0;
  while (trailHead < target && guard++ < TRAIL) {
    trailHead += 1;
    const [x, y] = tip(state.coeffs, trailHead / TRAIL, state.circles);
    const k = ((trailHead % TRAIL) + TRAIL) % TRAIL;
    trailX[k] = x;
    trailY[k] = y;
    trailFilled = Math.min(TRAIL, trailFilled + 1);
  }
  if (trailHead < target) { trailHead = target; }
}

/* ============================================================
   4. LOOP
   ============================================================ */
const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

/* One trip takes 40/speed seconds; half speed for reduced motion. */
function period() { return (40 / state.speed) * (calm ? 2 : 1); }

function update(dt) {
  if (state.stroke || !state.coeffs.length) { return; }
  state.t += dt / period();
  sampleUpTo(state.t);
}

const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  hot: color("--hot"), cyan: color("--cyan"), bg2: color("--bg-2"),
  text: color("--text"), faint: color("--text-faint"), amber: color("--amber")
};

function frame() {
  const s = (Math.min(view.width, view.height) / 2) * 0.86;
  return { cx: view.width / 2, cy: view.height / 2, s };
}

function draw() {
  const { cx, cy, s } = frame();
  const X = (x) => cx + x * s;
  const Y = (y) => cy + y * s;
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  /* The live pen stroke. */
  if (state.stroke) {
    ctx.strokeStyle = C.hot;
    ctx.lineWidth = 3;
    ctx.beginPath();
    state.stroke.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
    hud();
    return;
  }
  if (!state.coeffs.length) { hud(); return; }

  /* The original drawing, faint and dashed. */
  if (state.ghost) {
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(133, 140, 168, .45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    state.points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* The trail. Newest is brightest; older fades out, unless
     reduced motion is on, then the whole trace stays put. */
  const fade = !calm;
  const bands = fade ? 24 : 1;
  for (const [width, alphaScale] of [[7, 0.16], [2.6, 1]]) {
    ctx.lineWidth = width;
    for (let band = 0; band < bands; band++) {
      const from = Math.floor((band * trailFilled) / bands);
      const to = Math.floor(((band + 1) * trailFilled) / bands);
      if (to - from < 1) { continue; }
      const age = fade ? (band + 1) / bands : 1;
      ctx.strokeStyle = `rgba(255, 45, 120, ${(age * alphaScale).toFixed(3)})`;
      ctx.beginPath();
      for (let j = from; j <= to && j < trailFilled; j++) {
        const idx = trailHead - (trailFilled - 1) + j;
        const k = ((idx % TRAIL) + TRAIL) % TRAIL;
        if (j === from) { ctx.moveTo(X(trailX[k]), Y(trailY[k])); } else { ctx.lineTo(X(trailX[k]), Y(trailY[k])); }
      }
      ctx.stroke();
    }
  }

  /* The circles: faint rings, with thin arms joining the centres. */
  const joints = [];
  tip(state.coeffs, state.t, state.circles, joints);
  ctx.lineWidth = 1;
  for (let i = 0; i < joints.length - 1; i++) {
    const r = state.coeffs[i].amp * s;
    if (state.coeffs[i].freq === 0 || r < 0.6) { continue; }
    ctx.strokeStyle = `rgba(53, 214, 245, ${i < 12 ? 0.32 : 0.18})`;
    ctx.beginPath();
    ctx.arc(X(joints[i][0]), Y(joints[i][1]), r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(236, 238, 246, .5)";
  ctx.beginPath();
  joints.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.stroke();

  /* The pen tip. */
  const [tx, ty] = joints[joints.length - 1];
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(X(tx), Y(ty), 4, 0, Math.PI * 2);
  ctx.fill();
  hud();
}

function hud() {
  const total = state.coeffs.length;
  $("count").textContent = total ? `${Math.min(state.circles, total)} / ${total}` : "0";
  $("match").textContent = state.match == null ? "-" : `${Math.floor(state.match * 1000) / 10}%`;
  msg.hidden = Boolean(state.coeffs.length || state.stroke);
}

/* ============================================================
   5. INPUT
   ============================================================ */

/* Pen strokes: screen pixels -> units. */
function toUnits(px, py) {
  const { cx, cy, s } = frame();
  return [(px - cx) / s, (py - cy) / s];
}

pointer(stage, {
  down(p) {
    if (!p.primary) { return; }
    state.stroke = [toUnits(p.x, p.y)];
    draw();
  },
  move(p, held) {
    if (!held || !state.stroke) { return; }
    const q = toUnits(p.x, p.y);
    const last = state.stroke[state.stroke.length - 1];
    if (Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.004) { state.stroke.push(q); }
    if (loop.paused) { draw(); }
  },
  up() {
    const stroke = state.stroke;
    state.stroke = null;
    /* A tap or a scribble too small to see: keep the old shape. */
    if (stroke && stroke.length > 4 && pathLength(stroke) > 0.15) {
      setShape(stroke, null);
      persist();
    }
    draw();
  }
});

/* ---- buttons ---------------------------------------------- */
function loadPreset(name) {
  setShape(makeShape(name), name);
  persist();
  draw();
}
for (const btn of document.querySelectorAll("[data-shape]")) {
  btn.addEventListener("click", () => loadPreset(btn.dataset.shape));
}

playBtn.addEventListener("click", () => loop.toggle());
$("draw").addEventListener("click", () => {
  state.coeffs = [];
  state.points = [];
  state.preset = null;
  state.match = null;
  syncControls();
  stage.focus();
  draw();
});
$("ghost").addEventListener("click", () => {
  state.ghost = !state.ghost;
  syncControls();
  persist();
  draw();
});

/* ---- sliders ---------------------------------------------- */
function setCircles(n) {
  state.circles = Math.max(1, Math.min(N, n));
  resetTrail();
  measureMatch();
  syncControls();
  persist();
  draw();
}
function setSpeed(v) {
  state.speed = Math.max(1, Math.min(10, v));
  syncControls();
  persist();
}
$("circles").addEventListener("input", (e) => setCircles(Number(e.target.value)));
$("speed").addEventListener("input", (e) => setSpeed(Number(e.target.value)));

function syncControls() {
  $("circles").value = String(state.circles);
  $("circles-out").textContent = String(state.circles);
  $("speed").value = String(state.speed);
  $("speed-out").textContent = String(state.speed);
  $("ghost").setAttribute("aria-pressed", String(state.ghost));
  for (const btn of document.querySelectorAll("[data-shape]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.shape === state.preset));
  }
}

/* ---- keys ------------------------------------------------- */
const keys = createKeys({ play: ["KeyP"], heart: ["Digit1"], star: ["Digit2"], note: ["Digit3"] });
keys.on("play", () => loop.toggle());
for (const name of SHAPES) { keys.on(name, () => loadPreset(name)); }

/* On the focused stage: arrows tune circles and speed. Held keys
   repeat, and Shift jumps in bigger steps. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const big = e.shiftKey;
  if (e.key === "ArrowRight") { setCircles(state.circles + (big ? 16 : 1)); }
  else if (e.key === "ArrowLeft") { setCircles(state.circles - (big ? 16 : 1)); }
  else if (e.key === "ArrowUp") { setSpeed(state.speed + 1); }
  else if (e.key === "ArrowDown") { setSpeed(state.speed - 1); }
  else if (e.key === " ") { loop.toggle(); }
  else { return; }
  e.preventDefault();
});

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.circles = ok.circles;
  state.speed = ok.speed;
  state.ghost = ok.ghost;
  if (ok.preset) { setShape(makeShape(ok.preset), ok.preset); }
  else if (ok.points.length > 4) { setShape(ok.points, null); }
  else { setShape(makeShape("heart"), "heart"); }
  syncControls();
  draw();
}

/* ============================================================
   GO
   Reduced motion: start paused, half speed, no fading trail.
   ============================================================ */
apply(save.get());
const loop = startLoop({
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

stage.dataset.ready = "true";
