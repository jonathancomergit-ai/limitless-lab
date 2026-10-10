/* ============================================================
   Epidemic Sim - main script

   The model is in model.js (dots, spread, seeded randomness).
   This file runs the clock, paints the dots and the chart,
   and listens.

   Sections:
     1. save       the slider settings
     2. state      the run, the "compare" curve
     3. loop       model steps (update) + paint (draw)
     4. input      tap a dot, keys, buttons, sliders
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  createSim, step, counts, applySettings, infect, infectNear, DEFAULT_SETTINGS, SIZE, DT, S, I, R, V
} from "./model.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");

const DAYS_PER_SECOND = 4;
const MAX_STEPS_PER_FRAME = 6;
const FIRST_SICK = 3;
let calm = reducedMotion();

/* ============================================================
   1. SAVE
   ============================================================ */
const SLIDERS = {
  n:          { min: 100, max: 1000, out: (v) => String(v) },
  chance:     { min: 0, max: 100, out: (v) => `${v}%` },
  days:       { min: 2, max: 21, out: (v) => String(v) },
  vaccinated: { min: 0, max: 100, out: (v) => `${v}%` },
  masked:     { min: 0, max: 100, out: (v) => `${v}%` },
  distancing: { min: 0, max: 100, out: (v) => `${v}%` }
};
const DEFAULTS = { ...DEFAULT_SETTINGS };

function validate(d) {
  for (const [k, s] of Object.entries(SLIDERS)) {
    if (!Number.isInteger(d[k]) || d[k] < s.min || d[k] > s.max) { return `The ${k} setting in that save is out of range.`; }
  }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply({ ...DEFAULTS })
});

/* ============================================================
   2. STATE
   ============================================================ */
let settings = { ...DEFAULTS };
let seed = 1;
let sim = createSim(settings, seed, FIRST_SICK);
let ghost = null;          // the compared run: { history, peak }
let clock = 0;
let loop = null;
let taps = 0;

exposeForTests({
  get day() { return sim.t; },
  get sick() { return counts(sim).sick; },
  get counts() { return counts(sim); },
  get peak() { return { ...sim.peak }; },
  get ghost() { return ghost ? { peak: ghost.peak.sick, points: ghost.history.length } : null; },
  get settings() { return { ...sim.settings }; },
  get running() { return Boolean(loop) && !loop.paused; },
  get done() { return sim.done; },
  get taps() { return taps; },
  /* Screen point (page coordinates) of a healthy dot, for the smoke test. */
  healthyDot() {
    const k = sim.dots.findIndex((d) => d.state === S);
    if (k < 0) { return null; }
    const [x, y] = dotScreen(k);
    const r = stage.getBoundingClientRect();
    return { x: r.left + x, y: r.top + y };
  }
});

function newRun(sameSeed = false) {
  if (!sameSeed) { seed = (seed * 7919 + 13) % 100003; }
  sim = createSim(settings, seed, FIRST_SICK);
  clock = 0;
  draw();
}

/* ============================================================
   3. LOOP
   ============================================================ */
function update(dt) {
  clock += (dt * DAYS_PER_SECOND) / DT;
  const n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(clock));
  clock = Math.min(clock - n, 1);
  for (let k = 0; k < n; k++) { step(sim); }
}

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), line: color("--line"), lineB: color("--line-bright"),
  text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"), amber: color("--amber"),
  healthy: color("--cyan"), sick: color("--hot"), recovered: "#9AA1BC", vaccinated: color("--green")
};
const STATE_COLOR = [C.healthy, C.sick, C.recovered, C.vaccinated];

/* Where things go: dots box + chart. Side by side when wide,
   stacked when tall (phones). The HUD sits over the top edge. */
function areas() {
  const w = view.width, h = view.height, pad = 10, top = 44;
  if (w > h * 1.25) {
    const side = Math.max(40, Math.min(h - top - pad, w * 0.45));
    return {
      box: { x: pad, y: top, w: side, h: side },
      chart: { x: side + pad * 3, y: top, w: Math.max(40, w - side - pad * 4), h: Math.max(40, h - top - pad - 16) }
    };
  }
  const boxH = Math.max(40, Math.min(w - pad * 2, (h - top) * 0.56));
  return {
    box: { x: pad, y: top, w: Math.max(40, w - pad * 2), h: boxH },
    chart: { x: pad, y: top + boxH + 14, w: Math.max(40, w - pad * 2), h: Math.max(40, h - top - boxH - 14 - pad - 16) }
  };
}

/* Reduced motion shows the dots as a still grid of squares. */
function gridShape(n, box) {
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * box.w) / box.h)));
  const rows = Math.ceil(n / cols);
  return { cols, rows, cw: box.w / cols, ch: box.h / rows };
}

function dotScreen(k) {
  const { box } = areas();
  if (calm) {
    const g = gridShape(sim.dots.length, box);
    return [box.x + ((k % g.cols) + 0.5) * g.cw, box.y + (Math.floor(k / g.cols) + 0.5) * g.ch];
  }
  const d = sim.dots[k];
  return [box.x + (d.x / SIZE) * box.w, box.y + (d.y / SIZE) * box.h];
}

function draw() {
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);
  const { box, chart } = areas();
  drawBox(box);
  drawChart(chart);
  hud();
}

function drawBox(box) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = C.lineB;
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

  const n = sim.dots.length;
  if (calm) {
    const g = gridShape(n, box);
    const gap = g.cw > 4 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = STATE_COLOR[sim.dots[k].state];
      ctx.fillRect(box.x + (k % g.cols) * g.cw + gap, box.y + Math.floor(k / g.cols) * g.ch + gap, g.cw - gap * 2, g.ch - gap * 2);
    }
    return;
  }
  const r = Math.max(1.6, Math.min(4.5, Math.sqrt((box.w * box.h) / n) * 0.16));
  /* Sick ones last, so they're on top. Masked dots get a ring. */
  for (const order of [[S, R, V], [I]]) {
    for (const d of sim.dots) {
      if (!order.includes(d.state)) { continue; }
      const x = box.x + (d.x / SIZE) * box.w, y = box.y + (d.y / SIZE) * box.h;
      ctx.fillStyle = STATE_COLOR[d.state];
      ctx.beginPath();
      ctx.arc(x, y, d.state === I ? r * 1.25 : r, 0, Math.PI * 2);
      ctx.fill();
      if (d.masked && r >= 2.5) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

function drawChart(ch) {
  const n = sim.dots.length;
  const hist = sim.history;
  const lastT = hist.length ? hist[hist.length - 1].t : 0;
  const ghostT = ghost ? ghost.history[ghost.history.length - 1].t : 0;
  const span = Math.max(30, Math.ceil(Math.max(lastT, ghostT) / 10) * 10);
  const X = (t) => ch.x + (t / span) * ch.w;
  const Y = (v) => ch.y + ch.h - (v / n) * ch.h;

  ctx.fillStyle = C.bg;
  ctx.fillRect(ch.x, ch.y, ch.w, ch.h);

  /* Stacked bands, bottom up: sick, recovered, healthy, vaccinated. */
  const bands = [["sick", C.sick], ["recovered", C.recovered], ["healthy", C.healthy], ["vaccinated", C.vaccinated]];
  if (hist.length > 1) {
    let below = hist.map(() => 0);
    for (const [key, col] of bands) {
      const above = hist.map((h, k) => below[k] + h[key]);
      ctx.beginPath();
      hist.forEach((h, k) => { const x = X(h.t), y = Y(above[k]); if (k) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); } });
      for (let k = hist.length - 1; k >= 0; k--) { ctx.lineTo(X(hist[k].t), Y(below[k])); }
      ctx.closePath();
      ctx.globalAlpha = key === "sick" ? 0.95 : 0.38;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;
      below = above;
    }
  }

  /* The compared run's sick curve, dashed. */
  if (ghost) {
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ghost.history.forEach((h, k) => { const x = X(h.t), y = Y((h.sick / ghost.n) * n); if (k) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); } });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* The peak: a marker and a label. */
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  ctx.textBaseline = "bottom";
  if (sim.peak.sick > 0) {
    const px = X(sim.peak.t), py = Y(sim.peak.sick);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(px, ch.y + ch.h);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    const label = `peak ${sim.peak.sick}`;
    const tw = ctx.measureText(label).width;
    ctx.textAlign = "left";
    ctx.fillText(label, Math.min(ch.x + ch.w - tw - 2, px + 6), Math.max(ch.y + 13, py - 4));
  }

  /* Axes. */
  ctx.strokeStyle = C.lineB;
  ctx.lineWidth = 1;
  ctx.strokeRect(ch.x + 0.5, ch.y + 0.5, ch.w - 1, ch.h - 1);
  ctx.fillStyle = C.dim;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("day 0", ch.x, ch.y + ch.h + 3);
  ctx.textAlign = "right";
  ctx.fillText(`day ${span}`, ch.x + ch.w, ch.y + ch.h + 3);
  if (ghost) {
    ctx.textAlign = "center";
    ctx.fillStyle = C.text;
    ctx.fillText(`- - last run (peak ${Math.round((ghost.peak.sick / ghost.n) * n)})`, ch.x + ch.w / 2, ch.y + ch.h + 3);
  }
  if (sim.done) {
    ctx.fillStyle = C.text;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = "700 13px 'Space Grotesk', system-ui, sans-serif";
    ctx.fillText("Outbreak over", ch.x + ch.w - 6, ch.y + 6);
  }
}

let lastHud = "";
function hud() {
  const c = counts(sim);
  const sig = `${sim.t.toFixed(0)}|${c.healthy}|${c.sick}|${c.recovered}|${c.vaccinated}|${sim.peak.sick}`;
  if (sig === lastHud) { return; }
  lastHud = sig;
  $("day").textContent = sim.t.toFixed(0);
  $("sick").textContent = String(c.sick);
  $("n-healthy").textContent = String(c.healthy);
  $("n-sick").textContent = String(c.sick);
  $("n-recovered").textContent = String(c.recovered);
  $("n-vaccinated").textContent = String(c.vaccinated);
  const pct = Math.round((sim.peak.sick / c.total) * 100);
  $("peak").textContent = sim.peak.sick
    ? `Peak: ${sim.peak.sick} sick at once (${pct}%) on day ${sim.peak.t.toFixed(0)}${ghost ? `. Last run: ${ghost.peak.sick} (${Math.round((ghost.peak.sick / ghost.n) * 100)}%)` : ""}`
    : "Peak: -";
}

/* ============================================================
   4. INPUT
   ============================================================ */
pointer(stage, {
  down(p) {
    const { box } = areas();
    if (p.x < box.x || p.y < box.y || p.x > box.x + box.w || p.y > box.y + box.h) { return; }
    let k = -1;
    if (calm) {
      const g = gridShape(sim.dots.length, box);
      const cell = Math.floor((p.y - box.y) / g.ch) * g.cols + Math.floor((p.x - box.x) / g.cw);
      if (cell < sim.dots.length && infect(sim, cell)) { k = cell; }
    } else {
      /* A finger is big: search a radius of about 18 px. */
      const reach = (18 / box.w) * SIZE;
      k = infectNear(sim, ((p.x - box.x) / box.w) * SIZE, ((p.y - box.y) / box.h) * SIZE, reach);
    }
    if (k >= 0) { taps++; draw(); }
  }
});

const keys = createKeys({ play: ["KeyP"], infect: ["KeyI"], fresh: ["KeyN"], compare: ["KeyC"] });
keys.on("play", () => loop.toggle());
keys.on("infect", () => infectRandom());
keys.on("fresh", () => doNewRun());
keys.on("compare", () => doCompare());

function infectRandom() {
  const healthy = sim.dots.map((d, k) => (d.state === S ? k : -1)).filter((k) => k >= 0);
  if (!healthy.length) { return; }
  infect(sim, healthy[Math.floor(Math.random() * healthy.length)]);
  taps++;
  draw();
}

function doNewRun() {
  ghost = null;
  $("compare").setAttribute("aria-pressed", "false");
  lastHud = "";
  newRun(false);
}

/* Keep this run's curve, then replay with the same dots, so any
   difference comes from the sliders, not luck. */
function doCompare() {
  ghost = { history: sim.history.map((h) => ({ t: h.t, sick: h.sick })), peak: { ...sim.peak }, n: sim.dots.length };
  $("compare").setAttribute("aria-pressed", "true");
  lastHud = "";
  newRun(true);
}

playBtn.addEventListener("click", () => loop.toggle());
$("restart").addEventListener("click", doNewRun);
$("compare").addEventListener("click", doCompare);

for (const key of Object.keys(SLIDERS)) {
  const input = $(key);
  input.addEventListener("input", () => {
    settings[key] = Math.round(Number(input.value));
    syncSlider(key);
    /* Most sliders change the run live. The dot count needs a new
       run (with the same seed, so the dots you saw stay put). */
    if (key !== "n") { applySettings(sim, { [key]: settings[key] }); draw(); }
  });
  input.addEventListener("change", () => {
    if (key === "n" && settings.n !== sim.dots.length) { newRun(true); }
    save.set({ ...settings });
  });
}

function syncSlider(key) {
  $(key).value = String(settings[key]);
  $(`${key}-out`).textContent = SLIDERS[key].out(settings[key]);
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  settings = validate(d) === true ? { ...DEFAULTS, ...d } : { ...DEFAULTS };
  for (const key of Object.keys(SLIDERS)) { syncSlider(key); }
  newRun(true);
}

onMotionChange((v) => { calm = v; draw(); });

/* ============================================================
   GO
   Reduced motion: the dots are a still grid (only their colours
   change), and it starts paused with a Play button.
   ============================================================ */
/* Once the outbreak is over nothing moves, so the loop stops
   repainting. Taps, sliders and new runs still call draw(), and a
   new sick dot or a new run starts the frames again. */
let drawnDone = false;
function drawFrame() {
  if (sim.done && drawnDone) { return; }
  drawnDone = sim.done;
  draw();
}

apply(save.get());
loop = startLoop({
  update,
  draw: drawFrame,
  startPaused: calm,
  onPauseChange(paused) {
    playBtn.textContent = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-pressed", String(!paused));
  }
});
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));

stage.dataset.ready = "true";
