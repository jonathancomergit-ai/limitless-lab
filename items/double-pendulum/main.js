/* ============================================================
   Double Pendulum Chaos - main script

   The physics is in physics.js (exact equations, RK4, energy).
   This file runs the clock, draws, and listens.

   Sections:
     1. save       settings + start angles
     2. state      the pendulums, the clock, the trails
     3. loop       fixed-step physics (update) + paint (draw)
     4. input      drag a bob, keys, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { rk4, energy, positions, createStepper, gap, hasSplit, startStates, deg } from "./physics.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const TRAIL_SECONDS = 3;
const TRAIL_EVERY = 1 / 60;                      // one trail point per 1/60 s of sim time
const TRAIL_LEN = Math.round(TRAIL_SECONDS / TRAIL_EVERY);

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { theta1: 150, theta2: 150, count: 3, l1: 1, l2: 1, m1: 1, m2: 1, g: 9.8 };

const inRange = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
function validate(d) {
  if (!inRange(d.theta1, -180, 180) || !inRange(d.theta2, -180, 180)) { return "The start angles in that save are out of range."; }
  if (!Number.isInteger(d.count) || d.count < 2 || d.count > 10) { return "The pendulum count in that save is out of range."; }
  if (!inRange(d.l1, 0.5, 1.5) || !inRange(d.l2, 0.5, 1.5)) { return "The rod lengths in that save are out of range."; }
  if (!inRange(d.m1, 0.5, 3) || !inRange(d.m2, 0.5, 3)) { return "The masses in that save are out of range."; }
  if (!inRange(d.g, 1, 25)) { return "The gravity in that save is out of range."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
function persist() {
  const { theta1, theta2, count } = state;
  const { l1, l2, m1, m2, g } = state.params;
  save.set({ theta1: round(theta1, 2), theta2: round(theta2, 2), count, l1, l2, m1, m2, g });
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();

const state = {
  theta1: DEFAULTS.theta1,   // start angles, in degrees
  theta2: DEFAULTS.theta2,
  count: DEFAULTS.count,
  params: { l1: 1, l2: 1, m1: 1, m2: 1, g: 9.8 },
  speed: calm ? 1 : 2,       // index into SPEEDS: reduced motion starts slower
  sims: [],                  // one [theta1, theta2, omega1, omega2] per pendulum
  t: 0,
  e0: 1,
  splitAt: null,             // sim time they visibly split, or null
  splitPos: null,            // where, in metres
  splitShownAt: 0,           // real time the split marker appeared
  dragging: null             // "top" | "bottom" | null
};
const stepper = createStepper(1 / 600);
let trails = [];             // per pendulum: { x, y, head, filled }
let trailClock = 0;

function restart() {
  state.sims = startStates(state.count, deg(state.theta1), deg(state.theta2));
  state.t = 0;
  state.e0 = energy(state.sims[0], state.params);
  state.splitAt = null;
  state.splitPos = null;
  stepper.reset();
  trails = state.sims.map(() => ({ x: new Float32Array(TRAIL_LEN), y: new Float32Array(TRAIL_LEN), head: -1, filled: 0 }));
  trailClock = 0;
}

exposeForTests({
  get t() { return state.t; },
  get angles() { return state.sims.map((s) => s[0]); },
  get start() { return [state.theta1, state.theta2]; },
  get splitAt() { return state.splitAt; },
  /* The first pendulum's lower bob, in CSS px inside the stage. */
  get bob() {
    const { px, py, scale } = frame();
    const q = positions(state.sims[0], state.params);
    return [px + q.x2 * scale, py + q.y2 * scale];
  },
  get running() { return Boolean(loop) && !loop.paused; }
});

onMotionChange((v) => { calm = v; draw(); });

/* ============================================================
   3. LOOP
   ============================================================ */
function update(dt) {
  if (state.dragging) { return; }
  const n = stepper.steps(dt * SPEEDS[state.speed]);
  const h = stepper.dt;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < state.sims.length; i++) { state.sims[i] = rk4(state.sims[i], state.params, h); }
    state.t += h;
    trailClock += h;
    if (trailClock >= TRAIL_EVERY) { trailClock -= TRAIL_EVERY; addTrail(); }
    if (state.splitAt === null && hasSplit(state.sims[0], state.sims[1], state.params)) {
      state.splitAt = state.t;
      const a = positions(state.sims[0], state.params), b = positions(state.sims[1], state.params);
      state.splitPos = [(a.x2 + b.x2) / 2, (a.y2 + b.y2) / 2];
      state.splitShownAt = performance.now();
    }
  }
}

function addTrail() {
  state.sims.forEach((s, i) => {
    const q = positions(s, state.params);
    const tr = trails[i];
    tr.head += 1;
    const k = tr.head % TRAIL_LEN;
    tr.x[k] = q.x2;
    tr.y[k] = q.y2;
    tr.filled = Math.min(TRAIL_LEN, tr.filled + 1);
  });
}

/* ---- drawing ---------------------------------------------- */
const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = { hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber"), bg: color("--bg"), bg2: color("--bg-2"), text: color("--text"), dim: color("--text-dim") };

/* Colours from hot pink round to cyan, through violet and blue. */
function hue(i, n) { return 338 - (148 * i) / Math.max(1, n - 1); }
function colourOf(i, n, alpha = 1) {
  if (alpha === 1 && i === 0) { return C.hot; }
  if (alpha === 1 && i === n - 1) { return C.cyan; }
  return `hsla(${hue(i, n).toFixed(1)}, 92%, 62%, ${alpha})`;
}

/* Pivot sits so both rods fully stretched fit, up or down.
   Kept above 0: while the page is still laying out, the canvas
   can be a few pixels (or 0) big, and a negative scale makes
   ctx.arc() throw on a negative radius. */
function frame() {
  const reach = state.params.l1 + state.params.l2;
  const scale = Math.max(0.001, (Math.min(view.width, view.height) / 2 - 22) / reach);
  return { px: view.width / 2, py: view.height / 2, scale };
}

function draw() {
  const { px, py, scale } = frame();
  const X = (x) => px + x * scale;
  const Y = (y) => py + y * scale;
  const n = state.sims.length;

  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);

  /* Faint circle: everywhere the lower bob could ever reach. */
  ctx.strokeStyle = "rgba(236, 238, 246, .06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px, py, (state.params.l1 + state.params.l2) * scale, 0, Math.PI * 2);
  ctx.stroke();

  /* Trails (none for reduced motion). Older = fainter. */
  if (!calm) {
    const bands = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    for (let i = n - 1; i >= 0; i--) {
      const tr = trails[i];
      if (!tr || tr.filled < 2) { continue; }
      for (let b = 0; b < bands; b++) {
        const from = Math.floor((b * (tr.filled - 1)) / bands);
        const to = Math.floor(((b + 1) * (tr.filled - 1)) / bands);
        ctx.strokeStyle = colourOf(i, n, (0.06 + 0.6 * ((b + 1) / bands) ** 1.5).toFixed(3));
        ctx.beginPath();
        for (let j = from; j <= to; j++) {
          const k = (tr.head - (tr.filled - 1) + j) % TRAIL_LEN;
          if (j === from) { ctx.moveTo(X(tr.x[k]), Y(tr.y[k])); } else { ctx.lineTo(X(tr.x[k]), Y(tr.y[k])); }
        }
        ctx.stroke();
      }
    }
  }

  /* The split moment: an amber ring where they parted (it fades
     out after a few seconds), and a banner along the bottom. */
  if (state.splitPos) {
    const age = (performance.now() - state.splitShownAt) / 1000;
    const [sx, sy] = state.splitPos;
    const pulse = calm ? 0 : Math.min(1, age / 0.8);
    const fade = calm ? 0.9 : Math.max(0, 1 - age / 4);
    if (fade > 0) {
      ctx.strokeStyle = C.amber;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(X(sx), Y(sy), 12 + 22 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const label = `They split apart at ${state.splitAt.toFixed(1)} s`;
    ctx.font = "700 13px 'JetBrains Mono', monospace";
    const w = ctx.measureText(label).width + 24;
    const bx = view.width / 2 - w / 2, by = view.height - 44;
    ctx.fillStyle = "rgba(7, 7, 12, .8)";
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, 30, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.amber;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, view.width / 2, by + 15);
  }

  /* Rods and bobs, the first pendulum on top. */
  const r1 = 6 + 4 * Math.cbrt(state.params.m1);
  const r2 = 6 + 4 * Math.cbrt(state.params.m2);
  for (let i = n - 1; i >= 0; i--) {
    const q = positions(state.sims[i], state.params);
    ctx.strokeStyle = colourOf(i, n, 0.85);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(X(q.x1), Y(q.y1));
    ctx.lineTo(X(q.x2), Y(q.y2));
    ctx.stroke();
    for (const [x, y, r] of [[q.x1, q.y1, r1], [q.x2, q.y2, r2]]) {
      ctx.beginPath();
      ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
      ctx.fillStyle = colourOf(i, n);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.bg;
      ctx.stroke();
    }
  }

  /* The pivot. */
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();

  hud();
}

function hud() {
  $("time").textContent = `${state.t.toFixed(1)} s`;
  $("start").textContent = `${Math.round(state.theta1)}° / ${Math.round(state.theta2)}°`;
  const e = energy(state.sims[0], state.params);
  $("energy").textContent = `${e.toFixed(3)} J`;
  const drift = state.e0 > 1e-9 ? ((e - state.e0) / state.e0) * 100 : 0;
  $("drift").textContent = Math.abs(drift) < 0.00005 ? "drift 0.0000%" : `drift ${drift > 0 ? "+" : "−"}${Math.abs(drift).toFixed(4)}%`;
  const g = gap(state.sims[0], state.sims[1], state.params) * 1000;
  $("gap").textContent = g < 0.001 ? `gap ${g.toExponential(1)} mm` : g < 1000 ? `gap ${g.toPrecision(3)} mm` : `gap ${(g / 1000).toFixed(2)} m`;
  $("split").textContent = state.splitAt === null ? "not yet" : `${state.splitAt.toFixed(1)} s`;
  $("split-box").classList.toggle("is-split", state.splitAt !== null);
}

/* ============================================================
   4. INPUT
   ============================================================ */
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/* Drag the first pendulum's bobs. Everything restarts from there. */
pointer(stage, {
  down(p) {
    const { px, py, scale } = frame();
    const q = positions(state.sims[0], state.params);
    const d1 = Math.hypot(p.x - (px + q.x1 * scale), p.y - (py + q.y1 * scale));
    const d2 = Math.hypot(p.x - (px + q.x2 * scale), p.y - (py + q.y2 * scale));
    const reach = p.type === "touch" ? 44 : 30;
    if (Math.min(d1, d2) > reach) { return; }
    state.dragging = d2 <= d1 ? "bottom" : "top";
    stage.classList.add("is-dragging");
    dragTo(p);
  },
  move(p, held) { if (held && state.dragging) { dragTo(p); } },
  up() {
    if (!state.dragging) { return; }
    state.dragging = null;
    stage.classList.remove("is-dragging");
    persist();
    draw();
  }
});

function dragTo(p) {
  const { px, py, scale } = frame();
  const mx = (p.x - px) / scale, my = (p.y - py) / scale;
  if (state.dragging === "top") {
    state.theta1 = wrapDeg((Math.atan2(mx, my) * 180) / Math.PI);
  } else {
    const q = positions(state.sims[0], state.params);
    state.theta2 = wrapDeg((Math.atan2(mx - q.x1, my - q.y1) * 180) / Math.PI);
  }
  restart();
  draw();
}

function setStart(t1, t2) {
  state.theta1 = wrapDeg(t1);
  state.theta2 = wrapDeg(t2);
  restart();
  persist();
  draw();
}

/* Keyboard on the focused stage: arrows swing the start angles. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const step = e.shiftKey ? 15 : 5;
  if (e.key === "ArrowLeft") { setStart(state.theta1 - step, state.theta2); }
  else if (e.key === "ArrowRight") { setStart(state.theta1 + step, state.theta2); }
  else if (e.key === "ArrowUp") { setStart(state.theta1, state.theta2 + step); }
  else if (e.key === "ArrowDown") { setStart(state.theta1, state.theta2 - step); }
  else if (e.key === " ") { loop.toggle(); }
  else { return; }
  e.preventDefault();
});

const keys = createKeys({ play: ["KeyP"], reset: ["KeyR"], random: ["KeyN"] });
keys.on("play", () => loop.toggle());
keys.on("reset", () => { restart(); draw(); });
keys.on("random", () => randomStart());

function randomStart() {
  /* Big swings are the chaotic ones. */
  const pick = () => (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 85);
  setStart(Math.round(pick()), Math.round(pick()));
}

playBtn.addEventListener("click", () => loop.toggle());
$("reset").addEventListener("click", () => { restart(); draw(); });
$("random").addEventListener("click", randomStart);

/* ---- sliders ---------------------------------------------- */
const SLIDERS = {
  count: { show: (v) => String(v) },
  speed: { show: (v) => `${SPEEDS[v]}×` },
  l1: { show: (v) => `${v.toFixed(1)} m` },
  l2: { show: (v) => `${v.toFixed(1)} m` },
  m1: { show: (v) => `${v.toFixed(1)} kg` },
  m2: { show: (v) => `${v.toFixed(1)} kg` },
  g: { show: (v) => `${v.toFixed(1)} m/s²` }
};
const valueOf = (name) => (name === "count" ? state.count : name === "speed" ? state.speed : state.params[name]);

for (const name of Object.keys(SLIDERS)) {
  $(name).addEventListener("input", (e) => {
    const v = name === "count" || name === "speed" ? Math.round(Number(e.target.value)) : round(Number(e.target.value), 2);
    if (name === "count") { state.count = v; }
    else if (name === "speed") { state.speed = v; }
    else { state.params = { ...state.params, [name]: v }; }
    syncControls();
    if (name !== "speed") { restart(); persist(); }
    draw();
  });
}

function syncControls() {
  for (const [name, s] of Object.entries(SLIDERS)) {
    $(name).value = String(valueOf(name));
    $(`${name}-out`).textContent = s.show(valueOf(name));
  }
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.theta1 = ok.theta1;
  state.theta2 = ok.theta2;
  state.count = ok.count;
  state.params = { l1: ok.l1, l2: ok.l2, m1: ok.m1, m2: ok.m2, g: ok.g };
  syncControls();
  restart();
  draw();
}

/* ============================================================
   GO
   Reduced motion: starts paused, slower, and with no trails.
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
