/* ============================================================
   Fractal Zoom - main script

   The maths is in mandel.js. The pixels are worked out in
   worker.js (a small pool of Web Workers), tile by tile:
   a quick blocky pass first, then the sharp one. So the page
   never freezes, even with thousands of iterations.

   Sections:
     1. save       view, mode, detail, bookmarks
     2. state      the view, Julia mode
     3. render     worker pool, tiles, two buffers
     4. draw       old picture stretched, new tiles on top
     5. input      pinch / scroll / drag / double-tap, keys, buttons
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys, hasTouch } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  HOME, JULIA_HOME, iterationsFor, zoomOf, zoomAt, panBy, toComplex, tiles,
  pastPrecision, zoomLabel, validView, fitHome
} from "./mandel.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const juliaBtn = $("julia");

const TILE = 128;
const COARSE = 8;
const MAX_MARKS = 30;
const FAMOUS = [
  { name: "Seahorse Valley", mode: "mandel", cx: -0.7453, cy: 0.1127, width: 0.0065 },
  { name: "Elephant Valley", mode: "mandel", cx: 0.2822, cy: 0.0096, width: 0.018 },
  { name: "Mini Mandelbrot", mode: "mandel", cx: -1.7548776662, cy: 0, width: 0.045 },
  { name: "Deep spiral", mode: "mandel", cx: -0.743643887037151, cy: 0.13182590420533, width: 0.000012 },
  { name: "Rabbit (Julia)", mode: "julia", jx: -0.123, jy: 0.745, cx: 0, cy: 0, width: 3.2 },
  { name: "Lightning (Julia)", mode: "julia", jx: 0, jy: 1, cx: 0, cy: 0, width: 3.4 }
];

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = {
  base: 250,
  mode: "mandel",
  view: { cx: HOME.cx, cy: HOME.cy, width: HOME.width },
  juliaC: [-0.123, 0.745],
  juliaView: { cx: JULIA_HOME.cx, cy: JULIA_HOME.cy, width: JULIA_HOME.width },
  marks: []
};

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 4);
function validMark(m) {
  return Boolean(m) && typeof m.name === "string" && m.name.length <= 60 &&
    (m.mode === "mandel" || m.mode === "julia") && validView(m) &&
    (m.mode === "mandel" || isPoint([m.jx, m.jy]));
}
function validate(d) {
  if (!Number.isInteger(d.base) || d.base < 100 || d.base > 2000) { return "The detail level in that save is out of range."; }
  if (d.mode !== "mandel" && d.mode !== "julia") { return "Unknown mode in that save."; }
  if (!validView(d.view) || !validView(d.juliaView)) { return "A view in that save is out of range."; }
  if (!isPoint(d.juliaC)) { return "The Julia point in that save is broken."; }
  if (!Array.isArray(d.marks) || d.marks.length > MAX_MARKS || !d.marks.every(validMark)) { return "The bookmarks in that save are broken."; }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save.set({
      base: state.base, mode: state.mode, view: state.view, juliaC: state.juliaC,
      juliaView: state.juliaView, marks: state.marks
    });
  }, 300);
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();
onMotionChange((v) => { calm = v; });
const touchy = hasTouch();

const state = {
  base: DEFAULTS.base,
  mode: "mandel",              // "mandel" | "julia"
  view: { ...HOME },           // Mandelbrot view: centre + width
  juliaC: [...DEFAULTS.juliaC],
  juliaView: { ...JULIA_HOME },
  picking: false,              // Julia mode on: next tap picks a point
  marks: []
};
const current = () => (state.mode === "julia" ? state.juliaView : state.view);
const home = () => fitHome(state.mode === "julia" ? JULIA_HOME : HOME, view.canvas.width, view.canvas.height);
function setCurrent(v) {
  if (state.mode === "julia") { state.juliaView = v; } else { state.view = v; }
  requestRender();
  persist();
}
const zoomNow = () => zoomOf(current(), home());
const itersNow = () => iterationsFor(zoomNow(), state.base);

/* ============================================================
   3. RENDER
   Two offscreen buffers, both canvas-sized:
     front  the last finished picture, and the view it shows
     back   the picture being built now (tiles land here)
   ============================================================ */
const view = createCanvas(stage, { maxDpr: touchy ? 1.5 : 2, onResize: () => { requestRender(true); } });
const ctx = view.ctx;
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();

function makeBuffer() {
  const c = document.createElement("canvas");
  c.width = 1; c.height = 1;
  return { canvas: c, ctx: c.getContext("2d"), view: null, w: 1, h: 1 };
}
const front = makeBuffer();
const back = makeBuffer();

/* The colour ramp from the palette: a loop from dark through
   cyan, white, amber and pink, and back to dark. */
function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
function buildPalette() {
  const stops = [color("--bg-2"), color("--cyan"), color("--text"), color("--amber"), color("--hot"), color("--surface-2")].map(rgb);
  stops.push(stops[0]);
  const size = 1024;
  const lut = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    const t = (i / size) * (stops.length - 1);
    const k = Math.floor(t), f = t - k;
    const ease = f * f * (3 - 2 * f);
    lut[i] = pack(stops[k].map((v, j) => Math.round(v + (stops[k + 1][j] - v) * ease)));
  }
  return { lut, inside: pack(rgb(color("--bg"))) };
}
const palette = buildPalette();

/* ---- the worker pool ---- */
const poolSize = Math.max(1, Math.min(touchy ? 3 : 6, (navigator.hardwareConcurrency || 4) - 1));
const workers = [];
for (let i = 0; i < poolSize; i++) {
  const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  w.busy = false;
  w.postMessage({ type: "palette", lut: palette.lut, inside: palette.inside });
  w.onmessage = (e) => { w.busy = false; onTile(e.data); pump(); };
  w.onerror = (e) => { e.preventDefault(); w.busy = false; pump(); };
  workers.push(w);
}

const render = {
  gen: 0,
  queue: [],
  left: 0,              // sharp tiles still to come for this gen
  coarseLeft: 0,
  job: null,            // what this gen is drawing
  renders: 0,           // finished sharp pictures (for the smoke test)
  startedAt: 0,
  ms: 0,
  pending: false,
  lastStart: 0
};

function requestRender(now = false) {
  render.pending = true;
  if (now) { render.lastStart = 0; }
  dirty = true;
}

function startRender() {
  render.pending = false;
  render.lastStart = performance.now();
  const W = view.canvas.width, H = view.canvas.height;
  render.gen += 1;
  const v = { ...current() };
  const maxIter = itersNow();
  const juliaC = state.mode === "julia" ? [...state.juliaC] : null;
  render.job = { view: v, W, H, maxIter, juliaC };

  /* If the last picture got as far as its blocky pass, it's
     fresher than front: keep it as the stand-in. */
  if (back.view && render.coarseLeft === 0 && back.w === W && back.h === H) { copyBackToFront(); }
  if (back.w !== W || back.h !== H) {
    back.canvas.width = W; back.canvas.height = H; back.w = W; back.h = H;
  } else {
    back.ctx.clearRect(0, 0, W, H);
  }
  back.view = v;

  const list = tiles(W, H, TILE);
  const base = { type: "tile", gen: render.gen, view: v, canvasW: W, canvasH: H, maxIter, juliaC };
  render.queue = [
    ...list.map((t) => ({ ...base, ...t, step: COARSE })),
    ...list.map((t) => ({ ...base, ...t, step: 1 }))
  ];
  render.left = list.length;
  render.coarseLeft = list.length;
  render.startedAt = performance.now();
  pump();
}

function pump() {
  for (const w of workers) {
    if (w.busy || !render.queue.length) { continue; }
    w.busy = true;
    w.postMessage(render.queue.shift());
  }
}

function onTile(m) {
  if (m.gen !== render.gen) { return; }       // an old view: drop it
  const img = new ImageData(new Uint8ClampedArray(m.pixels), m.w, m.h);
  back.ctx.putImageData(img, m.x, m.y);
  dirty = true;
  if (m.step === 1) {
    render.left -= 1;
    if (render.left === 0) {
      render.ms = performance.now() - render.startedAt;
      render.renders += 1;
      copyBackToFront();
      readouts();
    }
  } else {
    render.coarseLeft -= 1;
  }
}

function copyBackToFront() {
  if (front.w !== back.w || front.h !== back.h) {
    front.canvas.width = back.w; front.canvas.height = back.h; front.w = back.w; front.h = back.h;
  }
  front.ctx.clearRect(0, 0, front.w, front.h);
  front.ctx.drawImage(back.canvas, 0, 0);
  front.view = back.view;
  front.mode = render.job && render.job.juliaC ? "julia" : "mandel";
}

/* ============================================================
   4. DRAW
   The finished picture, moved and stretched to match the view
   right now (so pinching feels instant), then whatever new
   tiles have landed on top.
   ============================================================ */
let dirty = true;
let anim = null;      // { from, to, px, py, factor, t0, ms }

function drawBuffer(buf, cur, W, H) {
  if (!buf.view) { return; }
  const k = buf.view.width / cur.width;          // >1 = we've zoomed in since
  const s = cur.width / W;                       // complex units per device pixel
  const cx = W / 2 + (buf.view.cx - cur.cx) / s;
  const cy = H / 2 + (buf.view.cy - cur.cy) / s;
  const w = buf.w * k * (W / buf.w), h = buf.h * k * (W / buf.w);
  ctx.drawImage(buf.canvas, cx - w / 2, cy - h / 2, w, h);
}

function draw() {
  const W = view.canvas.width, H = view.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color("--bg");
  ctx.fillRect(0, 0, W, H);
  const cur = current();
  ctx.imageSmoothingEnabled = true;
  if (front.view && front.mode === state.mode) { drawBuffer(front, cur, W, H); }
  if (back.view && render.job && (render.job.juliaC ? "julia" : "mandel") === state.mode) { drawBuffer(back, cur, W, H); }

  /* Keyboard: a cross at the centre (the point J would use). */
  if (document.activeElement === stage && state.mode === "mandel") {
    const d = view.dpr;
    ctx.strokeStyle = "rgba(236, 238, 246, .8)";
    ctx.lineWidth = 1.5 * d;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 9 * d, H / 2); ctx.lineTo(W / 2 + 9 * d, H / 2);
    ctx.moveTo(W / 2, H / 2 - 9 * d); ctx.lineTo(W / 2, H / 2 + 9 * d);
    ctx.stroke();
  }
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

function readouts() {
  const z = zoomNow();
  const label = zoomLabel(z);
  $("zoom").textContent = label;
  $("zoom-hud").textContent = label;
  $("digits").textContent = `width ${current().width.toPrecision(3)}`;
  $("iters").textContent = String(itersNow());
  $("render-note").textContent = render.left > 0 ? "drawing…" : `drawn in ${Math.round(render.ms)} ms`;
  const limit = pastPrecision(z);
  $("limit").hidden = !limit;
  $("zoom").parentElement.classList.toggle("is-limit", limit);
  $("pick-msg").hidden = !(state.picking && state.mode === "mandel") || limit;
  const [jx, jy] = state.juliaC;
  $("mode-hud").textContent = state.mode === "julia"
    ? `Julia c = ${jx.toFixed(3)} ${jy < 0 ? "−" : "+"} ${Math.abs(jy).toFixed(3)}i`
    : "Mandelbrot";
  juliaBtn.textContent = state.mode === "julia" ? "Back to Mandelbrot" : state.picking ? "Julia mode: tap a spot" : "Julia mode";
  juliaBtn.setAttribute("aria-pressed", String(state.mode === "julia" || state.picking));
  stage.classList.toggle("is-picking", state.picking && state.mode === "mandel");
}

let lastNote = 0;
function update() {
  if (anim) {
    const t = Math.min(1, (performance.now() - anim.t0) / anim.ms);
    const e = 1 - (1 - t) ** 3;
    const f = anim.factor ** e;
    const v = zoomAt(anim.from, view.canvas.width, view.canvas.height, anim.px, anim.py, f, home());
    if (state.mode === "julia") { state.juliaView = v; } else { state.view = v; }
    dirty = true;
    if (t >= 1) { anim = null; requestRender(true); persist(); }
    else { render.pending = true; }
  }
  /* Start a render now if nothing's moving, else at most ~8 a second. */
  if (render.pending) {
    const gap = anim || gesture.active ? 120 : 0;
    if (performance.now() - render.lastStart >= gap) { startRender(); }
  }
  if (render.left > 0 && performance.now() - lastNote > 200) { lastNote = performance.now(); readouts(); }
}

function frame() {
  if (!dirty) { return; }
  dirty = false;
  draw();
  readouts();
}

/* ============================================================
   5. INPUT
   ============================================================ */
const gesture = { active: false, start: null, startView: null, pinch: null, downAt: 0, moved: 0 };
let lastTap = { t: 0, x: 0, y: 0 };
const dev = (p) => [p.x * view.dpr, p.y * view.dpr];

function zoomBy(factor, px = view.canvas.width / 2, py = view.canvas.height / 2) {
  const from = { ...current() };
  if (calm) {
    setCurrent(zoomAt(from, view.canvas.width, view.canvas.height, px, py, factor, home()));
    return;
  }
  anim = { from, px, py, factor, t0: performance.now(), ms: 260 };
}

const ptr = pointer(stage, {
  down(p) {
    anim = null;
    const pts = [...ptr.active.values()];
    gesture.startView = { ...current() };
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      gesture.moved = 99;      // a pinch is never a tap
    } else {
      gesture.pinch = null;
      gesture.start = { x: p.x, y: p.y };
      gesture.downAt = performance.now();
      gesture.moved = 0;
    }
    gesture.active = true;
    stage.classList.add("is-dragging");
  },
  move(p, held) {
    if (!held || !gesture.active) { return; }
    const pts = [...ptr.active.values()];
    const W = view.canvas.width, H = view.canvas.height, d = view.dpr;
    if (gesture.pinch && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = zoomAt(gesture.startView, W, H, gesture.pinch.mx * d, gesture.pinch.my * d, dist / gesture.pinch.d, home());
      setLive(panBy(z, W, (mx - gesture.pinch.mx) * d, (my - gesture.pinch.my) * d));
    } else if (!gesture.pinch) {
      const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
      if (gesture.moved > 6) { setLive(panBy(gesture.startView, W, dx * d, dy * d)); }
    }
  },
  up(p) {
    const left = ptr.active.size;
    if (left >= 1) {
      /* One finger lifted from a pinch: carry on as a drag from here. */
      const q = [...ptr.active.values()][0];
      gesture.pinch = null;
      gesture.startView = { ...current() };
      gesture.start = { x: q.x, y: q.y };
      return;
    }
    gesture.active = false;
    stage.classList.remove("is-dragging");
    const quick = performance.now() - gesture.downAt < 350;
    if (gesture.moved <= 6 && quick && !p.cancelled) { tap(p); }
    requestRender(true);
    persist();
  }
});

/* Pinch / drag: move the view now, render a little later. */
function setLive(v) {
  if (state.mode === "julia") { state.juliaView = v; } else { state.view = v; }
  render.pending = true;
  dirty = true;
}

function tap(p) {
  const [x, y] = dev(p);
  if (state.picking && state.mode === "mandel") {
    showJulia(toComplex(state.view, view.canvas.width, view.canvas.height, x, y));
    return;
  }
  const now = performance.now();
  if (now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
    zoomBy(2.5, x, y);
    lastTap = { t: 0, x: 0, y: 0 };
  } else {
    lastTap = { t: now, x: p.x, y: p.y };
  }
}

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  anim = null;
  const r = stage.getBoundingClientRect();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  const f = Math.exp(-dy * 0.0018);
  setLive(zoomAt(current(), view.canvas.width, view.canvas.height, (e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr, f, home()));
  gesture.wheelAt = performance.now();
  persist();
}, { passive: false });

/* ---- Julia ---- */
function showJulia(c) {
  state.juliaC = [c[0], c[1]];
  state.juliaView = fitHome(JULIA_HOME, view.canvas.width, view.canvas.height);
  state.mode = "julia";
  state.picking = false;
  requestRender(true);
  persist();
}
function backToMandel() {
  state.mode = "mandel";
  state.picking = false;
  requestRender(true);
  persist();
}
juliaBtn.addEventListener("click", () => {
  if (state.mode === "julia") { backToMandel(); return; }
  state.picking = !state.picking;
  dirty = true;
});

/* ---- keyboard ---- */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const W = view.canvas.width, H = view.canvas.height;
  const step = (e.shiftKey ? 0.35 : 0.12) * Math.min(W, H);
  const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (!moves[e.key]) { return; }
  e.preventDefault();
  anim = null;
  setCurrent(panBy(current(), W, ...moves[e.key]));
});
stage.addEventListener("focus", () => { dirty = true; });
stage.addEventListener("blur", () => { dirty = true; });

const keys = createKeys({
  zin: ["Equal", "NumpadAdd"], zout: ["Minus", "NumpadSubtract"], reset: ["Digit0", "Numpad0"],
  julia: ["KeyJ"], mark: ["KeyB"]
});
keys.on("zin", () => zoomBy(2));
keys.on("zout", () => zoomBy(0.5));
keys.on("reset", () => reset());
keys.on("julia", () => {
  if (state.mode === "julia") { backToMandel(); } else { showJulia([state.view.cx, state.view.cy]); }
});
keys.on("mark", () => addMark());

/* ---- buttons ---- */
$("zoom-in").addEventListener("click", () => zoomBy(2));
$("zoom-out").addEventListener("click", () => zoomBy(0.5));
$("reset").addEventListener("click", () => reset());
function reset() {
  anim = null;
  setCurrent({ ...home() });
}

$("base").addEventListener("input", (e) => {
  state.base = Math.round(Number(e.target.value));
  $("base-out").textContent = String(state.base);
  requestRender(true);
  persist();
});

/* ---- famous spots + bookmarks ---- */
function goTo(m) {
  anim = null;
  state.picking = false;
  if (m.mode === "julia") {
    state.mode = "julia";
    state.juliaC = [m.jx, m.jy];
    /* A whole-set Julia view is widened to fit the screen, like the start view. */
    const fit = fitHome(JULIA_HOME, view.canvas.width, view.canvas.height).width;
    state.juliaView = { cx: m.cx, cy: m.cy, width: m.width >= 3 ? Math.max(m.width, fit) : m.width };
  } else {
    state.mode = "mandel";
    state.view = { cx: m.cx, cy: m.cy, width: m.width };
  }
  requestRender(true);
  persist();
}

function chip(m, onDelete) {
  const box = document.createElement("span");
  box.className = "fz-chip";
  const go = document.createElement("button");
  go.type = "button";
  go.className = "btn fz-chip-go";
  go.textContent = m.name;
  go.addEventListener("click", () => goTo(m));
  box.append(go);
  if (onDelete) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn fz-chip-del";
    del.textContent = "×";
    del.setAttribute("aria-label", `Delete bookmark ${m.name}`);
    del.addEventListener("click", onDelete);
    box.append(del);
  }
  return box;
}

$("famous").replaceChildren(...FAMOUS.map((m) => chip(m)));

function showMarks() {
  $("marks").replaceChildren(...state.marks.map((m, i) => chip(m, () => {
    state.marks.splice(i, 1);
    showMarks();
    persist();
  })));
  $("mark").disabled = state.marks.length >= MAX_MARKS;
}

function addMark() {
  if (state.marks.length >= MAX_MARKS) { return; }
  const v = current();
  const n = state.marks.length + 1;
  const m = state.mode === "julia"
    ? { name: `Julia ${n} · ${zoomLabel(zoomNow())}`, mode: "julia", jx: state.juliaC[0], jy: state.juliaC[1], ...v }
    : { name: `Spot ${n} · ${zoomLabel(zoomNow())}`, mode: "mandel", ...v };
  state.marks.push(m);
  showMarks();
  persist();
}
$("mark").addEventListener("click", addMark);

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  state.base = ok.base;
  state.mode = ok.mode;
  /* The plain start view gets widened to fit this screen's shape. */
  const isStart = (v, h) => v.cx === h.cx && v.cy === h.cy && v.width === h.width;
  state.view = isStart(ok.view, HOME) ? fitHome(HOME, view.canvas.width, view.canvas.height) : { ...ok.view };
  state.juliaC = [...ok.juliaC];
  state.juliaView = isStart(ok.juliaView, JULIA_HOME) ? fitHome(JULIA_HOME, view.canvas.width, view.canvas.height) : { ...ok.juliaView };
  state.marks = ok.marks.map((m) => ({ ...m }));
  state.picking = false;
  $("base").value = String(state.base);
  $("base-out").textContent = String(state.base);
  showMarks();
  requestRender(true);
}

exposeForTests({
  get zoom() { return zoomNow(); },
  get renders() { return render.renders; },
  get gen() { return render.gen; },
  get drawing() { return render.left > 0 || render.pending; },
  get mode() { return state.mode; },
  get view() { return { ...current() }; },
  get marks() { return state.marks.length; },
  get iterations() { return itersNow(); }
});

/* ============================================================
   GO
   Nothing moves by itself here, so reduced motion only drops
   the zoom animation: zooms jump straight to the new view.
   ============================================================ */
apply(save.get());
startLoop({ update, draw: frame });
stage.dataset.ready = "true";
