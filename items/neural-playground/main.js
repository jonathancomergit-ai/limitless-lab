/* ============================================================
   Neural Net Playground - main script

   The maths lives in net.js (the network), data.js (presets)
   and contour.js (the decision line). This file only does
   pictures, buttons and saving.

   Sections:
     1. save       dots + settings
     2. state      the network and its trainer
     3. training   a few epochs per frame, inside a time budget
     4. drawing    plot (hero), network diagram, loss chart
     5. input      tap/click, keyboard cursor, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { createNet, createAdam, zeroGrads, trainEpoch, meanLoss, sampleGrid, accuracy, ACTIVATIONS } from "./net.js";
import { makePreset, PRESETS } from "./data.js";
import { contour } from "./contour.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const msg = $("msg");
const playBtn = $("play");

/* Learning rates the slider steps through (index 7 = 0.03). */
const RATES = [0.0003, 0.001, 0.002, 0.003, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5];
const MAX_POINTS = 500;
const HEAT_N = 50;          // the decision heatmap is worked out on a 50 x 50 grid...
const NEURON_N = 20;        // ...and each little neuron picture on 20 x 20
const EPOCHS_PER_FRAME = 3; // slow enough to watch it learn
const BUDGET_MS = 7;        // never spend longer than this per frame training

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { points: makePreset("circle"), color: 0, layers: 2, neurons: 4, activation: "tanh", lr: 7, seed: 1 };

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function validate(d) {
  if (!Array.isArray(d.points) || d.points.length > MAX_POINTS) { return "The dots in that save don't look right."; }
  const okPoint = (p) => Array.isArray(p) && p.length === 3 && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1 && (p[2] === 0 || p[2] === 1);
  if (!d.points.every(okPoint)) { return "One of the dots in that save is broken."; }
  if (!isInt(d.layers, 1, 3) || !isInt(d.neurons, 1, 8) || !isInt(d.lr, 0, RATES.length - 1)) { return "The network settings in that save are out of range."; }
  if (!ACTIVATIONS[d.activation] || !isInt(d.color, 0, 1) || !isInt(d.seed, 0, 1e9)) { return "That save has unexpected settings."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

/* Settings that came from storage are trusted only if they pass. */
const loaded = save.get();
const settings = validate(loaded) === true ? loaded : structuredClone(DEFAULTS);

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save.set({
    points: state.points, color: state.color, layers: state.layers, neurons: state.neurons,
    activation: state.activation, lr: state.lr, seed: state.seed
  }), 300);
}

/* ============================================================
   2. STATE
   ============================================================ */
const state = {
  ...settings,
  epoch: 0,
  loss: null,
  acc: null,
  history: [],          // loss over time, thinned out as it grows
  stride: 1,            // epochs per history entry
  cursor: { x: 0, y: 0, show: false }
};
let net, opt, grads;
let gridDirty = true;

function rebuild() {
  net = createNet({ hidden: Array(state.layers).fill(state.neurons), activation: state.activation, seed: state.seed });
  opt = createAdam(net, { lr: RATES[state.lr] });
  grads = zeroGrads(net);
  state.epoch = 0;
  state.history = [];
  state.stride = 1;
  measure();
  gridDirty = true;
}

function measure() {
  state.loss = state.points.length ? meanLoss(net, state.points) : null;
  state.acc = state.points.length ? accuracy(net, state.points) : null;
}

/* Read-only window for smoke.js. */
exposeForTests({
  get epoch() { return state.epoch; },
  get loss() { return state.loss; },
  get dots() { return state.points.length; },
  get running() { return Boolean(loop) && !loop.paused; }
});

let calm = reducedMotion();
onMotionChange((v) => { calm = v; });

/* ============================================================
   3. TRAINING
   ============================================================ */
function trainOnce() {
  if (!state.points.length) { return; }
  const loss = trainEpoch(net, opt, state.points, grads);
  state.epoch += 1;
  if (state.epoch % state.stride === 0) {
    state.history.push(loss);
    if (state.history.length > 400) {
      /* Keep the chart a fixed size: average pairs, halve the rate. */
      const h = state.history;
      state.history = Array.from({ length: h.length >> 1 }, (_, i) => (h[2 * i] + h[2 * i + 1]) / 2);
      state.stride *= 2;
    }
  }
  gridDirty = true;
}

function update() {
  if (!state.points.length) { return; }
  const t0 = performance.now();
  for (let i = 0; i < EPOCHS_PER_FRAME; i++) {
    trainOnce();
    if (performance.now() - t0 > BUDGET_MS) { break; }
  }
  measure();
}

/* ============================================================
   4. DRAWING
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const C = {
  hot: color("--hot"), cyan: color("--cyan"), bg: color("--bg"), bg2: color("--bg-2"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"),
  line: color("--line"), lineBright: color("--line-bright"), surface: color("--surface")
};
const HOT = rgb(C.hot), CYAN = rgb(C.cyan), BASE = rgb(C.bg2);

/* d in -1..1: -1 = full red, 0 = background, +1 = full blue. */
function shade(d, strength, out, k) {
  const target = d < 0 ? HOT : CYAN;
  const s = Math.pow(Math.min(1, Math.abs(d)), 0.75) * strength;
  out[k]     = BASE[0] + (target[0] - BASE[0]) * s;
  out[k + 1] = BASE[1] + (target[1] - BASE[1]) * s;
  out[k + 2] = BASE[2] + (target[2] - BASE[2]) * s;
  out[k + 3] = 255;
}

/* ---- the plot --------------------------------------------- */
const view = createCanvas(stage, { onResize: () => { gridDirty = true; draw(); } });
const ctx = view.ctx;

/* The heatmap is painted at 50 x 50 into this small canvas, then
   scaled up with smoothing, which blends it into soft gradients. */
const heat = document.createElement("canvas");
heat.width = heat.height = HEAT_N;
const heatCtx = heat.getContext("2d");
const heatImg = heatCtx.createImageData(HEAT_N, HEAT_N);
let probs = null;
let neuronMaps = null;

function refreshGrids() {
  probs = sampleGrid(net, HEAT_N).probs;
  for (let k = 0; k < probs.length; k++) { shade(probs[k] * 2 - 1, 0.34, heatImg.data, k * 4); }
  heatCtx.putImageData(heatImg, 0, 0);
  neuronMaps = sampleGrid(net, NEURON_N, { neurons: true }).maps;
  gridDirty = false;
}

/* Where the square plot sits inside the stage. */
function plotBox() {
  const size = Math.min(view.width, view.height);
  return { x: (view.width - size) / 2, y: (view.height - size) / 2, size };
}
const toPx = (b, x, y) => [b.x + ((x + 1) / 2) * b.size, b.y + ((1 - y) / 2) * b.size];
const toData = (b, px, py) => [((px - b.x) / b.size) * 2 - 1, 1 - ((py - b.y) / b.size) * 2];

function drawPlot() {
  const b = plotBox();
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(heat, b.x, b.y, b.size, b.size);

  /* Faint axes through the middle. */
  ctx.strokeStyle = "rgba(236, 238, 246, .08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(b.x + b.size / 2, b.y); ctx.lineTo(b.x + b.size / 2, b.y + b.size);
  ctx.moveTo(b.x, b.y + b.size / 2); ctx.lineTo(b.x + b.size, b.y + b.size / 2);
  ctx.stroke();

  /* The decision line: where the guess flips from red to blue. */
  if (state.points.length) {
    const segs = contour(probs, HEAT_N, 0.5);
    const cell = b.size / HEAT_N;
    ctx.strokeStyle = "rgba(236, 238, 246, .85)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(b.x + (segs[i] + 0.5) * cell, b.y + (segs[i + 1] + 0.5) * cell);
      ctx.lineTo(b.x + (segs[i + 2] + 0.5) * cell, b.y + (segs[i + 3] + 0.5) * cell);
    }
    ctx.stroke();
  }

  /* The dots. */
  const r = Math.max(4.5, Math.min(7, b.size / 70));
  for (const [x, y, label] of state.points) {
    const [px, py] = toPx(b, x, y);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = label ? C.cyan : C.hot;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.bg;
    ctx.stroke();
  }

  /* Keyboard cursor. */
  if (state.cursor.show) {
    const [cx, cy] = toPx(b, state.cursor.x, state.cursor.y);
    ctx.strokeStyle = state.color ? C.cyan : C.hot;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.moveTo(cx - r - 12, cy); ctx.lineTo(cx - r - 3, cy);
    ctx.moveTo(cx + r + 3, cy); ctx.lineTo(cx + r + 12, cy);
    ctx.moveTo(cx, cy - r - 12); ctx.lineTo(cx, cy - r - 3);
    ctx.moveTo(cx, cy + r + 3); ctx.lineTo(cx, cy + r + 12);
    ctx.stroke();
  }
}

/* ---- the network diagram ---------------------------------- */
const netView = createCanvas($("net-box"), { onResize: () => drawNet() });
const nctx = netView.ctx;
const mini = document.createElement("canvas");
mini.width = mini.height = NEURON_N;
const miniCtx = mini.getContext("2d");
const miniImg = miniCtx.createImageData(NEURON_N, NEURON_N);

function neuronSpots() {
  const W = netView.width, H = netView.height;
  const sizes = net.sizes;
  const most = Math.max(...sizes);
  const r = Math.max(5, Math.min(13, (H - 16) / (most * 2.6), W / (sizes.length * 5)));
  const gap = most > 1 ? Math.min(r * 3.1, (H - 2 * r - 12) / (most - 1)) : 0;
  const left = r + 18, right = W - r - 32;
  return sizes.map((n, l) => {
    const x = left + (l * (right - left)) / (sizes.length - 1);
    return Array.from({ length: n }, (_, j) => ({ x, y: H / 2 + (j - (n - 1) / 2) * gap, r }));
  });
}

function drawNet() {
  if (!net) { return; }
  const W = netView.width, H = netView.height;
  nctx.fillStyle = C.surface;
  nctx.fillRect(0, 0, W, H);
  const spots = neuronSpots();

  /* Weights: blue = positive, red = negative, thick = big. */
  nctx.lineCap = "round";
  for (let l = 0; l < net.layers.length; l++) {
    const { nIn, nOut, W: w } = net.layers[l];
    for (let o = 0; o < nOut; o++) {
      for (let i = 0; i < nIn; i++) {
        const v = w[o * nIn + i];
        const m = Math.min(1, Math.abs(v) / 2.5);
        const [cr, cg, cb] = v < 0 ? HOT : CYAN;
        nctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.18 + 0.72 * m})`;
        nctx.lineWidth = 0.6 + 4.4 * m;
        const a = spots[l][i], z = spots[l + 1][o];
        nctx.beginPath();
        nctx.moveTo(a.x, a.y);
        nctx.lineTo(z.x, z.y);
        nctx.stroke();
      }
    }
  }

  /* Neurons: each shows what it "sees" across the whole plot. */
  const last = net.sizes.length - 1;
  for (let l = 0; l <= last; l++) {
    for (let j = 0; j < net.sizes[l]; j++) {
      const s = spots[l][j];
      const vals = neuronMaps ? neuronMaps[l][j] : null;
      if (vals) {
        const centre = l === last || (l > 0 && net.activation === "sigmoid") ? 0.5 : 0;
        let span = 1e-6;
        for (const v of vals) { span = Math.max(span, Math.abs(v - centre)); }
        if (l === last) { span = 0.5; }
        for (let k = 0; k < vals.length; k++) { shade((vals[k] - centre) / span, 0.95, miniImg.data, k * 4); }
        miniCtx.putImageData(miniImg, 0, 0);
        nctx.save();
        nctx.beginPath();
        nctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        nctx.clip();
        nctx.imageSmoothingEnabled = true;
        nctx.drawImage(mini, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        nctx.restore();
      }
      nctx.beginPath();
      nctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      nctx.lineWidth = l === last ? 2 : 1.5;
      nctx.strokeStyle = l === last ? C.text : C.lineBright;
      nctx.stroke();
    }
  }

  /* Labels for the inputs and the output. */
  nctx.fillStyle = C.dim;
  nctx.font = "600 11px 'JetBrains Mono', monospace";
  nctx.textBaseline = "middle";
  nctx.textAlign = "right";
  spots[0].forEach((s, j) => nctx.fillText(j ? "y" : "x", s.x - s.r - 5, s.y));
  nctx.textAlign = "left";
  const out = spots[last][0];
  nctx.fillText("out", out.x + out.r + 5, out.y);
}

/* ---- the loss chart --------------------------------------- */
const lossView = createCanvas($("loss-box"), { onResize: () => drawLoss() });
const lctx = lossView.ctx;

function drawLoss() {
  const W = lossView.width, H = lossView.height;
  lctx.fillStyle = C.surface;
  lctx.fillRect(0, 0, W, H);
  const h = state.history;
  const top = Math.max(0.75, ...h.slice(0, 40));
  const pad = 6;
  const yOf = (v) => pad + (1 - Math.min(v, top) / top) * (H - 2 * pad);

  /* A baseline at zero loss. */
  lctx.strokeStyle = C.line;
  lctx.lineWidth = 1;
  lctx.beginPath();
  lctx.moveTo(0, yOf(0) + 0.5);
  lctx.lineTo(W, yOf(0) + 0.5);
  lctx.stroke();

  if (h.length > 1) {
    const xOf = (i) => (i / Math.max(h.length - 1, 1)) * W;
    lctx.beginPath();
    h.forEach((v, i) => (i ? lctx.lineTo(xOf(i), yOf(v)) : lctx.moveTo(xOf(i), yOf(v))));
    lctx.lineTo(W, yOf(0));
    lctx.lineTo(0, yOf(0));
    lctx.closePath();
    lctx.fillStyle = "rgba(53, 214, 245, .14)";
    lctx.fill();
    lctx.beginPath();
    h.forEach((v, i) => (i ? lctx.lineTo(xOf(i), yOf(v)) : lctx.moveTo(xOf(i), yOf(v))));
    lctx.strokeStyle = C.cyan;
    lctx.lineWidth = 2;
    lctx.lineJoin = "round";
    lctx.stroke();
  } else {
    lctx.fillStyle = C.faint;
    lctx.font = "500 12px 'JetBrains Mono', monospace";
    lctx.textAlign = "center";
    lctx.textBaseline = "middle";
    lctx.fillText(state.points.length ? "Press Play to train" : "Add some dots", W / 2, H / 2);
  }
}

/* ---- all together ----------------------------------------- */
function draw() {
  if (!net) { return; }
  if (gridDirty) { refreshGrids(); }
  drawPlot();
  drawNet();
  drawLoss();
  hud();
}

function hud() {
  $("epoch").textContent = String(state.epoch);
  $("loss").textContent = state.loss == null ? "-" : state.loss.toFixed(3);
  $("acc").textContent = state.acc == null ? "" : `${Math.round(state.acc * 100)}% right`;
  msg.hidden = state.points.length > 0;
}

/* ============================================================
   5. INPUT
   ============================================================ */

/* Tap empty space: add a dot. Tap a dot: remove it. */
function toggleDot(x, y) {
  if (Math.abs(x) > 1 || Math.abs(y) > 1) { return; }
  const b = plotBox();
  const reach = (14 / b.size) * 2;       // 14 px, in data units
  let best = -1, bestD = reach;
  state.points.forEach((p, i) => {
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bestD) { best = i; bestD = d; }
  });
  if (best >= 0) {
    state.points.splice(best, 1);
  } else if (state.points.length < MAX_POINTS) {
    state.points.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, state.color]);
  }
  measure();
  persist();
  draw();
}

pointer(stage, {
  down(p) {
    state.cursor.show = false;
    const [x, y] = toData(plotBox(), p.x, p.y);
    toggleDot(x, y);
  }
});

/* Keyboard on the focused plot: a cursor to drop dots with. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const move = e.shiftKey ? 0.2 : 0.05;
  const c = state.cursor;
  const moves = { ArrowLeft: [-move, 0], ArrowRight: [move, 0], ArrowUp: [0, move], ArrowDown: [0, -move] };
  if (moves[e.key]) {
    c.x = Math.max(-0.97, Math.min(0.97, c.x + moves[e.key][0]));
    c.y = Math.max(-0.97, Math.min(0.97, c.y + moves[e.key][1]));
  } else if (e.key === "Enter" || e.key === " ") {
    toggleDot(c.x, c.y);
  } else {
    return;
  }
  e.preventDefault();
  c.show = true;
  draw();
});
stage.addEventListener("blur", () => { state.cursor.show = false; draw(); });

/* Shortcut keys, anywhere on the page. */
const keys = createKeys({ play: ["KeyP"], step: ["KeyN"], reset: ["KeyR"], color: ["KeyC"] });
keys.on("play", () => loop.toggle());
keys.on("step", () => stepOnce());
keys.on("reset", () => resetWeights());
keys.on("color", () => setColor(1 - state.color));

/* ---- buttons ---------------------------------------------- */
function stepOnce() {
  if (!loop.paused) { loop.pause(); }
  trainOnce();
  measure();
  draw();
}

function resetWeights() {
  state.seed = (state.seed + 1) % 1e9;
  rebuild();
  persist();
  draw();
}

function showColor() {
  $("pick-red").setAttribute("aria-pressed", String(state.color === 0));
  $("pick-blue").setAttribute("aria-pressed", String(state.color === 1));
}

function setColor(c) {
  state.color = c;
  showColor();
  persist();
  draw();
}

playBtn.addEventListener("click", () => loop.toggle());
$("step").addEventListener("click", stepOnce);
$("reset").addEventListener("click", resetWeights);
$("pick-red").addEventListener("click", () => setColor(0));
$("pick-blue").addEventListener("click", () => setColor(1));
$("clear").addEventListener("click", () => {
  state.points = [];
  rebuild();
  persist();
  draw();
});

for (const btn of document.querySelectorAll("[data-preset]")) {
  btn.addEventListener("click", () => {
    if (!PRESETS.includes(btn.dataset.preset)) { return; }
    state.points = makePreset(btn.dataset.preset);
    rebuild();
    persist();
    draw();
  });
}

for (const btn of document.querySelectorAll("[data-act]")) {
  btn.addEventListener("click", () => {
    state.activation = btn.dataset.act;
    syncControls();
    rebuild();
    persist();
    draw();
  });
}

/* ---- sliders ---------------------------------------------- */
const sliders = { layers: $("layers"), neurons: $("neurons"), lr: $("lr") };
for (const [name, input] of Object.entries(sliders)) {
  input.addEventListener("input", () => {
    state[name] = Number(input.value);
    syncControls();
    if (name === "lr") { opt.lr = RATES[state.lr]; } else { rebuild(); }
    persist();
    draw();
  });
}

function syncControls() {
  for (const [name, input] of Object.entries(sliders)) { input.value = String(state[name]); }
  $("layers-out").textContent = String(state.layers);
  $("neurons-out").textContent = String(state.neurons);
  $("lr-out").textContent = String(RATES[state.lr]);
  for (const btn of document.querySelectorAll("[data-act]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.act === state.activation));
  }
  showColor();
}

/* Load a whole save (import, delete) into the page. */
function apply(d) {
  Object.assign(state, {
    points: d.points, color: d.color, layers: d.layers, neurons: d.neurons,
    activation: d.activation, lr: d.lr, seed: d.seed
  });
  syncControls();
  rebuild();
  draw();
}

/* ============================================================
   GO
   Reduced motion: start paused, with the Play button ready.
   ============================================================ */
rebuild();
syncControls();
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
