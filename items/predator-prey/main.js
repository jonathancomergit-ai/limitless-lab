/* ============================================================
   Predator & Prey - main script

   The model is in model.js (grass, rabbits, foxes, the
   Lotka-Volterra equations, seeded randomness). This file runs
   the clock, paints the field and the two charts, and listens.

   Sections:
     1. save       the slider settings, Equations mode, speed
     2. state      the run, the equations run
     3. loop       model days (update) + paint (draw)
     4. input      tap the field, keys, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion } from "../../kit/motion.js";
import {
  createSim, step, counts, drop, applySettings, grassShare,
  lvParams, createLV, runLV, lvState, lvLoop, lvBalance,
  DEFAULT_SETTINGS, LIMITS, PRESETS, SIZE, GRID
} from "./model.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");

const DAYS_PER_SECOND = 15;      // at speed 1x
const SPEEDS = [1, 2, 4];
const MAX_STEPS_PER_FRAME = 6;
const WINDOW = 400;              // days shown on the time chart
const DROP = { rabbit: 6, fox: 2 };

/* ============================================================
   1. SAVE
   ============================================================ */
const SLIDERS = {
  rabbitBirth:  { out: (v) => `${v}%/day` },
  foxBirth:     { out: (v) => `${v}%/day` },
  rabbitHunger: { out: (v) => `${v} days` },
  foxHunger:    { out: (v) => `${v} days` },
  regrow:       { out: (v) => `${v} days` }
};
const DEFAULTS = { ...DEFAULT_SETTINGS, equations: false, speed: 1 };

function validate(d) {
  for (const k of Object.keys(SLIDERS)) {
    const lim = LIMITS[k];
    if (!Number.isInteger(d[k]) || d[k] < lim.min || d[k] > lim.max) { return `The ${k} setting in that save is out of range.`; }
  }
  if (typeof d.equations !== "boolean") { return "Equations mode in that save should be true or false."; }
  if (!SPEEDS.includes(d.speed)) { return "The speed in that save should be 1, 2 or 4."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply({ ...DEFAULTS })
});

function store() { save.set({ ...settings, equations, speed }); }

/* ============================================================
   2. STATE
   ============================================================ */
let settings = { ...DEFAULT_SETTINGS };
let equations = false;
let speed = 1;
let seed = PRESETS.steady.seed;
let start = { rabbits: PRESETS.steady.rabbits, foxes: PRESETS.steady.foxes };
let preset = "steady";
let sim = createSim({ settings, ...start, seed });
let lv = null;                 // the equations run, started from the agents' numbers
let lvFrom = 0;                // the day it started
let loopPts = null;            // one full equations loop, for the phase plot
let clock = 0;
let loop = null;
let drops = 0;
let dropKind = "rabbit";

exposeForTests({
  get day() { return sim.t; },
  get counts() { const c = counts(sim); return { rabbits: c.rabbits, foxes: c.foxes, grass: c.grass }; },
  get running() { return Boolean(loop) && !loop.paused; },
  get settings() { return { ...sim.settings }; },
  get equations() { return lv ? { day: lvFrom + lv.t, ...lvState(lv), points: lv.history.length } : null; },
  get preset() { return preset; },
  get speed() { return speed; },
  get drops() { return drops; },
  /* The middle of the field in page coordinates, for the smoke test. */
  fieldPoint() {
    const { field } = areas();
    const r = stage.getBoundingClientRect();
    return { x: r.left + field.x + field.w * 0.5, y: r.top + field.y + field.h * 0.5 };
  }
});

function newRun() {
  sim = createSim({ settings, ...start, seed });
  clock = 0;
  restartEquations();
  lastHud = "";
  draw();
}

/* The equations always start from the agents' numbers today. */
function restartEquations() {
  if (!equations) { lv = null; loopPts = null; return; }
  const c = counts(sim);
  const p = lvParams(settings);
  const R = Math.max(1, c.rabbits), F = Math.max(1, c.foxes);
  lv = createLV(p, R, F);
  lvFrom = sim.t;
  lv.history.push({ t: 0, rabbits: R, foxes: F });
  loopPts = lvLoop(p, R, F);
}

/* ============================================================
   3. LOOP
   ============================================================ */
function update(dt) {
  clock += dt * DAYS_PER_SECOND * speed;
  const n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(clock));
  clock = Math.min(clock - n, 1);
  for (let k = 0; k < n; k++) {
    step(sim);
    if (lv) { runLV(lv, 1); }
  }
}

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), lineB: color("--line-bright"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"), amber: color("--amber"),
  grass: color("--green"), rabbit: color("--cyan"), fox: "#FF8A3D",
  grassOn: "#16452F", grassOff: "#1A1712"
};
const MONO = "600 11px 'JetBrains Mono', monospace";

/* Where things go: the field + the time chart + the loop plot.
   Wide: field on the left, charts stacked on the right.
   Tall (phones): field on top, the two charts side by side. */
function areas() {
  const w = view.width, h = view.height, pad = 10, top = 44, label = 16;
  if (w > h * 1.15) {
    const side = Math.max(60, Math.min(h - top - pad, w * 0.5));
    const rx = side + pad * 3, rw = Math.max(60, w - rx - pad);
    const chartH = Math.max(40, (h - top - pad) * 0.55 - label);
    return {
      field: { x: pad, y: top, w: side, h: side },
      chart: { x: rx, y: top, w: rw, h: chartH },
      phase: { x: rx, y: top + chartH + label + 10, w: rw, h: Math.max(40, h - top - chartH - label - 10 - pad - label) }
    };
  }
  const fieldH = Math.max(60, Math.min(w - pad * 2, (h - top) * 0.58));
  const fieldW = Math.min(w - pad * 2, fieldH);
  const cy = top + fieldH + 10;
  const ch = Math.max(40, h - cy - pad - label);
  const cw = Math.max(40, (w - pad * 3) * 0.6);
  return {
    field: { x: (w - fieldW) / 2, y: top, w: fieldW, h: fieldH },
    chart: { x: pad, y: cy, w: cw, h: ch },
    phase: { x: pad * 2 + cw, y: cy, w: Math.max(40, w - pad * 3 - cw), h: ch }
  };
}

function draw() {
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);
  const { field, chart, phase } = areas();
  drawField(field);
  drawChart(chart);
  drawPhase(phase);
  hud();
}

/* ---- the field: grass patches, rabbits, foxes ---- */
function drawField(f) {
  ctx.fillStyle = C.grassOff;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  const cw = f.w / GRID, chh = f.h / GRID;
  ctx.fillStyle = C.grassOn;
  ctx.beginPath();
  for (let k = 0; k < sim.grass.length; k++) {
    if (sim.grass[k]) { ctx.rect(f.x + (k % GRID) * cw, f.y + Math.floor(k / GRID) * chh, cw + 0.5, chh + 0.5); }
  }
  ctx.fill();

  const sx = f.w / SIZE, sy = f.h / SIZE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();

  /* Rabbits: a round body and two ears pointing where it's going. */
  const r = Math.max(1.5, 0.55 * sx);
  ctx.fillStyle = C.rabbit;
  ctx.strokeStyle = C.rabbit;
  ctx.lineWidth = Math.max(1, r * 0.45);
  ctx.lineCap = "round";
  const body = new Path2D(), ears = new Path2D();
  for (const a of sim.rabbits) {
    const x = f.x + a.x * sx, y = f.y + a.y * sy;
    body.moveTo(x + r, y);
    body.arc(x, y, r, 0, Math.PI * 2);
    for (const side of [-0.45, 0.45]) {
      const ec = Math.cos(a.heading + side), es = Math.sin(a.heading + side);
      ears.moveTo(x + ec * r * 0.6, y + es * r * 0.6);
      ears.lineTo(x + ec * r * 2.3, y + es * r * 2.3);
    }
  }
  ctx.fill(body);
  ctx.stroke(ears);

  /* Foxes: a pointed triangle (the nose leads) with a dark outline. */
  const L = Math.max(6, 2.6 * sx);
  const fox = new Path2D();
  for (const a of sim.foxes) {
    const x = f.x + a.x * sx, y = f.y + a.y * sy;
    const c = Math.cos(a.heading), s = Math.sin(a.heading);
    fox.moveTo(x + c * L * 0.6, y + s * L * 0.6);
    fox.lineTo(x - c * L * 0.4 - s * L * 0.38, y - s * L * 0.4 + c * L * 0.38);
    fox.lineTo(x - c * L * 0.4 + s * L * 0.38, y - s * L * 0.4 - c * L * 0.38);
    fox.closePath();
  }
  ctx.fillStyle = C.fox;
  ctx.fill(fox);
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 1;
  ctx.stroke(fox);
  ctx.restore();

  ctx.strokeStyle = C.lineB;
  ctx.lineWidth = 1;
  ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);

  const gone = goneText();
  if (gone) {
    ctx.font = "700 13px 'Space Grotesk', system-ui, sans-serif";
    const tw = ctx.measureText(gone).width;
    ctx.fillStyle = "rgba(7, 7, 12, .78)";
    ctx.fillRect(f.x + 6, f.y + 6, tw + 14, 24);
    ctx.fillStyle = C.amber;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(gone, f.x + 13, f.y + 18);
  }
}

function goneText() {
  const R = sim.rabbits.length, F = sim.foxes.length;
  if (!R && !F) { return "Everyone's gone"; }
  if (!F) { return "Foxes died out"; }
  if (!R) { return "Rabbits are gone"; }
  return "";
}

/* A round number at or above v, for chart scales. */
function niceMax(v) {
  if (v <= 10) { return 10; }
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) { if (m * p >= v) { return m * p; } }
  return v;
}

/* ---- the time chart: grass (shaded), rabbits (left scale),
        foxes (right scale), equations dashed ---- */
function drawChart(ch) {
  const t1 = Math.max(WINDOW, sim.t), t0 = t1 - WINDOW;
  const hist = sim.history.filter((h) => h.t >= t0);
  const lvHist = lv ? lv.history.filter((h) => lvFrom + h.t >= t0) : [];
  const maxR = niceMax(Math.max(1, ...hist.map((h) => h.rabbits)));
  const maxF = niceMax(Math.max(1, ...hist.map((h) => h.foxes)));
  const X = (t) => ch.x + ((t - t0) / WINDOW) * ch.w;
  const Y = (v, max) => ch.y + ch.h - Math.min(1.04, v / max) * ch.h;

  ctx.fillStyle = C.bg;
  ctx.fillRect(ch.x, ch.y, ch.w, ch.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ch.x, ch.y, ch.w, ch.h);
  ctx.clip();

  if (hist.length > 1) {
    /* Grass: share of the field, as a soft area. */
    ctx.beginPath();
    ctx.moveTo(X(hist[0].t), ch.y + ch.h);
    for (const h of hist) { ctx.lineTo(X(h.t), Y(h.grass, 1)); }
    ctx.lineTo(X(hist[hist.length - 1].t), ch.y + ch.h);
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = C.grass;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const line = (pts, key, max, col, dashed, off = 0) => {
    if (pts.length < 2) { return; }
    ctx.strokeStyle = col;
    ctx.lineWidth = dashed ? 1.5 : 2;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    pts.forEach((h, k) => { const x = X(off + h.t), y = Y(h[key], max); if (k) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); } });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line(lvHist, "rabbits", maxR, C.rabbit, true, lvFrom);
  line(lvHist, "foxes", maxF, C.fox, true, lvFrom);
  line(hist, "rabbits", maxR, C.rabbit, false);
  line(hist, "foxes", maxF, C.fox, false);
  ctx.restore();

  ctx.strokeStyle = C.lineB;
  ctx.lineWidth = 1;
  ctx.strokeRect(ch.x + 0.5, ch.y + 0.5, ch.w - 1, ch.h - 1);

  /* Scales: rabbits top-left, foxes top-right, days underneath. */
  ctx.font = MONO;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = C.rabbit;
  ctx.fillText(`${maxR}`, ch.x + 4, ch.y + 3);
  ctx.textAlign = "right";
  ctx.fillStyle = C.fox;
  ctx.fillText(`${maxF}`, ch.x + ch.w - 4, ch.y + 3);
  ctx.fillStyle = C.dim;
  ctx.fillText(`day ${Math.round(t1)}`, ch.x + ch.w, ch.y + ch.h + 3);
  ctx.textAlign = "left";
  ctx.fillText(lv ? "- - maths" : `day ${Math.round(t0)}`, ch.x, ch.y + ch.h + 3);
}

/* ---- the loop plot: rabbits across, foxes up ---- */
function drawPhase(ph) {
  const hist = sim.history.slice(-WINDOW * 2);
  let maxR = Math.max(1, ...hist.map((h) => h.rabbits));
  let maxF = Math.max(1, ...hist.map((h) => h.foxes));
  if (loopPts) {
    maxR = Math.max(maxR, Math.min(maxR * 3, Math.max(...loopPts.map((q) => q.R))));
    maxF = Math.max(maxF, Math.min(maxF * 3, Math.max(...loopPts.map((q) => q.F))));
  }
  maxR = niceMax(maxR);
  maxF = niceMax(maxF);
  const X = (v) => ph.x + (v / maxR) * ph.w;
  const Y = (v) => ph.y + ph.h - (v / maxF) * ph.h;

  ctx.fillStyle = C.bg;
  ctx.fillRect(ph.x, ph.y, ph.w, ph.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ph.x, ph.y, ph.w, ph.h);
  ctx.clip();

  if (loopPts) {
    ctx.strokeStyle = C.text;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    loopPts.forEach((q, k) => { if (k) { ctx.lineTo(X(q.R), Y(q.F)); } else { ctx.moveTo(X(q.R), Y(q.F)); } });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const bal = lvBalance(lv.p);
    ctx.fillStyle = C.text;
    ctx.fillRect(X(bal.R) - 2, Y(bal.F) - 2, 4, 4);
  }

  /* The trail: older days fade out, in a few batches. */
  const parts = 8;
  const per = Math.ceil(hist.length / parts);
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 1.5;
  for (let p = 0; p < parts; p++) {
    const seg = hist.slice(p * per, (p + 1) * per + 1);
    if (seg.length < 2) { continue; }
    ctx.globalAlpha = 0.15 + (0.85 * (p + 1)) / parts;
    ctx.beginPath();
    seg.forEach((h, k) => { if (k) { ctx.lineTo(X(h.rabbits), Y(h.foxes)); } else { ctx.moveTo(X(h.rabbits), Y(h.foxes)); } });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const now = hist[hist.length - 1];
  if (now) {
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.arc(X(now.rabbits), Y(now.foxes), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = C.lineB;
  ctx.lineWidth = 1;
  ctx.strokeRect(ph.x + 0.5, ph.y + 0.5, ph.w - 1, ph.h - 1);
  ctx.font = MONO;
  ctx.textBaseline = "top";
  ctx.textAlign = "right";
  ctx.fillStyle = C.rabbit;
  ctx.fillText(`rabbits ${maxR}`, ph.x + ph.w, ph.y + ph.h + 3);
  ctx.textAlign = "left";
  ctx.fillStyle = C.fox;
  ctx.fillText(`foxes ${maxF}`, ph.x + 4, ph.y + 3);
}

let lastHud = "";
function hud() {
  const R = sim.rabbits.length, F = sim.foxes.length, G = Math.round(grassShare(sim) * 100);
  const sig = `${sim.t}|${R}|${F}|${G}`;
  if (sig === lastHud) { return; }
  lastHud = sig;
  $("day").textContent = String(sim.t);
  $("hud-rabbits").textContent = String(R);
  $("hud-foxes").textContent = String(F);
  $("n-grass").textContent = `${G}%`;
  $("n-rabbits").textContent = String(R);
  $("n-foxes").textContent = String(F);
  const status = goneText() || "Both living";
  if ($("status").textContent !== status) { $("status").textContent = status; }
}

/* ============================================================
   4. INPUT
   ============================================================ */
pointer(stage, {
  down(p) {
    const { field } = areas();
    if (p.x < field.x || p.y < field.y || p.x > field.x + field.w || p.y > field.y + field.h) { return; }
    dropAt(((p.x - field.x) / field.w) * SIZE, ((p.y - field.y) / field.h) * SIZE, dropKind);
  }
});

function dropAt(x, y, kind) {
  if (drop(sim, kind, x, y, DROP[kind]) > 0) { drops++; draw(); }
}

function dropRandom(kind) {
  dropAt(Math.random() * SIZE, Math.random() * SIZE, kind);
}

function setDropKind(kind) {
  dropKind = kind;
  $("drop-rabbit").setAttribute("aria-pressed", String(kind === "rabbit"));
  $("drop-fox").setAttribute("aria-pressed", String(kind === "fox"));
}

function setEquations(on) {
  equations = on;
  $("equations").setAttribute("aria-pressed", String(on));
  restartEquations();
  draw();
}

function setSpeed(v) {
  speed = v;
  const b = $("speed");
  b.textContent = `Speed ${v}×`;
  b.setAttribute("aria-label", `Speed: ${v} times`);
}

function cycleSpeed() {
  setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  store();
}

function markPreset(name) {
  preset = name;
  for (const b of document.querySelectorAll("[data-preset]")) {
    b.setAttribute("aria-pressed", String(b.dataset.preset === name));
  }
}

function usePreset(name) {
  const P = PRESETS[name];
  settings = { ...P.settings };
  start = { rabbits: P.rabbits, foxes: P.foxes };
  seed = P.seed;
  for (const key of Object.keys(SLIDERS)) { syncSlider(key); }
  markPreset(name);
  newRun();
  store();
}

function doNewRun() {
  seed = (seed * 7919 + 13) % 100003;
  newRun();
}

const keys = createKeys({
  play: ["KeyP"], fresh: ["KeyN"], speed: ["KeyS"], eq: ["KeyE"],
  rabbit: ["KeyR"], fox: ["KeyF"], p1: ["Digit1"], p2: ["Digit2"], p3: ["Digit3"]
});
keys.on("play", () => loop.toggle());
keys.on("fresh", doNewRun);
keys.on("speed", cycleSpeed);
keys.on("eq", () => { setEquations(!equations); store(); });
keys.on("rabbit", () => dropRandom("rabbit"));
keys.on("fox", () => dropRandom("fox"));
keys.on("p1", () => usePreset("steady"));
keys.on("p2", () => usePreset("foxes-die"));
keys.on("p3", () => usePreset("crash"));

playBtn.addEventListener("click", () => loop.toggle());
$("restart").addEventListener("click", doNewRun);
$("speed").addEventListener("click", cycleSpeed);
$("equations").addEventListener("click", () => { setEquations(!equations); store(); });
$("drop-rabbit").addEventListener("click", () => setDropKind("rabbit"));
$("drop-fox").addEventListener("click", () => setDropKind("fox"));
for (const b of document.querySelectorAll("[data-preset]")) {
  b.addEventListener("click", () => usePreset(b.dataset.preset));
}

for (const key of Object.keys(SLIDERS)) {
  const input = $(key);
  input.addEventListener("input", () => {
    settings[key] = Math.round(Number(input.value));
    syncSlider(key);
    applySettings(sim, { [key]: settings[key] });
    markPreset(matchingPreset());
    restartEquations();
    draw();
  });
  input.addEventListener("change", store);
}

function syncSlider(key) {
  $(key).value = String(settings[key]);
  $(`${key}-out`).textContent = SLIDERS[key].out(settings[key]);
}

function matchingPreset() {
  for (const [name, P] of Object.entries(PRESETS)) {
    if (Object.keys(SLIDERS).every((k) => P.settings[k] === settings[k])) { return name; }
  }
  return "";
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true;
  const s = ok ? { ...DEFAULTS, ...d } : { ...DEFAULTS };
  settings = {};
  for (const key of Object.keys(SLIDERS)) { settings[key] = s[key]; syncSlider(key); }
  const name = matchingPreset();
  const P = PRESETS[name || "steady"];
  start = { rabbits: P.rabbits, foxes: P.foxes };
  seed = P.seed;
  markPreset(name);
  setSpeed(s.speed);
  equations = s.equations;
  $("equations").setAttribute("aria-pressed", String(equations));
  newRun();
}

/* ============================================================
   GO
   Lab rule: with reduced motion it starts paused, with a Play
   button. Nothing else flashes or shakes.
   ============================================================ */
apply(save.get());
loop = startLoop({
  update,
  draw,
  startPaused: reducedMotion(),
  onPauseChange(paused) {
    playBtn.textContent = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-pressed", String(!paused));
  }
});
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));

stage.dataset.ready = "true";
