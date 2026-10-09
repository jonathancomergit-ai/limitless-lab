/* ============================================================
   Sorting Race - main script

   The sorts are in sorts.js, as step-by-step generators. This
   file gives every lane the same bars, ticks them all at the
   same rate, paints, and (if you want) plays the sound.

   Sections:
     1. save       lanes, order, bars, speed, sound
     2. state      the lanes and the race clock
     3. sound      Web Audio blips (off until you turn it on)
     4. draw       lanes, bars, highlights, scores
     5. input      buttons, menus, sliders, keys
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import { createLane, tick, makeBars, ALGOS, ALGO_NAMES, ORDERS } from "./sorts.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const runBtn = $("run");
const soundBtn = $("sound");

const SPEEDS = [15, 30, 60, 120, 250, 500, 1000, 2000];   // moves per second
const MAX_MOVES_PER_FRAME = 60;
let calm = reducedMotion();

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = {
  picks: ["bubble", "insertion", "merge", "quick"], count: 4,
  order: "random", n: 40, speed: calm ? 2 : 4, sound: false
};

function validate(d) {
  if (!Array.isArray(d.picks) || d.picks.length !== 4 || !d.picks.every((a) => ALGOS.includes(a))) { return "The sorts in that save are broken."; }
  if (!Number.isInteger(d.count) || d.count < 2 || d.count > 4) { return "Lanes must be 2 to 4."; }
  if (!ORDERS.includes(d.order)) { return "Unknown starting order in that save."; }
  if (!Number.isInteger(d.n) || d.n < 10 || d.n > 120) { return "Bars must be 10 to 120."; }
  if (!Number.isInteger(d.speed) || d.speed < 1 || d.speed > SPEEDS.length) { return "The speed in that save is out of range."; }
  if (typeof d.sound !== "boolean") { return "The sound setting in that save is broken."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

function persist() {
  save.set({ picks: settings.picks.slice(), count: settings.count, order: settings.order, n: settings.n, speed: settings.speed, sound: settings.sound });
}

/* ============================================================
   2. STATE
   ============================================================ */
let settings = structuredClone(DEFAULTS);
let seed = 1;
let bars = makeBars(settings.n, settings.order, seed);
let lanes = [];
let racing = false;
let clock = 0;
let races = 0;

function resetLanes() {
  lanes = settings.picks.slice(0, settings.count).map((algo) => ({ ...createLane(algo, bars), place: null }));
  racing = false;
  clock = 0;
  syncRun();
  dirty = true;
}

function newBars() {
  seed = (seed * 16807) % 2147483647;
  bars = makeBars(settings.n, settings.order, seed);
  resetLanes();
}

exposeForTests({
  get lanes() { return lanes.map((l) => ({ algo: l.algo, compares: l.compares, swaps: l.swaps, done: l.done, place: l.place })); },
  get racing() { return racing; },
  get races() { return races; },
  get n() { return bars.length; },
  get sound() { return settings.sound; }
});

function update(dt) {
  if (!racing) { return; }
  clock += dt * SPEEDS[settings.speed - 1];
  const n = Math.min(MAX_MOVES_PER_FRAME, Math.floor(clock));
  clock -= n;
  if (n > 0) { dirty = true; }
  for (let k = 0; k < n; k++) {
    for (const lane of lanes) {
      if (lane.done) { continue; }
      if (!tick(lane)) {
        /* Ties (same number of moves) share a place. */
        lane.place = lanes.filter((l) => l.done && l.moves < lane.moves).length + 1;
      }
    }
  }
  if (lanes.every((l) => l.done)) {
    racing = false;
    syncRun();
  }
  if (n > 0) { blip(); }
}

/* ============================================================
   3. SOUND
   Web Audio, made on this device: no files, nothing downloaded.
   Pitch follows the height of the bar each lane just touched.
   ============================================================ */
let audio = null;
let lastBlip = 0;

function ensureAudio() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return null; }
    audio = new AC();
  }
  if (audio.state === "suspended") { audio.resume(); }
  return audio;
}

function blip() {
  if (!settings.sound || !audio || audio.state !== "running") { return; }
  const now = audio.currentTime;
  if (now - lastBlip < 0.045) { return; }
  lastBlip = now;
  for (const lane of lanes) {
    if (!lane.last) { continue; }
    const v = lane.a[lane.last.i] / bars.length;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = 180 + 900 * v;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06 / lanes.length, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}

/* ============================================================
   4. DRAW
   ============================================================ */
const view = createCanvas(stage, { onResize: () => { dirty = true; draw(); } });
const ctx = view.ctx;
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), line: color("--line"), text: color("--text"), dim: color("--text-dim"),
  bar: "#4A5175", cyan: color("--cyan"), amber: color("--amber"), hot: color("--hot"), green: color("--green")
};
let dirty = true;

function draw() {
  if (!dirty) { return; }
  dirty = false;
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);
  const laneH = view.height / Math.max(1, lanes.length);
  lanes.forEach((lane, k) => drawLane(lane, 0, k * laneH, view.width, laneH));
  scores();
}

function drawLane(lane, x0, y0, w, h) {
  const head = 22, pad = 8, foot = calm ? 7 : 3;
  const n = lane.a.length;
  const bw = (w - pad * 2) / n;
  const maxH = h - head - pad - foot;

  if (y0 > 0) {
    ctx.fillStyle = C.line;
    ctx.fillRect(0, y0, w, 1);
  }

  /* The label: name, counters, place. */
  ctx.font = "700 13px 'Space Grotesk', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = lane.done ? C.green : C.text;
  ctx.fillText(ALGO_NAMES[lane.algo], x0 + pad, y0 + 13);
  const nameW = ctx.measureText(ALGO_NAMES[lane.algo]).width;
  ctx.font = "500 11px 'JetBrains Mono', monospace";
  ctx.fillStyle = C.dim;
  const counts = `${lane.compares} cmp · ${lane.swaps} swp`;
  ctx.fillText(counts, x0 + pad + nameW + 10, y0 + 13);
  if (lane.place) {
    ctx.textAlign = "right";
    ctx.fillStyle = C.amber;
    ctx.font = "700 12px 'JetBrains Mono', monospace";
    ctx.fillText(["1st", "2nd", "3rd", "4th"][lane.place - 1], x0 + w - pad, y0 + 13);
  }

  /* The bars. While racing, the two it's looking at light up:
     amber for a compare, pink for a swap. Reduced motion: no
     flashing colours, just a small mark under each one. */
  const m = lane.last;
  const lit = m ? new Set([m.i, m.j]) : new Set();
  const base = y0 + h - pad - foot;
  for (let i = 0; i < n; i++) {
    const v = lane.a[i] / bars.length;
    const bh = Math.max(2, v * maxH);
    let col = lane.done ? C.cyan : C.bar;
    if (!calm && !lane.done && lit.has(i)) { col = m.op === "compare" ? C.amber : C.hot; }
    ctx.fillStyle = col;
    ctx.fillRect(x0 + pad + i * bw + (bw > 4 ? 0.5 : 0), base - bh, Math.max(1, bw - (bw > 4 ? 1 : 0)), bh);
  }
  if (calm && m && !lane.done) {
    ctx.fillStyle = C.dim;
    for (const i of lit) { if (i !== undefined) { ctx.fillRect(x0 + pad + i * bw, base + 2, Math.max(2, bw - 1), 4); } }
  }
}

/* The score list under the stage (for screen readers too). */
let lastScores = "";
function scores() {
  const text = lanes.map((l) => `${l.algo}|${l.compares}|${l.swaps}|${l.place}`).join(",");
  if (text === lastScores) { return; }
  lastScores = text;
  const ol = $("scores");
  ol.replaceChildren(...lanes.map((l) => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = ALGO_NAMES[l.algo];
    const c = document.createElement("span");
    c.textContent = `${l.compares} compares`;
    const s = document.createElement("span");
    s.textContent = `${l.swaps} ${l.algo === "merge" ? "writes" : "swaps"}`;
    const p = document.createElement("span");
    p.className = "sr-place";
    p.textContent = l.place ? ["1st", "2nd", "3rd", "4th"][l.place - 1] : l.done ? "done" : "";
    li.append(name, c, s, p);
    return li;
  }));
}

/* ============================================================
   5. INPUT
   ============================================================ */
function syncRun() {
  const allDone = lanes.length && lanes.every((l) => l.done);
  runBtn.textContent = racing ? "Pause" : allDone ? "Race again" : lanes.some((l) => l.moves) ? "Resume" : "Race!";
}

function toggleRace() {
  if (settings.sound) { ensureAudio(); }
  if (lanes.every((l) => l.done)) { resetLanes(); }
  racing = !racing;
  if (racing) { races++; }
  syncRun();
  dirty = true;
}

function setSound(on) {
  settings.sound = on;
  if (on) { ensureAudio(); }
  soundBtn.textContent = on ? "Sound: on" : "Sound: off";
  soundBtn.setAttribute("aria-pressed", String(on));
  persist();
}

function setCount(c) {
  settings.count = c;
  for (const b of document.querySelectorAll("[data-count]")) { b.setAttribute("aria-pressed", String(Number(b.dataset.count) === c)); }
  for (const l of document.querySelectorAll(".sr-pick")) { l.hidden = Number(l.dataset.lane) >= c; }
  resetLanes();
  persist();
}

function setOrder(o) {
  settings.order = o;
  for (const b of document.querySelectorAll("[data-order]")) { b.setAttribute("aria-pressed", String(b.dataset.order === o)); }
  bars = makeBars(settings.n, o, seed);
  resetLanes();
  persist();
}

/* Fill the four menus. */
for (let k = 0; k < 4; k++) {
  const sel = $(`lane${k}`);
  for (const a of ALGOS) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = ALGO_NAMES[a];
    sel.append(opt);
  }
  sel.addEventListener("change", () => {
    settings.picks[k] = sel.value;
    resetLanes();
    persist();
  });
}

runBtn.addEventListener("click", toggleRace);
$("shuffle").addEventListener("click", newBars);
soundBtn.addEventListener("click", () => setSound(!settings.sound));
for (const b of document.querySelectorAll("[data-count]")) { b.addEventListener("click", () => setCount(Number(b.dataset.count))); }
for (const b of document.querySelectorAll("[data-order]")) { b.addEventListener("click", () => setOrder(b.dataset.order)); }

$("n").addEventListener("input", (e) => {
  settings.n = Math.round(Number(e.target.value));
  $("n-out").textContent = String(settings.n);
  bars = makeBars(settings.n, settings.order, seed);
  resetLanes();
});
$("n").addEventListener("change", persist);
$("speed").addEventListener("input", (e) => {
  settings.speed = Math.round(Number(e.target.value));
  $("speed-out").textContent = `${SPEEDS[settings.speed - 1]} moves/s`;
});
$("speed").addEventListener("change", persist);

const keys = createKeys({ race: ["KeyR"], fresh: ["KeyN"], mute: ["KeyM"], two: ["Digit2"], three: ["Digit3"], four: ["Digit4"] });
keys.on("race", toggleRace);
keys.on("fresh", newBars);
keys.on("mute", () => setSound(!settings.sound));
keys.on("two", () => setCount(2));
keys.on("three", () => setCount(3));
keys.on("four", () => setCount(4));

onMotionChange((v) => { calm = v; dirty = true; draw(); });

/* Load a whole save (start, import, delete). */
function apply(d) {
  settings = validate(d) === true ? structuredClone(d) : structuredClone(DEFAULTS);
  for (let k = 0; k < 4; k++) { $(`lane${k}`).value = settings.picks[k]; }
  $("n").value = String(settings.n);
  $("n-out").textContent = String(settings.n);
  $("speed").value = String(settings.speed);
  $("speed-out").textContent = `${SPEEDS[settings.speed - 1]} moves/s`;
  /* Sound stays off until you tap something (browsers insist). */
  soundBtn.textContent = settings.sound ? "Sound: on" : "Sound: off";
  soundBtn.setAttribute("aria-pressed", String(settings.sound));
  for (const b of document.querySelectorAll("[data-order]")) { b.setAttribute("aria-pressed", String(b.dataset.order === settings.order)); }
  for (const b of document.querySelectorAll("[data-count]")) { b.setAttribute("aria-pressed", String(Number(b.dataset.count) === settings.count)); }
  for (const l of document.querySelectorAll(".sr-pick")) { l.hidden = Number(l.dataset.lane) >= settings.count; }
  bars = makeBars(settings.n, settings.order, seed);
  resetLanes();
}

/* ============================================================
   GO
   Nothing moves until you press Race!. Reduced motion: no
   flashing colours on the bars, and a slower default speed.
   ============================================================ */
apply(save.get());
startLoop({ update, draw });

stage.dataset.ready = "true";
