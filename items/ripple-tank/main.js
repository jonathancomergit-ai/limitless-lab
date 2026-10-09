/* ============================================================
   Ripple Tank - main script

   The physics is in physics.js (wave equation, walls, sources,
   presets). This file runs the clock, paints, and listens.

   Sections:
     1. save       preset, frequency, tool, your walls
     2. state      the tank, the tool, the cursor
     3. loop       physics steps (update) + paint (draw)
     4. input      tap / drag, keys, buttons, slider
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys, hasTouch } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  createTank, step, drop, paintLine, applyPreset, calm as calmWater, clearAll,
  waveEnergy, wallCount, encodeWalls, decodeWalls, wavelength, gridSize,
  accumulateScreen, screenColumn, PRESETS, PRESET_NAMES, STEPS_PER_SECOND
} from "./physics.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");
const msg = $("msg");

const TOOLS = ["drop", "wall", "erase"];
const TOOL_NAMES = { drop: "Drop", wall: "Wall", erase: "Eraser" };
const MAX_STEPS_PER_FRAME = 12;

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { preset: "slit2", freq: 10, tool: "drop", walls: null };

function validate(d) {
  if (d.preset !== "none" && !PRESETS.includes(d.preset)) { return "Unknown preset in that save."; }
  if (!Number.isInteger(d.freq) || d.freq < 4 || d.freq > 20) { return "The frequency in that save is out of range."; }
  if (!TOOLS.includes(d.tool)) { return "Unknown tool in that save."; }
  if (d.walls !== null) {
    const w = d.walls;
    if (!w || typeof w !== "object" || !Number.isInteger(w.cols) || !Number.isInteger(w.rows) || typeof w.runs !== "string") {
      return "The walls in that save are broken.";
    }
    if (w.runs.length > 200_000) { return "The walls in that save are too big."; }
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
    preset: state.preset,
    freq: state.freq,
    tool: state.tool,
    walls: state.edited ? encodeWalls(tank) : null
  });
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();
const touchy = hasTouch() || window.innerWidth < 700;

const state = {
  preset: DEFAULTS.preset,   // what the tank was built from ("none" after Clear all)
  edited: false,             // walls changed by hand since the preset
  freq: DEFAULTS.freq,
  tool: DEFAULTS.tool,
  speed: calm ? 0.5 : 1,     // reduced motion runs at half speed
  cursor: null,              // keyboard cursor, in cells
  pen: false,                // keyboard pen down (wall / eraser)
  drops: 0
};

let tank = createTank(60, 60);
let screen = new Float32Array(tank.rows);
let stepClock = 0;
let painting = null;         // { x, y } last painted cell while dragging
let lastDrop = null;

/* Build (or rebuild) the tank to fit the stage. Walls you drew
   are carried over, scaled to the new size. */
function buildTank() {
  const budget = touchy ? 36000 : 64000;
  const { cols, rows } = gridSize(view.width, view.height, budget);
  if (cols === tank.cols && rows === tank.rows) { return false; }
  const keep = state.edited ? encodeWalls(tank) : null;
  tank = createTank(cols, rows);
  tank.freq = state.freq;
  if (state.preset !== "none") { applyPreset(tank, state.preset); }
  if (keep) { decodeWalls(tank, keep); }
  screen = new Float32Array(rows);
  if (state.cursor) {
    state.cursor = { x: Math.min(cols - 2, state.cursor.x), y: Math.min(rows - 2, state.cursor.y) };
  }
  return true;
}

/* A paused, reduced-motion start still shows a real wave
   pattern: run the first second or two straight away. */
function warmUp(steps) {
  for (let k = 0; k < steps; k++) { step(tank); if (k > steps / 2) { accumulateScreen(tank, screen, 0.01); } }
}

exposeForTests({
  get t() { return tank.t; },
  get energy() { return waveEnergy(tank); },
  get walls() { return wallCount(tank); },
  get drops() { return state.drops; },
  get tool() { return state.tool; },
  get preset() { return state.preset; },
  get freq() { return state.freq; },
  get grid() { return [tank.cols, tank.rows]; },
  /* A fingerprint of the water: changes whenever any cell does. */
  get checksum() {
    let s = 0;
    for (let i = 0; i < tank.u.length; i += 7) { s += tank.u[i] * ((i % 13) + 1); }
    return s;
  },
  get running() { return Boolean(loop) && !loop.paused; }
});

onMotionChange((v) => { calm = v; state.speed = v ? 0.5 : 1; draw(); });

/* ============================================================
   3. LOOP
   ============================================================ */
function update(dt) {
  stepClock += dt * STEPS_PER_SECOND * state.speed;
  const n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(stepClock));
  stepClock = Math.min(stepClock - n, 1);
  for (let k = 0; k < n; k++) {
    step(tank);
    accumulateScreen(tank, screen, 0.004);
  }
}

/* ---- drawing ---------------------------------------------- */
const view = createCanvas(stage, { onResize: () => { if (buildTank()) { warmUpIfStill(); } draw(); } });
const ctx = view.ctx;
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber"), bg: color("--bg"),
  bg2: color("--bg-2"), text: color("--text"), dim: color("--text-dim"), line: color("--line-bright")
};

function rgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* Colour map, 512 steps from deep trough to high crest:
   pink  <-  dark water  ->  cyan, brightening to near white. */
const LUT = new Uint32Array(512);
const WALL_PX = (() => {
  const [r, g, b] = rgb(C.dim);
  return (255 << 24) | (b << 16) | (g << 8) | r;
})();
(function buildLut() {
  const base = rgb(C.bg2), hot = rgb(C.hot), cyan = rgb(C.cyan), white = rgb(C.text);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let i = 0; i < 512; i++) {
    const v = i / 255.5 - 1;                       // -1 .. 1
    const a = Math.abs(v);
    let c;
    if (v < 0) { c = mix(base, hot, Math.min(1, a * 1.15) ** 0.9 * 0.85); }
    else {
      c = mix(base, cyan, Math.min(1, a * 1.25) ** 0.9);
      if (a > 0.7) { c = mix(c, white, (a - 0.7) / 0.3 * 0.55); }
    }
    const [r, g, b] = c.map((x) => Math.round(Math.max(0, Math.min(255, x))));
    LUT[i] = (255 << 24) | (b << 16) | (g << 8) | r;    // little-endian RGBA
  }
})();

let off = null, offCtx = null, img = null, px = null;
function ensureOffscreen() {
  if (off && off.width === tank.cols && off.height === tank.rows) { return; }
  off = document.createElement("canvas");
  off.width = tank.cols;
  off.height = tank.rows;
  offCtx = off.getContext("2d");
  img = offCtx.createImageData(tank.cols, tank.rows);
  px = new Uint32Array(img.data.buffer);
}

function draw() {
  ensureOffscreen();
  const { u, wall } = tank;
  for (let i = 0; i < u.length; i++) {
    if (wall[i]) { px[i] = WALL_PX; continue; }
    /* tanh-like squash keeps big waves from all looking the same. */
    const v = u[i] * 0.9;
    const s = v / (1 + Math.abs(v));
    px[i] = LUT[Math.max(0, Math.min(511, Math.round((s + 1) * 255.5)))];
  }
  offCtx.putImageData(img, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, view.width, view.height);

  const sx = view.width / tank.cols, sy = view.height / tank.rows;
  const X = (x) => (x + 0.5) * sx, Y = (y) => (y + 0.5) * sy;

  /* Sources: amber dots (a line of them is a flat wave maker). */
  if (tank.sources.length) {
    ctx.fillStyle = C.amber;
    if (tank.sources.length > 4) {
      const s0 = tank.sources[0];
      ctx.globalAlpha = 0.7;
      ctx.fillRect(X(s0.x) - 1.5, 0, 3, view.height);
      ctx.globalAlpha = 1;
    } else {
      for (const s of tank.sources) {
        ctx.beginPath();
        ctx.arc(X(s.x), Y(s.y), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.bg;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    drawScreen(sx, sy);
  }

  drawScaleBar(sx);

  /* Keyboard cursor, only while the stage has focus. */
  if (state.cursor && document.activeElement === stage) {
    const r = Math.max(8, brush() * sx);
    ctx.strokeStyle = state.pen ? C.amber : C.text;
    ctx.lineWidth = 2;
    ctx.setLineDash(state.pen ? [] : [4, 4]);
    ctx.beginPath();
    ctx.arc(X(state.cursor.x), Y(state.cursor.y), r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  hud();
}

/* The "screen": a brightness graph down the right edge. */
function drawScreen(sx, sy) {
  let max = 1e-6;
  for (let y = 0; y < screen.length; y++) { if (screen[y] > max) { max = screen[y]; } }
  const w = Math.min(46, view.width * 0.1);
  const x0 = view.width - w - 6;
  const bottom = view.height - 24;
  const xLine = (screenColumn(tank) + 0.5) * sx;
  ctx.fillStyle = "rgba(7, 7, 12, .62)";
  ctx.fillRect(x0 - 4, 40, w + 8, view.height - 44);
  ctx.strokeStyle = "rgba(255, 201, 60, .35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xLine, 44);
  ctx.lineTo(xLine, bottom);
  ctx.stroke();
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.moveTo(x0, 44);
  for (let y = 0; y < screen.length; y++) {
    const yy = (y + 0.5) * sy;
    if (yy < 44 || yy > bottom) { continue; }
    ctx.lineTo(x0 + (w * screen[y]) / max, yy);
  }
  ctx.lineTo(x0, bottom);
  ctx.closePath();
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.dim;
  ctx.font = "600 10px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("SCREEN", x0 + w / 2, bottom + 6);
}

/* One wavelength, to scale, bottom left. */
function drawScaleBar(sx) {
  const len = wavelength(state.freq, tank.courant) * sx;
  const x = 14, y = view.height - 16;
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
  ctx.moveTo(x, y); ctx.lineTo(x + len, y);
  ctx.moveTo(x + len, y - 5); ctx.lineTo(x + len, y + 5);
  ctx.stroke();
  ctx.fillStyle = C.text;
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("1 wavelength", x, y - 8);
}

function hud() {
  $("time").textContent = `${(tank.t / STEPS_PER_SECOND).toFixed(1)} s`;
  $("mode").textContent = state.preset === "none" ? "Your tank" : PRESET_NAMES[state.preset] + (state.edited ? " + walls" : "");
}

/* ============================================================
   4. INPUT
   ============================================================ */
const brush = () => (state.tool === "erase" ? 4 : 1.6);
const toCell = (p) => ({
  x: Math.max(1, Math.min(tank.cols - 2, (p.x / view.width) * tank.cols - 0.5)),
  y: Math.max(1, Math.min(tank.rows - 2, (p.y / view.height) * tank.rows - 0.5))
});

function dropAt(c) {
  drop(tank, c.x, c.y, { radius: 2.6, height: 3 });
  state.drops += 1;
  if (!loop || loop.paused) { draw(); }
}

function paintTo(c) {
  const from = painting || c;
  const n = paintLine(tank, from.x, from.y, c.x, c.y, brush(), state.tool === "wall" ? 1 : 0);
  if (n) { state.edited = true; }
  painting = c;
  if (!loop || loop.paused) { draw(); }
}

pointer(stage, {
  down(p) {
    const c = toCell(p);
    if (state.tool === "drop") { dropAt(c); lastDrop = c; }
    else { painting = null; paintTo(c); }
  },
  move(p, held) {
    if (!held) { return; }
    const c = toCell(p);
    if (state.tool === "drop") {
      /* A finger dragged through the water leaves a trail of drops. */
      if (lastDrop && Math.hypot(c.x - lastDrop.x, c.y - lastDrop.y) > 7) { dropAt(c); lastDrop = c; }
    } else if (painting) { paintTo(c); }
  },
  up() {
    lastDrop = null;
    if (painting) { painting = null; persist(); }
  }
});

/* Keyboard on the focused stage: a cursor you can drop or draw with. */
stage.addEventListener("focus", () => {
  if (!state.cursor) { state.cursor = { x: Math.round(tank.cols / 2), y: Math.round(tank.rows / 2) }; }
  draw();
});
stage.addEventListener("blur", () => { state.pen = false; painting = null; draw(); });

stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const c = state.cursor || { x: Math.round(tank.cols / 2), y: Math.round(tank.rows / 2) };
  const d = e.shiftKey ? 10 : 3;
  const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
  if (moves[e.key]) {
    const [dx, dy] = moves[e.key];
    state.cursor = {
      x: Math.max(1, Math.min(tank.cols - 2, c.x + dx)),
      y: Math.max(1, Math.min(tank.rows - 2, c.y + dy))
    };
    if (state.pen && state.tool !== "drop") { paintTo(state.cursor); }
    draw();
  } else if (e.key === " " || e.key === "Enter") {
    state.cursor = c;
    if (state.tool === "drop") { dropAt(c); }
    else {
      state.pen = !state.pen;
      if (state.pen) { painting = null; paintTo(c); } else { painting = null; persist(); }
    }
    draw();
  } else { return; }
  e.preventDefault();
});

const keys = createKeys({ play: ["KeyP"], calm: ["KeyC"], clear: ["KeyX"], t1: ["Digit1", "Numpad1"], t2: ["Digit2", "Numpad2"], t3: ["Digit3", "Numpad3"] });
keys.on("play", () => loop.toggle());
keys.on("calm", () => doCalm());
keys.on("clear", () => doClear());
keys.on("t1", () => setTool("drop"));
keys.on("t2", () => setTool("wall"));
keys.on("t3", () => setTool("erase"));

function setTool(t) {
  state.tool = t;
  state.pen = false;
  painting = null;
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === t)); }
  persist();
  draw();
}

function setPreset(name) {
  state.preset = name;
  state.edited = false;
  tank.freq = state.freq;
  applyPreset(tank, name);
  screen.fill(0);
  syncPresetButtons();
  persist();
  warmUpIfStill();
  draw();
}

function syncPresetButtons() {
  for (const b of document.querySelectorAll("[data-preset]")) { b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)); }
}

function warmUpIfStill() {
  if (loop && loop.paused && tank.sources.length) { warmUp(600); }
}

function doCalm() {
  calmWater(tank);
  screen.fill(0);
  draw();
}

function doClear() {
  clearAll(tank);
  screen.fill(0);
  state.preset = "none";
  state.edited = false;
  syncPresetButtons();
  persist();
  draw();
}

for (const b of document.querySelectorAll("[data-tool]")) { b.addEventListener("click", () => setTool(b.dataset.tool)); }
for (const b of document.querySelectorAll("[data-preset]")) { b.addEventListener("click", () => setPreset(b.dataset.preset)); }
playBtn.addEventListener("click", () => loop.toggle());
$("calm").addEventListener("click", doCalm);
$("clear").addEventListener("click", doClear);

$("freq").addEventListener("input", (e) => {
  state.freq = Math.round(Number(e.target.value));
  tank.freq = state.freq;
  screen.fill(0);
  syncFreq();
  persist();
  draw();
});
function syncFreq() {
  $("freq").value = String(state.freq);
  $("freq-out").textContent = `${state.freq} Hz`;
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.preset = ok.preset;
  state.freq = ok.freq;
  state.tool = ok.tool;
  tank.freq = state.freq;
  clearAll(tank);
  if (state.preset !== "none") { applyPreset(tank, state.preset); }
  state.edited = Boolean(ok.walls) && decodeWalls(tank, ok.walls);
  screen.fill(0);
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)); }
  syncPresetButtons();
  syncFreq();
  warmUpIfStill();
  draw();
}

/* ============================================================
   GO
   Reduced motion: starts paused (with a wave pattern already
   showing), and runs at half speed.
   ============================================================ */
let loop = null;
buildTank();
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
if (loop.paused) { warmUpIfStill(); draw(); }
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));
msg.hidden = !loop.paused;

stage.dataset.ready = "true";
