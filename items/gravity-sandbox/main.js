/* ============================================================
   Gravity Sandbox - main script

   The physics is in physics.js (Newton's gravity, leapfrog,
   merges, energy, momentum, presets). This file runs the
   clock, the camera, draws, and listens.

   Sections:
     1. save       preset, size, speed, trail length, follow
     2. state      the sim, the camera, trails
     3. loop       fixed-step physics (update) + paint (draw)
     4. input      drag to throw, pinch / scroll zoom, pan, keys
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion, onMotionChange } from "../../kit/motion.js";
import {
  PRESETS, PRESET_IDS, SIZES, body, add, step, energy, momentum, centreOfMass, circularSpeed, loadPreset, createSim
} from "./physics.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");
const msg = $("msg");

const DT = 1 / 600;                          // physics step, seconds
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const TRAILS = [0, 1, 3, 8, 20];             // seconds of trail
const TRAIL_RATE = 30;                       // trail points per second
const MAX_BODIES = 80;
const THROW = 1.2;                           // world speed per world unit dragged
const ZOOM_MIN = 0.05, ZOOM_MAX = 8;

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { preset: "solar", size: "planet", speed: 2, trail: 2, follow: false };
const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function validate(d) {
  if (!PRESET_IDS.includes(d.preset)) { return "That save has an unknown preset."; }
  if (!Object.hasOwn(SIZES, d.size)) { return "That save has an unknown body size."; }
  if (!inRange(d.speed, 0, SPEEDS.length - 1) || !inRange(d.trail, 0, TRAILS.length - 1)) { return "The speed or trail in that save is out of range."; }
  if (typeof d.follow !== "boolean") { return "That save is missing the follow setting."; }
  return true;
}
const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});
function persist() {
  const { preset, size, speed, trail, follow } = state;
  save.set({ preset, size, speed, trail, follow });
}

/* ============================================================
   2. STATE
   ============================================================ */
let calm = reducedMotion();

const view = createCanvas(stage, { onResize: () => draw() });
const ctx = view.ctx;

const state = {
  preset: DEFAULTS.preset,
  size: DEFAULTS.size,
  speed: DEFAULTS.speed,
  trail: DEFAULTS.trail,
  follow: false,
  tool: "throw",                 // what a one-finger drag does: "throw" | "pan"
  sim: createSim(),
  cam: { x: 0, y: 0, zoom: 1 },
  e0: 0,                         // energy since the last change
  merges: 0,
  acc: 0,                        // part-steps carried between frames
  aim: null,                     // { x0, y0, x1, y1 } screen px while dragging a throw
  preview: null,                 // predicted path of the body being aimed
  keyAim: false                  // show the centre cross after a key press
};
let trails = new Map();          // body id -> { x: Float32Array, y, head, filled }
let trailClock = 0;

function setBaseline() { state.e0 = energy(state.sim).total; state.merges = state.sim.merges; }

function fit() {
  const ext = PRESETS[state.preset].extent;
  state.cam = { x: 0, y: 0, zoom: Math.min(view.width, view.height) / (2 * ext) };
}

function reset() {
  state.sim = loadPreset(state.preset);
  trails = new Map();
  trailClock = 0;
  state.acc = 0;
  fit();
  setBaseline();
  draw();
}

exposeForTests({
  get t() { return state.sim.t; },
  get count() { return state.sim.bodies.length; },
  get zoom() { return state.cam.zoom; },
  get energy() { return energy(state.sim).total; },
  get momentum() { return momentum(state.sim); },
  get running() { return Boolean(loop) && !loop.paused; }
});

onMotionChange((v) => { calm = v; });

/* ---- camera ----------------------------------------------- */
const toScreen = (x, y) => [view.width / 2 + (x - state.cam.x) * state.cam.zoom, view.height / 2 + (y - state.cam.y) * state.cam.zoom];
const toWorld = (sx, sy) => [state.cam.x + (sx - view.width / 2) / state.cam.zoom, state.cam.y + (sy - view.height / 2) / state.cam.zoom];

/* Zoom, keeping the world point under (sx, sy) where it is. */
function zoomAt(sx, sy, factor) {
  const [wx, wy] = toWorld(sx, sy);
  state.cam.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.cam.zoom * factor));
  const [nx, ny] = toWorld(sx, sy);
  state.cam.x += wx - nx;
  state.cam.y += wy - ny;
}
function panBy(dx, dy) {
  if (state.follow) { setFollow(false); }
  state.cam.x -= dx / state.cam.zoom;
  state.cam.y -= dy / state.cam.zoom;
}

/* ============================================================
   3. LOOP
   ============================================================ */
function update(dt) {
  state.acc += (dt * SPEEDS[state.speed]) / DT;
  let n = Math.floor(state.acc);
  state.acc -= n;
  const every = 1 / TRAIL_RATE;
  while (n-- > 0) {
    step(state.sim, DT);
    trailClock += DT;
    if (trailClock >= every) { trailClock -= every; addTrail(); }
  }
  /* A crash changes the energy (some goes to heat): new baseline. */
  if (state.sim.merges !== state.merges) { setBaseline(); }
  if (state.aim) { predict(); }
}

function addTrail() {
  const len = TRAILS[TRAILS.length - 1] * TRAIL_RATE;
  const alive = new Set();
  for (const b of state.sim.bodies) {
    alive.add(b.id);
    let tr = trails.get(b.id);
    if (!tr) { tr = { x: new Float32Array(len), y: new Float32Array(len), head: -1, filled: 0 }; trails.set(b.id, tr); }
    tr.head += 1;
    const k = tr.head % len;
    tr.x[k] = b.x;
    tr.y[k] = b.y;
    tr.filled = Math.min(len, tr.filled + 1);
  }
  for (const id of trails.keys()) { if (!alive.has(id)) { trails.delete(id); } }
}

/* Where would the aimed body go? Run a copy of the sim ahead. */
function newBody() {
  const { x0, y0, x1, y1 } = state.aim;
  const [wx, wy] = toWorld(x0, y0);
  const vx = ((x1 - x0) / state.cam.zoom) * THROW, vy = ((y1 - y0) / state.cam.zoom) * THROW;
  return body({ x: wx, y: wy, vx, vy, ...SIZES[state.size] });
}
function predict() {
  const ghost = createSim(state.sim.bodies.map((b) => ({ ...b })), { g: state.sim.g, eps: state.sim.eps });
  const me = add(ghost, newBody());
  const pts = [];
  const h = 1 / 120;
  for (let k = 0; k < 360; k++) {
    step(ghost, h);
    if (!ghost.bodies.includes(me)) {
      /* It crashed: find what it became and stop there. */
      break;
    }
    if (k % 3 === 0) { pts.push(me.x, me.y); }
  }
  state.preview = pts;
}

/* ---- drawing ---------------------------------------------- */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), line: color("--line"), text: color("--text"), dim: color("--text-dim"), faint: color("--text-faint"),
  hot: color("--hot"), cyan: color("--cyan"), amber: color("--amber")
};
const KIND = { star: C.amber, planet: C.cyan, moon: C.dim, a: C.hot, b: C.cyan, c: C.amber };
const RGB = { star: "255, 201, 60", planet: "53, 214, 245", moon: "154, 161, 188", a: "255, 45, 120", b: "53, 214, 245", c: "255, 201, 60" };

function draw() {
  const W = view.width, H = view.height;
  if (state.follow && state.sim.bodies.length) { [state.cam.x, state.cam.y] = centreOfMass(state.sim); }

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  /* A faint dot grid, every 100 world units, so pan and zoom feel real. */
  const z = state.cam.zoom;
  let gap = 100;
  while (gap * z < 40) { gap *= 2; }
  const [wx0, wy0] = toWorld(0, 0);
  ctx.fillStyle = "rgba(236, 238, 246, .12)";
  for (let gx = Math.floor(wx0 / gap) * gap; gx < wx0 + W / z + gap; gx += gap) {
    for (let gy = Math.floor(wy0 / gap) * gap; gy < wy0 + H / z + gap; gy += gap) {
      const [sx, sy] = toScreen(gx, gy);
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }

  /* Trails: older = fainter. */
  const keep = TRAILS[state.trail] * TRAIL_RATE;
  if (keep > 1) {
    const bands = 6;
    const len = TRAILS[TRAILS.length - 1] * TRAIL_RATE;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    for (const b of state.sim.bodies) {
      const tr = trails.get(b.id);
      if (!tr) { continue; }
      const n = Math.min(tr.filled, keep);
      if (n < 2) { continue; }
      for (let band = 0; band < bands; band++) {
        const from = Math.floor((band * (n - 1)) / bands);
        const to = Math.floor(((band + 1) * (n - 1)) / bands);
        ctx.strokeStyle = `rgba(${RGB[b.kind] || RGB.planet}, ${(0.05 + 0.5 * ((band + 1) / bands) ** 1.6).toFixed(3)})`;
        ctx.beginPath();
        for (let j = from; j <= to; j++) {
          const k = (tr.head - (n - 1) + j + len) % len;
          const [sx, sy] = toScreen(tr.x[k], tr.y[k]);
          if (j === from) { ctx.moveTo(sx, sy); } else { ctx.lineTo(sx, sy); }
        }
        ctx.stroke();
      }
    }
  }

  /* Bodies. Stars glow. */
  for (const b of state.sim.bodies) {
    const [sx, sy] = toScreen(b.x, b.y);
    const r = Math.max(2.5, b.r * z);
    if (sx < -r * 4 || sy < -r * 4 || sx > W + r * 4 || sy > H + r * 4) { continue; }
    const rgb = RGB[b.kind] || RGB.planet;
    if (b.kind === "star" || b.m >= 300) {
      const g = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 3.2);
      g.addColorStop(0, `rgba(${rgb}, .45)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = KIND[b.kind] || C.cyan;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Centre of mass, when following it. */
  if (state.follow) {
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, H / 2); ctx.lineTo(W / 2 + 8, H / 2);
    ctx.moveTo(W / 2, H / 2 - 8); ctx.lineTo(W / 2, H / 2 + 8);
    ctx.stroke();
  }

  /* Aiming a throw: the arrow, the predicted path, the new body. */
  if (state.aim) {
    const { x0, y0, x1, y1 } = state.aim;
    if (state.preview && state.preview.length > 2) {
      ctx.strokeStyle = C.text;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let k = 0; k < state.preview.length; k += 2) { ctx.lineTo(...toScreen(state.preview[k], state.preview[k + 1])); }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = C.hot;
    ctx.fillStyle = C.hot;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const sz = SIZES[state.size];
    ctx.fillStyle = KIND[sz.kind];
    ctx.beginPath();
    ctx.arc(x0, y0, Math.max(3, sz.r * z), 0, Math.PI * 2);
    ctx.fill();
    const v = Math.hypot(x1 - x0, y1 - y0) / z * THROW;
    ctx.font = "600 12px 'JetBrains Mono', monospace";
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`speed ${v.toFixed(0)}`, Math.min(W - 90, x1 + 10), Math.max(16, y1 - 6));
  }

  /* Keyboard: Enter throws at the centre cross. */
  if (state.keyAim) {
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  hud();
}

const fmt = (v) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) { return `${s}${(a / 1e6).toFixed(2)} M`; }
  if (a >= 1e3) { return `${s}${(a / 1e3).toFixed(1)} k`; }
  return `${s}${a.toFixed(1)}`;
};

function hud() {
  $("time").textContent = `${state.sim.t.toFixed(1)} s`;
  $("bodies").textContent = String(state.sim.bodies.length);
  const e = energy(state.sim).total;
  $("energy").textContent = fmt(e);
  const drift = state.e0 ? ((e - state.e0) / Math.abs(state.e0)) * 100 : 0;
  $("drift").textContent = Math.abs(drift) < 0.0005 ? "drift 0.000%" : `drift ${drift > 0 ? "+" : "−"}${Math.abs(drift).toFixed(3)}%`;
  const [px, py] = momentum(state.sim);
  $("momentum").textContent = fmt(Math.hypot(px, py));
  const c = state.sim.merges;
  $("crashes").textContent = `${c} crash${c === 1 ? "" : "es"}`;
}

/* ============================================================
   4. INPUT
   One finger: throw (or pan, with Move view). Two fingers:
   pinch to zoom and pan. Mouse wheel: zoom.
   ============================================================ */
const touches = new Map();      // pointer id -> { x, y }
let pinch = null;               // { d, cx, cy }
let panFrom = null;

function throwBody() {
  if (state.sim.bodies.length >= MAX_BODIES) { return; }
  add(state.sim, newBody());
  setBaseline();
}

pointer(stage, {
  down(p) {
    stage.focus({ preventScroll: true });
    state.keyAim = false;
    touches.set(p.id, { x: p.x, y: p.y });
    if (touches.size === 2) {
      /* Second finger: stop aiming, start pinching. */
      state.aim = null;
      state.preview = null;
      panFrom = null;
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    } else if (touches.size === 1) {
      if (state.tool === "pan") { panFrom = { x: p.x, y: p.y }; }
      else { state.aim = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; predict(); }
    }
    draw();
  },
  move(p, held) {
    if (!held || !touches.has(p.id)) { return; }
    touches.set(p.id, { x: p.x, y: p.y });
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      panBy(cx - pinch.cx, cy - pinch.cy);
      if (pinch.d > 4) { zoomAt(cx, cy, d / pinch.d); }
      pinch = { d, cx, cy };
    } else if (panFrom) {
      panBy(p.x - panFrom.x, p.y - panFrom.y);
      panFrom = { x: p.x, y: p.y };
    } else if (state.aim) {
      state.aim.x1 = p.x;
      state.aim.y1 = p.y;
      predict();
    }
    draw();
  },
  up(p) {
    touches.delete(p.id);
    if (state.aim && !p.cancelled && touches.size === 0) { throwBody(); }
    if (touches.size < 2) { pinch = null; }
    if (touches.size === 0) { panFrom = null; }
    state.aim = null;
    state.preview = null;
    draw();
  }
});

stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  draw();
}, { passive: false });

/* Keyboard on focused space: arrows pan, +/- zoom, Enter throws
   a body into a circular orbit round the heaviest body. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const d = e.shiftKey ? 120 : 40;
  if (e.key === "ArrowLeft") { panBy(d, 0); }
  else if (e.key === "ArrowRight") { panBy(-d, 0); }
  else if (e.key === "ArrowUp") { panBy(0, d); }
  else if (e.key === "ArrowDown") { panBy(0, -d); }
  else if (e.key === "+" || e.key === "=") { zoomAt(view.width / 2, view.height / 2, 1.25); }
  else if (e.key === "-" || e.key === "_") { zoomAt(view.width / 2, view.height / 2, 0.8); }
  else if (e.key === "Enter" || e.key === " ") { orbitAtCentre(); }
  else { return; }
  e.preventDefault();
  state.keyAim = true;
  draw();
});
stage.addEventListener("blur", () => { if (state.keyAim) { state.keyAim = false; draw(); } });

function orbitAtCentre() {
  if (state.sim.bodies.length >= MAX_BODIES) { return; }
  let [x, y] = toWorld(view.width / 2, view.height / 2);
  const big = state.sim.bodies.reduce((a, b) => (!a || b.m > a.m ? b : a), null);
  let vx = 0, vy = 0;
  if (big) {
    let dx = x - big.x, dy = y - big.y, r = Math.hypot(dx, dy);
    /* Too close to the big one (it would crash at once)? Start further out, above it. */
    const safe = Math.max(big.r * 5, (0.3 * Math.min(view.width, view.height)) / state.cam.zoom);
    if (r < big.r * 4) { dx = 0; dy = -safe; r = safe; }
    /* Walk round (and in / out) until the spot is clear of every body. */
    const newR = SIZES[state.size].r;
    const clear = (px, py) => state.sim.bodies.every((b) => Math.hypot(b.x - px, b.y - py) > (b.r + newR) * 3);
    const a0 = Math.atan2(dy, dx);
    search:
    for (const k of [1, 1.25, 0.8, 1.5]) {
      for (let s = 0; s < 16; s++) {
        const a = a0 + (s * Math.PI) / 8, rr = r * k;
        if (clear(big.x + rr * Math.cos(a), big.y + rr * Math.sin(a))) { dx = rr * Math.cos(a); dy = rr * Math.sin(a); r = rr; break search; }
      }
    }
    x = big.x + dx;
    y = big.y + dy;
    const v = circularSpeed(big.m, r, state.sim.g);
    vx = big.vx - (dy / r) * v;
    vy = big.vy + (dx / r) * v;
  }
  add(state.sim, body({ x, y, vx, vy, ...SIZES[state.size] }));
  setBaseline();
}

/* ---- buttons ---------------------------------------------- */
playBtn.addEventListener("click", () => loop.toggle());
$("reset").addEventListener("click", reset);
$("clear").addEventListener("click", () => { state.sim = createSim(); trails = new Map(); setBaseline(); draw(); });

function setPreset(id) { state.preset = id; syncControls(); reset(); persist(); }
function setSize(id) { state.size = id; syncControls(); persist(); }
function setFollow(on) { state.follow = on; syncControls(); persist(); draw(); }
function setTool(t) { state.tool = t; syncControls(); }

for (const b of document.querySelectorAll("[data-preset]")) { b.addEventListener("click", () => setPreset(b.dataset.preset)); }
for (const b of document.querySelectorAll("[data-size]")) { b.addEventListener("click", () => setSize(b.dataset.size)); }
for (const b of document.querySelectorAll("[data-tool]")) { b.addEventListener("click", () => setTool(b.dataset.tool)); }
$("follow").addEventListener("click", () => setFollow(!state.follow));

const keys = createKeys({
  play: ["KeyP"], reset: ["KeyR"], follow: ["KeyF"],
  s1: ["Digit1"], s2: ["Digit2"], s3: ["Digit3"]
});
keys.on("play", () => loop.toggle());
keys.on("reset", reset);
keys.on("follow", () => setFollow(!state.follow));
keys.on("s1", () => setSize("moon"));
keys.on("s2", () => setSize("planet"));
keys.on("s3", () => setSize("star"));

/* ---- sliders ---------------------------------------------- */
$("speed").addEventListener("input", (e) => { state.speed = Math.round(Number(e.target.value)); syncControls(); persist(); });
$("trail").addEventListener("input", (e) => { state.trail = Math.round(Number(e.target.value)); syncControls(); persist(); draw(); });

function syncControls() {
  $("speed").value = String(state.speed);
  $("speed-out").textContent = `${SPEEDS[state.speed]}×`;
  $("trail").value = String(state.trail);
  $("trail-out").textContent = TRAILS[state.trail] ? `${TRAILS[state.trail]} s` : "off";
  for (const b of document.querySelectorAll("[data-preset]")) { b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)); }
  for (const b of document.querySelectorAll("[data-size]")) { b.setAttribute("aria-pressed", String(b.dataset.size === state.size)); }
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)); }
  $("follow").setAttribute("aria-pressed", String(state.follow));
  stage.classList.toggle("is-pan", state.tool === "pan");
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  Object.assign(state, { preset: ok.preset, size: ok.size, speed: ok.speed, trail: ok.trail, follow: ok.follow });
  syncControls();
  reset();
}

/* ============================================================
   GO
   Reduced motion: starts paused, with a Play button.
   ============================================================ */
let loop = null;
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
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));
msg.hidden = !loop.paused;

/* The stage can change size after the first fit (fonts, scrollbar). */
new ResizeObserver(() => { if (state.sim.t === 0) { fit(); draw(); } }).observe(stage);

stage.dataset.ready = "true";
