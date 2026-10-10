/* ============================================================
   Fluid Sim - main script

   The solver is in fluid.js (advection, diffusion, pressure
   projection, vorticity, walls, presets). This file runs the
   clock, paints the dye, and listens.

   Sections:
     1. save       preset, sliders, colour, toggles, tool
     2. state      the tank, the fingers, the cursor
     3. loop       solver steps (update) + paint (draw)
     4. input      fingers / mouse, keys, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys, hasTouch } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  createFluid, step, splat, paintWalls, applyPreset, clearInk, clearAll as emptyTank, resample, gridSize,
  totalDye, meanSpeed, wallCount, sampleU, sampleV, hueColor,
  COLORS, PRESETS, PRESET_NAMES, STEP, SOLID
} from "./fluid.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");
const msg = $("msg");

const TOOLS = ["stir", "wall", "erase"];
const INKS = ["rainbow", ...Object.keys(COLORS)];
const INK_NAMES = { rainbow: "Rainbow", pink: "Pink", cyan: "Cyan", amber: "Amber", green: "Green", violet: "Violet", white: "White" };
const MAX_STEPS_PER_FRAME = 2;

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = {
  preset: "jets", viscosity: 1, fade: 3, swirl: 4,
  ink: "rainbow", arrows: false, pressure: false, tool: "stir"
};

const level = (v) => Number.isInteger(v) && v >= 0 && v <= 10;
function validate(d) {
  if (d.preset !== "none" && !PRESETS.includes(d.preset)) { return "Unknown preset in that save."; }
  for (const k of ["viscosity", "fade", "swirl"]) { if (!level(d[k])) { return `The ${k} in that save is out of range.`; } }
  if (!INKS.includes(d.ink)) { return "Unknown ink colour in that save."; }
  if (typeof d.arrows !== "boolean" || typeof d.pressure !== "boolean") { return "That save is missing a toggle."; }
  if (!TOOLS.includes(d.tool)) { return "Unknown tool in that save."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

function persist() {
  const { preset, viscosity, fade, swirl, ink, arrows, pressure, tool } = state;
  save.set({ preset, viscosity, fade, swirl, ink, arrows, pressure, tool });
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();
const touchy = hasTouch() || window.innerWidth < 700;
/* Cells in the tank: fewer on phones, so it stays smooth. */
const BUDGET = touchy ? 8500 : 16000;

const state = {
  ...structuredClone(DEFAULTS),
  speed: calm ? 0.5 : 1,     // reduced motion runs at half speed
  cursor: null,              // keyboard cursor, in cells
  pen: false,                // keyboard pen down (wall / eraser)
  stirs: 0,                  // pushes so far (fingers, mouse, keys)
  streams: 0,                // most fingers stirring at once
  hue: 0,                    // rainbow clock
  fps: 60
};

const view = createCanvas(stage, { onResize: () => { rebuild(); draw(); } });
const ctx = view.ctx;

let sim = makeSim();
let stepClock = 0;
let stepCost = 0;             // ms per solver step, smoothed
const fingers = new Map();    // pointerId -> { x, y, time, hue }
let fingerCount = 0;

function makeSim() {
  const { cols, rows } = gridSize(view.width, view.height, BUDGET);
  return createFluid(cols, rows);
}

/* The stage changed size: same tank, new grid. */
function rebuild() {
  const { cols, rows } = gridSize(view.width, view.height, BUDGET);
  if (cols === sim.cols && rows === sim.rows) { return; }
  sim = resample(sim, cols, rows);
  setParams();
}

/* Tank size in "100-cell" units: settings feel the same on any grid. */
const scale = () => Math.min(sim.cols, sim.rows) / 100;

function setParams() {
  const s = scale();
  sim.params.viscosity = state.viscosity * state.viscosity * 0.5 * s * s;
  sim.params.fade = state.fade * 0.06;
  sim.params.swirl = state.swirl * 2.5 * s;
}

exposeForTests({
  get t() { return sim.t; },
  get dye() { return totalDye(sim); },
  get speed() { return meanSpeed(sim); },
  get walls() { return wallCount(sim); },
  get stirs() { return state.stirs; },
  get streams() { return state.streams; },
  get tool() { return state.tool; },
  get ink() { return state.ink; },
  get preset() { return state.preset; },
  get arrows() { return state.arrows; },
  get pressure() { return state.pressure; },
  get settings() { return { viscosity: state.viscosity, fade: state.fade, swirl: state.swirl }; },
  get grid() { return [sim.cols, sim.rows]; },
  get fps() { return state.fps; },
  get stepMs() { return stepCost; },
  get running() { return Boolean(loop) && !loop.paused; }
});

onMotionChange((v) => { calm = v; state.speed = v ? 0.5 : 1; });

/* ============================================================
   3. LOOP
   ============================================================ */
let fpsTime = 0, fpsFrames = 0;

function update(dt) {
  /* Frames per second, for the HUD. */
  fpsTime += dt;
  fpsFrames++;
  if (fpsTime >= 0.5) { state.fps = Math.round(fpsFrames / fpsTime); fpsTime = 0; fpsFrames = 0; }

  state.hue = (state.hue + dt * 0.12) % 1;
  stepClock += (dt * state.speed) / STEP;
  const n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(stepClock));
  stepClock = Math.min(stepClock - n, 1);
  for (let k = 0; k < n; k++) {
    holdInk();
    const t0 = performance.now();
    step(sim);
    stepCost = stepCost * 0.9 + (performance.now() - t0) * 0.1;
  }
  /* A slow device: fewer pressure sweeps (a little squishier, much faster). */
  sim.params.iterations = stepCost > 14 ? 12 : stepCost > 9 ? 18 : 24;
}

/* A finger held still keeps leaking a little ink. */
function holdInk() {
  if (state.tool !== "stir") { return; }
  for (const f of fingers.values()) {
    splat(sim, f.x, f.y, { radius: brushR() * 0.8, color: inkColor(f.hue), dye: 0.05, blend: 0 });
  }
}

/* ---- drawing ---------------------------------------------- */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), text: color("--text"), dim: color("--text-dim"),
  field: color("--line-field"), hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber")
};

function rgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;   // little-endian RGBA

/* Dye -> brightness, per channel: glows towards full, never clips.
   1024 steps covering dye 0..4. */
const BG = rgb(C.bg2);
const LUT = [0, 1, 2].map((ch) => {
  const t = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const d = i / 256;
    t[i] = Math.round(BG[ch] + (255 - BG[ch]) * (1 - Math.exp(-1.8 * d)));
  }
  return t;
});
const WALL_PX = pack(rgb(C.field));

/* Pressure: pink = high, cyan = low. */
const PLUT = new Uint32Array(512);
(function buildPressureLut() {
  const base = rgb(C.bg2), hot = rgb(C.hot), cyan = rgb(C.cyan);
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  for (let i = 0; i < 512; i++) {
    const v = i / 255.5 - 1;
    PLUT[i] = pack(v < 0 ? mix(base, cyan, Math.min(1, -v) ** 0.8) : mix(base, hot, Math.min(1, v) ** 0.8));
  }
})();
let pScale = 1;

let off = null, offCtx = null, img = null, px = null;
function ensureOffscreen() {
  const w = sim.cols - 2, h = sim.rows - 2;
  if (off && off.width === w && off.height === h) { return; }
  off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  offCtx = off.getContext("2d");
  img = offCtx.createImageData(w, h);
  px = new Uint32Array(img.data.buffer);
}

function draw() {
  ensureOffscreen();
  const { cols, rows, cell, r, g, b, p } = sim;
  const w = cols - 2;
  const [LR, LG, LB] = LUT;
  if (state.pressure) {
    /* Colour scale: 2.5 x the typical (RMS) pressure, smoothed, so
       one spike doesn't wash everything else out. */
    let sq = 0, n = 0;
    for (let c = 0; c < p.length; c++) { if (cell[c] === 0) { sq += p[c] * p[c]; n++; } }
    pScale = Math.max(0.02, pScale * 0.9 + Math.sqrt(sq / Math.max(1, n)) * 2.5 * 0.1);
  }
  for (let j = 1; j < rows - 1; j++) {
    let o = (j - 1) * w;
    for (let i = 1; i < cols - 1; i++, o++) {
      const c = j * cols + i;
      if (cell[c] === SOLID) { px[o] = WALL_PX; continue; }
      if (state.pressure) {
        const v = Math.max(-1, Math.min(1, p[c] / pScale));
        px[o] = PLUT[Math.round((v + 1) * 255.5)];
        continue;
      }
      const ri = Math.min(1023, (r[c] * 256) | 0), gi = Math.min(1023, (g[c] * 256) | 0), bi = Math.min(1023, (b[c] * 256) | 0);
      px[o] = ((255 << 24) | (LB[bi] << 16) | (LG[gi] << 8) | LR[ri]) >>> 0;
    }
  }
  offCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, view.width, view.height);

  if (state.arrows) { drawArrows(); }
  if (sim.inflow) { drawWindMark(); }

  /* Keyboard cursor, only while the stage has focus. */
  if (state.cursor && document.activeElement === stage) {
    const [x, y] = toPx(state.cursor.x, state.cursor.y);
    const rad = Math.max(8, (state.tool === "stir" ? brushR() : wallR()) * view.width / (sim.cols - 2));
    ctx.strokeStyle = state.pen ? C.amber : C.text;
    ctx.lineWidth = 2;
    ctx.setLineDash(state.pen || state.tool === "stir" ? [] : [4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  hud();
}

/* A grid of little arrows: which way and how fast. */
function drawArrows() {
  const gap = Math.max(4, Math.round(Math.min(sim.cols, sim.rows) / 13));
  const cellPx = view.width / (sim.cols - 2);
  const maxLen = gap * cellPx * 0.95;
  const k = cellPx * 0.09 / Math.max(0.3, scale());
  ctx.strokeStyle = "rgba(236, 238, 246, .8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let y = gap / 2 + 1; y < sim.rows - 1; y += gap) {
    for (let x = gap / 2 + 1; x < sim.cols - 1; x += gap) {
      if (sim.cell[(y | 0) * sim.cols + (x | 0)] === SOLID) { continue; }
      const u = sampleU(sim, x, y), v = sampleV(sim, x, y);
      const sp = Math.hypot(u, v);
      const len = Math.min(maxLen, sp * k);
      const [px0, py0] = toPx(x, y);
      if (len < 1.5) { ctx.moveTo(px0 + 1, py0); ctx.arc(px0, py0, 1, 0, Math.PI * 2); continue; }
      const ux = u / sp, uy = v / sp;
      const ex = px0 + ux * len, ey = py0 + uy * len;
      ctx.moveTo(px0, py0);
      ctx.lineTo(ex, ey);
      const hd = Math.min(5, len * 0.45);
      ctx.moveTo(ex - ux * hd - uy * hd * 0.6, ey - uy * hd + ux * hd * 0.6);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex - ux * hd + uy * hd * 0.6, ey - uy * hd - ux * hd * 0.6);
    }
  }
  ctx.stroke();
}

/* Wind preset: small chevrons on the left edge. */
function drawWindMark() {
  ctx.strokeStyle = "rgba(255, 201, 60, .7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 1; k <= 3; k++) {
    const y = (view.height * k) / 4;
    ctx.moveTo(4, y - 6); ctx.lineTo(10, y); ctx.lineTo(4, y + 6);
  }
  ctx.stroke();
}

function hud() {
  $("mode").textContent = PRESET_NAMES[state.preset] + (state.pressure ? " · pressure" : "");
  $("fps").textContent = loop && !loop.paused ? `${state.fps} fps` : "paused";
}

/* ============================================================
   4. INPUT
   ============================================================ */
const brushR = () => Math.max(2, Math.min(sim.cols, sim.rows) * 0.035);
const wallR = () => Math.max(1.2, Math.min(sim.cols, sim.rows) * (state.tool === "erase" ? 0.05 : 0.022));
const toCell = (p) => ({
  x: Math.max(1, Math.min(sim.cols - 1, 1 + (p.x / view.width) * (sim.cols - 2))),
  y: Math.max(1, Math.min(sim.rows - 1, 1 + (p.y / view.height) * (sim.rows - 2)))
});
const toPx = (x, y) => [((x - 1) / (sim.cols - 2)) * view.width, ((y - 1) / (sim.rows - 2)) * view.height];

/* Rainbow: the colour drifts with time; each finger is a third of
   the way round the wheel from the last, so streams differ. */
function inkColor(hueOffset) {
  return state.ink === "rainbow" ? hueColor(state.hue + hueOffset) : COLORS[state.ink];
}

/* Push along a short line, from one point to the next. */
function stir(from, to, vx, vy, hue) {
  const s = scale();
  const max = 160 * s;
  const sp = Math.hypot(vx, vy);
  if (sp > max) { vx *= max / sp; vy *= max / sp; }
  const rad = brushR();
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(len / (rad * 0.6)));
  const col = inkColor(hue);
  for (let k = 1; k <= n; k++) {
    const x = from.x + ((to.x - from.x) * k) / n, y = from.y + ((to.y - from.y) * k) / n;
    splat(sim, x, y, { vx, vy, radius: rad, color: col, dye: 0.45 / Math.sqrt(n), blend: 0.75 });
  }
  state.stirs++;
  if (!loop || loop.paused) { draw(); }
}

function paintTo(from, to) {
  const n = paintWalls(sim, from.x, from.y, to.x, to.y, wallR(), state.tool === "wall");
  if (!loop || loop.paused) { draw(); }
  return n;
}

pointer(stage, {
  down(p) {
    /* kit's pointer() stops the default, so focus by hand: keys work after a tap. */
    stage.focus({ preventScroll: true });
    state.cursor = null;
    const c = toCell(p);
    if (state.tool === "stir") {
      fingers.set(p.id, { x: c.x, y: c.y, time: p.time, hue: (fingerCount++ % 3) / 3 });
      state.streams = Math.max(state.streams, fingers.size);
      splat(sim, c.x, c.y, { radius: brushR(), color: inkColor(fingers.get(p.id).hue), dye: 0.3, blend: 0 });
      state.stirs++;
      if (!loop || loop.paused) { draw(); }
    } else {
      fingers.set(p.id, { x: c.x, y: c.y, time: p.time, hue: 0 });
      paintTo(c, c);
    }
  },
  move(p, held) {
    const f = fingers.get(p.id);
    if (!held || !f) { return; }
    const c = toCell(p);
    if (state.tool === "stir") {
      const dt = Math.max(1 / 120, (p.time - f.time) / 1000);
      stir(f, c, (c.x - f.x) / dt, (c.y - f.y) / dt, f.hue);
    } else {
      paintTo(f, c);
    }
    f.x = c.x; f.y = c.y; f.time = p.time;
  },
  up(p) {
    if (fingers.delete(p.id) && state.tool !== "stir") { persist(); }
    if (!fingers.size) { fingerCount = 0; }
  }
});

/* Keyboard on the focused stage: a cursor that stirs or draws. */
stage.addEventListener("focus", () => {
  if (!state.cursor) { state.cursor = { x: sim.cols / 2, y: sim.rows / 2 }; }
  draw();
});
stage.addEventListener("blur", () => { state.pen = false; if (!loop || loop.paused) { draw(); } });

stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const c = state.cursor || { x: sim.cols / 2, y: sim.rows / 2 };
  const d = (e.shiftKey ? 6 : 2) * Math.max(1, scale());
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (moves[e.key]) {
    const [dx, dy] = moves[e.key];
    const to = {
      x: Math.max(1.5, Math.min(sim.cols - 1.5, c.x + dx * d)),
      y: Math.max(1.5, Math.min(sim.rows - 1.5, c.y + dy * d))
    };
    if (state.tool === "stir") { stir(c, to, dx * 70 * scale(), dy * 70 * scale(), 0); }
    else if (state.pen) { paintTo(c, to); }
    state.cursor = to;
    draw();
  } else if (e.key === " " || e.key === "Enter") {
    state.cursor = c;
    if (state.tool === "stir") {
      splat(sim, c.x, c.y, { radius: brushR() * 1.4, color: inkColor(0), dye: 0.8, blend: 0 });
      state.stirs++;
    } else {
      state.pen = !state.pen;
      if (state.pen) { paintTo(c, c); } else { persist(); }
    }
    draw();
  } else { return; }
  e.preventDefault();
});

const keys = createKeys({
  play: ["KeyP"], ink: ["KeyC"], arrows: ["KeyV"], pressure: ["KeyH"], clearInk: ["KeyI"], clearAll: ["KeyX"],
  t1: ["Digit1", "Numpad1"], t2: ["Digit2", "Numpad2"], t3: ["Digit3", "Numpad3"]
});
keys.on("play", () => loop.toggle());
keys.on("ink", () => setInk(INKS[(INKS.indexOf(state.ink) + 1) % INKS.length]));
keys.on("arrows", () => setToggle("arrows", !state.arrows));
keys.on("pressure", () => setToggle("pressure", !state.pressure));
keys.on("clearInk", () => doClearInk());
keys.on("clearAll", () => doClearAll());
keys.on("t1", () => setTool("stir"));
keys.on("t2", () => setTool("wall"));
keys.on("t3", () => setTool("erase"));

function setTool(t) {
  state.tool = t;
  state.pen = false;
  syncButtons();
  persist();
  draw();
}

function setInk(name) {
  state.ink = name;
  syncButtons();
  $("ink-name").textContent = INK_NAMES[name];
  persist();
}

function setToggle(name, on) {
  state[name] = on;
  syncButtons();
  persist();
  draw();
}

function setPreset(name) {
  state.preset = name;
  applyPreset(sim, name);
  setParams();
  syncButtons();
  persist();
  warmUpIfStill();
  draw();
}

function doClearInk() {
  clearInk(sim);
  draw();
}

function doClearAll() {
  emptyTank(sim);
  setParams();
  state.preset = "none";
  syncButtons();
  persist();
  draw();
}

/* A paused start still shows something: run half a second now. */
function warmUpIfStill() {
  if (loop && loop.paused) { for (let k = 0; k < 40; k++) { step(sim); } }
}

function syncButtons() {
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)); }
  for (const b of document.querySelectorAll("[data-ink]")) { b.setAttribute("aria-pressed", String(b.dataset.ink === state.ink)); }
  for (const b of document.querySelectorAll("[data-preset]")) { b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)); }
  $("arrows").setAttribute("aria-pressed", String(state.arrows));
  $("pressure").setAttribute("aria-pressed", String(state.pressure));
  stage.classList.toggle("is-wall-tool", state.tool !== "stir");
}

for (const b of document.querySelectorAll("[data-tool]")) { b.addEventListener("click", () => setTool(b.dataset.tool)); }
for (const b of document.querySelectorAll("[data-ink]")) { b.addEventListener("click", () => setInk(b.dataset.ink)); }
for (const b of document.querySelectorAll("[data-preset]")) { b.addEventListener("click", () => setPreset(b.dataset.preset)); }
$("arrows").addEventListener("click", () => setToggle("arrows", !state.arrows));
$("pressure").addEventListener("click", () => setToggle("pressure", !state.pressure));
playBtn.addEventListener("click", () => loop.toggle());
$("clear-ink").addEventListener("click", doClearInk);
$("clear-all").addEventListener("click", doClearAll);

/* ---- sliders ---------------------------------------------- */
const SLIDER_TEXT = {
  viscosity: (v) => (v === 0 ? "none" : v <= 2 ? "water" : v <= 5 ? "oil" : v <= 8 ? "syrup" : "honey"),
  fade: (v) => (v === 0 ? "off" : `${v}`),
  swirl: (v) => (v === 0 ? "off" : `${v}`)
};
function syncSliders() {
  for (const k of Object.keys(SLIDER_TEXT)) {
    $(k).value = String(state[k]);
    $(`${k}-out`).textContent = SLIDER_TEXT[k](state[k]);
  }
}
for (const k of Object.keys(SLIDER_TEXT)) {
  $(k).addEventListener("input", (e) => {
    state[k] = Math.round(Number(e.target.value));
    setParams();
    syncSliders();
    persist();
  });
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  Object.assign(state, {
    preset: ok.preset, viscosity: ok.viscosity, fade: ok.fade, swirl: ok.swirl,
    ink: ok.ink, arrows: ok.arrows, pressure: ok.pressure, tool: ok.tool
  });
  if (state.preset === "none") { emptyTank(sim); } else { applyPreset(sim, state.preset); }
  setParams();
  syncButtons();
  syncSliders();
  $("ink-name").textContent = INK_NAMES[state.ink];
  warmUpIfStill();
  draw();
}

/* ============================================================
   GO
   Reduced motion: starts paused (with the flow already going
   in the still picture), and runs at half speed.
   ============================================================ */
let loop = null;
apply(save.get());
/* A head start, so the very first frame already has ink in it. */
for (let k = 0; k < 20; k++) { step(sim); }
loop = startLoop({
  update,
  draw,
  startPaused: calm,
  onPauseChange(paused) {
    playBtn.textContent = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-pressed", String(!paused));
    msg.hidden = !paused;
    hud();
  }
});
if (loop.paused) { warmUpIfStill(); draw(); }
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));
msg.hidden = !loop.paused;

stage.dataset.ready = "true";
