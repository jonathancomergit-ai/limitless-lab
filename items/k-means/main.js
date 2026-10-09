/* ============================================================
   k-Means Clustering - main script

   The algorithm is in kmeans.js (assign, move, spread, elbow,
   presets). This file runs Play, paints, and listens.

   Sections:
     1. save       dots, k, which set they came from
     2. state      the run and the elbow numbers
     3. draw       regions, dots, centres + trails, elbow chart
     4. input      tap / drag to add dots, keys, buttons
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion } from "../../kit/motion.js";
import { createRun, step, spread, sizes, elbow, nearest, preset, PRESETS } from "./kmeans.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");

const MAX_POINTS = 1500;
const calm = reducedMotion();
const STEPS_PER_SECOND = calm ? 1.2 : 3;
const COLOURS = ["#35D6F5", "#FF2D78", "#FFC93C", "#3DF5A0", "#B392FF", "#FF8A3D", "#6E9BFF", "#E8E8F0"];

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { points: null, k: 3, preset: "blobs3" };

function validate(d) {
  if (!Number.isInteger(d.k) || d.k < 2 || d.k > 8) { return "k in that save must be 2 to 8."; }
  if (d.preset !== null && !PRESETS.includes(d.preset)) { return "Unknown dot set in that save."; }
  if (d.points !== null) {
    if (!Array.isArray(d.points) || d.points.length > MAX_POINTS) { return "The dots in that save are broken."; }
    for (const p of d.points) {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === "number" && v >= 0 && v <= 1)) {
        return "The dots in that save are broken.";
      }
    }
  }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

const r3 = (v) => Math.round(v * 1000) / 1000;
function persist() {
  save.set({ points: points.map((p) => [r3(p.x), r3(p.y)]), k: state.k, preset: state.preset });
}

/* ============================================================
   2. STATE
   ============================================================ */
const state = { k: 3, preset: "blobs3", playing: false, cursor: null, seed: 1 };
let points = [];
let run = createRun(points, state.k, state.seed);
let elbowValues = [];
let clock = 0;
let dirty = true;
let lastMove = "";

exposeForTests({
  get steps() { return run.steps; },
  get phase() { return run.phase; },
  get done() { return run.done; },
  get points() { return points.length; },
  get k() { return state.k; },
  get spread() { return spread(run); },
  get playing() { return state.playing; },
  get elbow() { return elbowValues.slice(); }
});

function restart(newSeed = true) {
  if (newSeed) { state.seed = (state.seed * 48271 + 7) % 2147483647; }
  run = createRun(points, state.k, state.seed);
  lastMove = "";
  setPlaying(false);
  dirty = true;
}

/* Added dots join the current run: the centres stay put, and
   the next move is an assign. */
function addPoint(x, y) {
  if (points.length >= MAX_POINTS) { return; }
  points.push({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
  state.preset = null;
  syncPresetButtons();
  if (run.centres.length < state.k) { restart(false); return; }
  const assign = new Int16Array(points.length).fill(-1);
  assign.set(run.assign.subarray(0, Math.min(run.assign.length, points.length - 1)));
  run.assign = assign;
  run.phase = "assign";
  run.done = false;
  dirty = true;
}

let elbowTimer = 0;
function refreshElbow() {
  clearTimeout(elbowTimer);
  elbowTimer = setTimeout(() => { elbowValues = elbow(points, 8, 1, 3); drawElbow(); }, 120);
}

/* ============================================================
   3. DRAW
   ============================================================ */
const view = createCanvas(stage, { onResize: () => { dirty = true; draw(); } });
const ctx = view.ctx;
const elbowView = createCanvas($("elbow"), { onResize: () => drawElbow() });
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), line: color("--line"), lineB: color("--line-bright"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"), accent: color("--accent")
};
const PAD = 8;
const X = (x) => PAD + x * (view.width - PAD * 2);
const Y = (y) => PAD + y * (view.height - PAD * 2);

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const RGB = COLOURS.map(rgb);

/* Soft regions: which centre is nearest, on a coarse grid that
   the browser smooths when it scales it up. */
const regions = document.createElement("canvas");
const rctx = regions.getContext("2d");
function drawRegions() {
  if (!run.centres.length) { return; }
  const cw = Math.max(8, Math.round(view.width / 7)), ch = Math.max(8, Math.round(view.height / 7));
  if (regions.width !== cw || regions.height !== ch) { regions.width = cw; regions.height = ch; }
  const img = rctx.createImageData(cw, ch);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const p = { x: (i + 0.5) / cw, y: (j + 0.5) / ch };
      const [r, g, b] = RGB[nearest(run.centres, p) % RGB.length];
      const o = (j * cw + i) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 30;
    }
  }
  rctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(regions, X(0), Y(0), X(1) - X(0), Y(1) - Y(0));
}

function draw() {
  if (!dirty) { return; }
  dirty = false;
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);
  drawRegions();

  /* Dots: grey until assigned, then their group's colour. */
  const r = points.length > 600 ? 2.6 : 3.6;
  for (let i = 0; i < points.length; i++) {
    const j = run.assign[i];
    ctx.fillStyle = j >= 0 ? COLOURS[j % COLOURS.length] : C.dim;
    ctx.beginPath();
    ctx.arc(X(points[i].x), Y(points[i].y), r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Trails, then centres: a dark-ringed diamond in the group colour. */
  run.trails.forEach((t, j) => {
    if (t.length < 2) { return; }
    ctx.strokeStyle = COLOURS[j % COLOURS.length];
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    t.forEach((p, k) => (k ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of t.slice(0, -1)) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 2.5, 0, Math.PI * 2); ctx.fillStyle = COLOURS[j % COLOURS.length]; ctx.fill(); }
    ctx.globalAlpha = 1;
  });
  run.centres.forEach((c, j) => {
    const x = X(c.x), y = Y(c.y), s = 13;
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
    ctx.fillStyle = COLOURS[j % COLOURS.length];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.bg;
    ctx.stroke();
  });

  if (!points.length) {
    ctx.fillStyle = C.dim;
    ctx.font = "600 15px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Tap to drop dots, or load a set below", view.width / 2, view.height / 2);
  }

  /* Keyboard cursor, only while the field has focus. */
  if (state.cursor && document.activeElement === stage) {
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(state.cursor.x), Y(state.cursor.y), 9, 0, Math.PI * 2);
    ctx.moveTo(X(state.cursor.x) - 14, Y(state.cursor.y)); ctx.lineTo(X(state.cursor.x) + 14, Y(state.cursor.y));
    ctx.moveTo(X(state.cursor.x), Y(state.cursor.y) - 14); ctx.lineTo(X(state.cursor.x), Y(state.cursor.y) + 14);
    ctx.stroke();
  }

  hud();
}

function hud() {
  $("steps").textContent = String(run.steps);
  $("phase").textContent = run.done ? "Settled" : run.phase === "assign" ? "Next: assign" : "Next: move";
  const s = spread(run);
  let text;
  if (!points.length) { text = "No dots yet."; }
  else if (run.done) { text = `Settled after ${run.steps} moves. Groups: ${sizes(run).join(", ")}. Spread ${s.toFixed(3)}.`; }
  else if (lastMove === "assign") { text = `Assign: ${run.changed} dot${run.changed === 1 ? "" : "s"} joined a new centre. Spread ${s.toFixed(3)}.`; }
  else if (lastMove === "move") { text = `Move: each centre jumped to the middle of its dots. Spread ${s.toFixed(3)}.`; }
  else { text = `${points.length} dots, ${state.k} random centres. Press Step to see the first move.`; }
  $("status").textContent = text;
}

/* The elbow chart: one bar per k, the current k highlighted. */
function drawElbow() {
  const c = elbowView.ctx, w = elbowView.width, h = elbowView.height;
  c.fillStyle = C.bg2;
  c.fillRect(0, 0, w, h);
  const left = 12, right = 12, top = 14, bottom = 24;
  const max = Math.max(1e-9, ...elbowValues);
  const n = 8, gap = (w - left - right) / n;
  c.font = "600 11px 'JetBrains Mono', monospace";
  c.textAlign = "center";
  c.textBaseline = "top";
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const v = elbowValues[k - 1] ?? 0;
    const x = left + gap * (k - 0.5);
    const bh = ((h - top - bottom) * v) / max;
    const on = k === state.k;
    c.fillStyle = on ? C.accent : C.lineB;
    c.fillRect(x - gap * 0.3, h - bottom - bh, gap * 0.6, Math.max(1, bh));
    c.fillStyle = on ? C.text : C.dim;
    c.fillText(String(k), x, h - bottom + 6);
    pts.push([x, h - bottom - bh]);
  }
  c.strokeStyle = C.text;
  c.globalAlpha = 0.6;
  c.lineWidth = 1.5;
  c.beginPath();
  pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.globalAlpha = 1;
  if (!points.length) {
    c.fillStyle = C.dim;
    c.textBaseline = "middle";
    c.fillText("Add dots to see the elbow", w / 2, (h - bottom) / 2);
  }
}

/* ============================================================
   4. INPUT
   ============================================================ */
let lastDrop = null;
const toUnit = (p) => ({ x: (p.x - PAD) / (view.width - PAD * 2), y: (p.y - PAD) / (view.height - PAD * 2) });

pointer(stage, {
  down(p) { const u = toUnit(p); addPoint(u.x, u.y); lastDrop = p; },
  move(p, held) {
    /* Dragging sprays a dot every ~14 px. */
    if (!held || !lastDrop || Math.hypot(p.x - lastDrop.x, p.y - lastDrop.y) < 14) { return; }
    const u = toUnit(p);
    addPoint(u.x, u.y);
    lastDrop = p;
  },
  up() { if (lastDrop) { lastDrop = null; persist(); refreshElbow(); } }
});

stage.addEventListener("focus", () => { if (!state.cursor) { state.cursor = { x: 0.5, y: 0.5 }; } dirty = true; draw(); });
stage.addEventListener("blur", () => { dirty = true; draw(); });
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const c = state.cursor || { x: 0.5, y: 0.5 };
  const d = e.shiftKey ? 0.08 : 0.025;
  const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
  if (moves[e.key]) {
    state.cursor = { x: Math.max(0, Math.min(1, c.x + moves[e.key][0])), y: Math.max(0, Math.min(1, c.y + moves[e.key][1])) };
  } else if (e.key === " " || e.key === "Enter") {
    state.cursor = c;
    addPoint(c.x, c.y);
    persist();
    refreshElbow();
  } else { return; }
  e.preventDefault();
  dirty = true;
  draw();
});

const keys = createKeys({ step: ["KeyS"], play: ["KeyP"], restart: ["KeyR"], clear: ["KeyX"], less: ["Minus", "NumpadSubtract"], more: ["Equal", "NumpadAdd"] });
keys.on("step", () => doStep());
keys.on("play", () => togglePlay());
keys.on("restart", () => restart());
keys.on("clear", () => doClear());
keys.on("less", () => setK(state.k - 1));
keys.on("more", () => setK(state.k + 1));

function doStep() {
  setPlaying(false);
  advance();
}

function advance() {
  if (run.done) { return false; }
  lastMove = run.phase;
  step(run);
  dirty = true;
  return true;
}

function setPlaying(on) {
  state.playing = on && !run.done && points.length > 0;
  playBtn.textContent = state.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", String(state.playing));
  clock = 0;
}

function togglePlay() {
  if (!state.playing && run.done) { restart(); }
  setPlaying(!state.playing);
}

function doClear() {
  points = [];
  state.preset = null;
  syncPresetButtons();
  restart(false);
  persist();
  refreshElbow();
}

function setK(k) {
  k = Math.max(2, Math.min(8, k));
  if (k === state.k) { return; }
  state.k = k;
  $("k").value = String(k);
  $("k-out").textContent = String(k);
  restart(false);
  persist();
  drawElbow();
}

function loadPreset(name) {
  points = preset(name, 7);
  state.preset = name;
  syncPresetButtons();
  restart(false);
  persist();
  refreshElbow();
}

function syncPresetButtons() {
  for (const b of document.querySelectorAll("[data-preset]")) { b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)); }
}

$("step").addEventListener("click", doStep);
playBtn.addEventListener("click", togglePlay);
$("restart").addEventListener("click", () => restart());
$("clear").addEventListener("click", doClear);
$("k").addEventListener("input", (e) => setK(Math.round(Number(e.target.value))));
for (const b of document.querySelectorAll("[data-preset]")) { b.addEventListener("click", () => loadPreset(b.dataset.preset)); }

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.k = ok.k;
  $("k").value = String(ok.k);
  $("k-out").textContent = String(ok.k);
  if (ok.points) {
    points = ok.points.map(([x, y]) => ({ x, y }));
    state.preset = ok.preset;
  } else {
    points = preset(ok.preset || "blobs3", 7);
    state.preset = ok.preset || "blobs3";
  }
  syncPresetButtons();
  restart(false);
  refreshElbow();
}

/* ============================================================
   GO
   Play steps 3 moves a second (1.2 with reduced motion).
   Nothing moves until you press Step or Play.
   ============================================================ */
apply(save.get());
startLoop({
  update(dt) {
    if (!state.playing) { return; }
    clock += dt * STEPS_PER_SECOND;
    if (clock >= 1) {
      clock -= 1;
      if (!advance() || run.done) { setPlaying(false); dirty = true; }
    }
  },
  draw
});

stage.dataset.ready = "true";
