/* ============================================================
   Light & Lenses - main script

   The optics is in optics.js (Snell's law, mirrors, shapes,
   tracing). Nothing here moves by itself, so there is no frame
   loop: the bench is re-traced and re-drawn whenever you change
   something.

   Sections:
     1. save       the layout (light + pieces) in world units
     2. state      pieces, selection, the world <-> screen scale
     3. draw       rays, pieces, handles, focal points
     4. input      drag / turn / tap, keys, buttons
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { pointer } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import {
  traceAll, shapeOf, focalLength, hitTest, scene, wavelengthRGB,
  PIECES, PIECE_NAMES, SOURCES, SCENES
} from "./optics.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const MAX_PIECES = 12;
const TURN = (5 * Math.PI) / 180;

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { scene: "rainbow", layout: null };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
function validPiece(p, types) {
  return p && typeof p === "object" && types.includes(p.type) && isNum(p.x) && isNum(p.y) && isNum(p.angle) &&
         Math.abs(p.x) < 1e5 && Math.abs(p.y) < 1e5;
}

function validate(d) {
  if (!SCENES.includes(d.scene)) { return "Unknown scene in that save."; }
  if (d.layout !== null) {
    const l = d.layout;
    if (!l || typeof l !== "object" || !isNum(l.w) || !isNum(l.h) || l.w < 50 || l.h < 50) { return "The layout in that save is broken."; }
    if (!validPiece(l.source, ["source"]) || !SOURCES.includes(l.source.light)) { return "The light in that save is broken."; }
    if (!Array.isArray(l.pieces) || l.pieces.length > MAX_PIECES || !l.pieces.every((p) => validPiece(p, PIECES))) {
      return "The pieces in that save are broken.";
    }
  }
  return true;
}

const save = createSave({ slug: itemSlug(), version: 1, defaults: DEFAULTS, validate });
mountSavePanel($("save-panel"), save, {
  onImport: () => apply(save.get()),
  onDelete: () => apply(structuredClone(DEFAULTS))
});

const round = (v) => Math.round(v * 100) / 100;
function persist() {
  save.set({
    scene: state.scene,
    layout: {
      w: round(world.w), h: round(world.h),
      source: { type: "source", light: source.type, x: round(source.x), y: round(source.y), angle: round(source.angle) },
      pieces: pieces.map((p) => ({ type: p.type, x: round(p.x), y: round(p.y), angle: round(p.angle) }))
    }
  });
}

/* ============================================================
   2. STATE
   The bench is measured in "world" units: about 600 across the
   short side of the screen, so pieces are a sensible size on a
   phone and on a monitor.
   ============================================================ */
const state = { scene: "rainbow", selected: -1, moves: 0 };
let source = { type: "white", x: 60, y: 300, angle: 0, size: 1 };
let pieces = [];
let rays = [];
let world = { w: 1000, h: 600, scale: 1 };

const view = createCanvas(stage, { onResize: () => { fitWorld(); retrace(); draw(); } });
const ctx = view.ctx;

function worldFor(w, h) {
  const scale = Math.max(0.5, Math.min(1.25, Math.min(w, h) / 600));
  return { w: w / scale, h: h / scale, scale };
}

/* A new screen size: stretch the layout to the new world, so
   nothing ends up off the edge. */
function fitWorld() {
  const next = worldFor(view.width, view.height);
  if (Math.abs(next.w - world.w) > 0.5 || Math.abs(next.h - world.h) > 0.5) {
    const sx = next.w / world.w, sy = next.h / world.h;
    for (const p of [source, ...pieces]) { p.x *= sx; p.y *= sy; }
  }
  world = next;
}

/* Index -1 = nothing, 0 = the light, 1.. = pieces[k - 1]. */
const all = () => [source, ...pieces];
const selectedThing = () => (state.selected < 0 ? null : all()[state.selected] || null);

function retrace() { rays = traceAll(source, pieces, { bounds: 6000 }); }

exposeForTests({
  get pieces() { return pieces.map((p) => ({ type: p.type, x: p.x, y: p.y, angle: p.angle })); },
  get light() { return source.type; },
  get selected() { return state.selected; },
  get moves() { return state.moves; },
  get scene() { return state.scene; },
  /* A fingerprint of every ray's path. */
  get rayChecksum() {
    let s = 0;
    for (const r of rays) { r.points.forEach((p, k) => { s += (p.x * 0.37 + p.y * 0.61) * (k + 1); }); }
    return Math.round(s * 1000) / 1000;
  },
  get hits() { return rays.reduce((n, r) => n + r.hits.length, 0); },
  get tir() { return rays.some((r) => r.hits.some((h) => h.kind === "tir")); },
  /* Page coordinates of a piece's centre (k = pieces index). */
  screenOf(k) {
    const p = pieces[k];
    const r = stage.getBoundingClientRect();
    return { x: r.left + p.x * world.scale, y: r.top + p.y * world.scale };
  }
});

/* ============================================================
   3. DRAW
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: "#05050A", line: color("--line"), lineB: color("--line-bright"), text: color("--text"),
  dim: color("--text-dim"), cyan: color("--cyan"), amber: color("--amber"), hot: color("--hot")
};

function rayColour(r, a) {
  if (r.color === "lamp") { return `rgba(255, 236, 190, ${a})`; }
  const [R, G, B] = wavelengthRGB(r.nm);
  return `rgba(${R}, ${G}, ${B}, ${a})`;
}

function draw() {
  const s = world.scale;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, view.width, view.height);

  /* A faint bench grid, 50 units apart. */
  ctx.strokeStyle = "rgba(35, 38, 58, .55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 50; x < world.w; x += 50) { ctx.moveTo(Math.round(x * s) + 0.5, 0); ctx.lineTo(Math.round(x * s) + 0.5, view.height); }
  for (let y = 50; y < world.h; y += 50) { ctx.moveTo(0, Math.round(y * s) + 0.5); ctx.lineTo(view.width, Math.round(y * s) + 0.5); }
  ctx.stroke();

  ctx.save();
  ctx.scale(s, s);

  /* Pieces under the light. */
  pieces.forEach((p, k) => drawPiece(p, state.selected === k + 1));
  drawSource(source, state.selected === 0);

  /* Rays: a soft glow, then a sharp core, added together like light. */
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  const many = rays.length > 3;
  for (const pass of [{ w: 6, a: many ? 0.07 : 0.12 }, { w: 1.8, a: many ? 0.55 : 0.95 }]) {
    ctx.lineWidth = pass.w / s;
    for (const r of rays) {
      ctx.strokeStyle = rayColour(r, pass.a);
      ctx.beginPath();
      ctx.moveTo(r.points[0].x, r.points[0].y);
      for (const p of r.points.slice(1)) { ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";

  drawFoci();
  drawSelection();
  ctx.restore();
}

const toWorld = (p, local) => ({
  x: p.x + local.x * Math.cos(p.angle) - local.y * Math.sin(p.angle),
  y: p.y + local.x * Math.sin(p.angle) + local.y * Math.cos(p.angle)
});

/* The outline of a piece in its own frame, as a path. */
function outline(p) {
  const sh = shapeOf(p);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.beginPath();
  if (p.type === "prism" || p.type === "block") {
    sh.surfaces.forEach((s, k) => { if (k === 0) { ctx.moveTo(s.a.x, s.a.y); } ctx.lineTo(s.b.x, s.b.y); });
    ctx.closePath();
  } else if (p.type === "convex" || p.type === "concave") {
    /* Walk down one face and back up the other. */
    const H = sh.height / 2;
    const face = (f, from, to) => {
      for (let k = 0; k <= 24; k++) {
        const y = from + ((to - from) * k) / 24;
        const x = f.c.x + f.side * Math.sqrt(Math.max(0, f.r * f.r - (y - f.c.y) ** 2));
        ctx.lineTo(x, y);
      }
    };
    face(sh.surfaces[0], -H, H);
    face(sh.surfaces[1], H, -H);
    ctx.closePath();
  } else if (p.type === "curved") {
    const s = sh.surfaces[0];
    const a = Math.asin(s.ymax / s.r);
    ctx.arc(s.c.x, s.c.y, s.r, -a, a);
  } else {
    const s = sh.surfaces[0];
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
  }
  ctx.restore();
}

function drawPiece(p, selected) {
  const glass = p.type !== "mirror" && p.type !== "curved";
  outline(p);
  if (glass) {
    ctx.fillStyle = "rgba(53, 214, 245, .13)";
    ctx.fill();
    ctx.strokeStyle = selected ? C.amber : "rgba(53, 214, 245, .75)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else {
    /* Mirrors: a silver face with hatching behind it. */
    ctx.strokeStyle = selected ? C.amber : "#D8DCEA";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.strokeStyle = "rgba(154, 161, 188, .5)";
    ctx.lineWidth = 1;
    const H = shapeOf(p).height / 2;
    const R = p.type === "curved" ? shapeOf(p).radius : 0;
    ctx.beginPath();
    for (let y = -H + 6; y <= H - 2; y += 10) {
      const x = R ? -R + Math.sqrt(R * R - y * y) : 0;
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 9, y - 6);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawSource(src, selected) {
  ctx.save();
  ctx.translate(src.x, src.y);
  ctx.rotate(src.angle);
  ctx.fillStyle = "#1C1F30";
  ctx.strokeStyle = selected ? C.amber : C.dim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-28, -14, 52, 28, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = src.type === "laser" ? "#FF4040" : src.type === "lamp" ? "#FFECBE" : "#FFFFFF";
  ctx.fillRect(22, -6, 6, 12);
  ctx.restore();
}

/* F marks: both sides of a lens, in front of a curved mirror. */
function drawFoci() {
  ctx.font = "700 13px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of pieces) {
    if (!["convex", "concave", "curved"].includes(p.type)) { continue; }
    const f = focalLength(p.type);
    const marks = p.type === "curved" ? [-f] : [f, -f];
    for (const x of marks) {
      const q = toWorld(p, { x, y: 0 });
      const real = p.type !== "concave";
      ctx.strokeStyle = C.amber;
      ctx.fillStyle = C.amber;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
      if (real) { ctx.fill(); } else { ctx.stroke(); }
      ctx.fillText("F", q.x, q.y - 13);
    }
  }
}

/* The selected piece: a dashed ring, its turn handle, and the
   angles at the first spot the light meets it. */
function drawSelection() {
  const p = selectedThing();
  if (!p) { return; }
  const h = handleOf(p);
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(h.x, h.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 4.5, -0.3, Math.PI * 1.3);
  ctx.stroke();

  const hit = firstHit();
  if (hit) {
    /* The normal at the hit point, dashed. */
    const n = hit.normal;
    ctx.strokeStyle = "rgba(236, 238, 246, .7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(hit.x - n.x * 40, hit.y - n.y * 40);
    ctx.lineTo(hit.x + n.x * 40, hit.y + n.y * 40);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(hit.x, hit.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Where the turn handle sits: just past the piece's edge. */
function handleOf(p) {
  const reach = p.type === "source" ? 44 : shapeOf(p).height / 2 + 30;
  return toWorld(p, { x: 0, y: -reach });
}

/* The main ray's first hit on the selected piece, with the
   surface normal worked out from the turn it made. */
function firstHit() {
  if (state.selected < 1 || !rays.length) { return null; }
  const k = state.selected - 1;
  const main = rays[Math.floor(rays.length / 2)];
  for (let i = 0; i < main.hits.length; i++) {
    const h = main.hits[i];
    if (h.piece !== k) { continue; }
    const a = main.points[i], b = main.points[i + 1], c = main.points[i + 2];
    const din = norm2(b.x - a.x, b.y - a.y), dout = c ? norm2(c.x - b.x, c.y - b.y) : din;
    /* For a reflection the normal is along (out - in); for a
       refraction it's close enough to draw along (in) bent half way. */
    let normal = norm2(dout.x - din.x, dout.y - din.y);
    if (h.kind === "refract") {
      const pk = pieces[k];
      normal = surfaceNormal(pk, b, din);
    }
    return { ...h, normal, ray: main, index: i };
  }
  return null;
}

const norm2 = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

/* Normal of a piece's surface at a point (found by nudging a
   tiny probe ray onto it). */
function surfaceNormal(p, at, din) {
  const sh = shapeOf(p);
  const l = { x: (at.x - p.x) * Math.cos(-p.angle) - (at.y - p.y) * Math.sin(-p.angle), y: (at.x - p.x) * Math.sin(-p.angle) + (at.y - p.y) * Math.cos(-p.angle) };
  let best = null, bestD = Infinity;
  for (const s of sh.surfaces) {
    let n, d;
    if (s.type === "seg") {
      const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y;
      const L = Math.hypot(ex, ey);
      d = Math.abs((l.x - s.a.x) * ey - (l.y - s.a.y) * ex) / L;
      n = { x: ey / L, y: -ex / L };
    } else {
      d = Math.abs(Math.hypot(l.x - s.c.x, l.y - s.c.y) - s.r);
      n = norm2(l.x - s.c.x, l.y - s.c.y);
    }
    if (d < bestD) { bestD = d; best = n; }
  }
  const w = { x: best.x * Math.cos(p.angle) - best.y * Math.sin(p.angle), y: best.x * Math.sin(p.angle) + best.y * Math.cos(p.angle) };
  return w.x * din.x + w.y * din.y > 0 ? w : { x: -w.x, y: -w.y };
}

/* ---- the words under the bench ---------------------------- */
function readout() {
  const p = selectedThing();
  const name = $("sel-name"), angles = $("sel-angles");
  if (!p) {
    name.textContent = "Tap a piece to see what the light does there.";
    angles.textContent = "";
    return;
  }
  if (p === source) {
    name.textContent = `${PIECE_NAMES.source}: ${source.type === "laser" ? "red laser (650 nm)" : source.type === "white" ? "white laser (7 colours)" : "lamp, a wide beam"}`;
    angles.textContent = `Pointing ${Math.round(((-source.angle * 180) / Math.PI + 360) % 360)}°`;
    return;
  }
  const f = focalLength(p.type);
  const focal = f === null ? "" : ` · focal length ${Math.abs(Math.round(f))}${p.type === "concave" ? " (virtual)" : ""}`;
  name.textContent = `${PIECE_NAMES[p.type]}${focal}`;
  const hit = firstHit();
  if (!hit) { angles.textContent = "The light doesn't reach it. Drag it into the beam."; return; }
  const kind = hit.kind === "tir" ? "total internal reflection" : hit.kind === "reflect" ? "reflection" : hit.entering ? "refraction, into glass" : "refraction, out of glass";
  let text = `In ${hit.angleIn.toFixed(1)}° → out ${hit.angleOut.toFixed(1)}° (${kind})`;
  if (source.type === "white" && hit.kind === "refract") {
    const at = (r) => r.hits.find((h) => h.piece === state.selected - 1);
    const v = at(rays[0]), red = at(rays[rays.length - 1]);
    if (v && red) { text += ` · violet ${v.angleOut.toFixed(1)}°, red ${red.angleOut.toFixed(1)}°`; }
  }
  angles.textContent = text;
}

function refresh() {
  retrace();
  draw();
  readout();
}

/* ============================================================
   4. INPUT
   ============================================================ */
const toW = (p) => ({ x: p.x / world.scale, y: p.y / world.scale });
let drag = null;   // { kind: "move" | "turn", dx, dy, offset }

function pick(w) {
  /* The turn handle of the selected piece wins first. */
  const sel = selectedThing();
  if (sel) {
    const h = handleOf(sel);
    if (Math.hypot(w.x - h.x, w.y - h.y) < 22 / world.scale + 8) { return { k: state.selected, turn: true }; }
  }
  const list = all();
  for (let k = list.length - 1; k >= 0; k--) {
    const p = list[k];
    if (hitTest({ ...p, type: k === 0 ? "source" : p.type }, w.x, w.y, 10 / world.scale + 6)) { return { k, turn: false }; }
  }
  return null;
}

pointer(stage, {
  down(p) {
    const w = toW(p);
    const hit = pick(w);
    if (!hit) { state.selected = -1; drag = null; refresh(); return; }
    state.selected = hit.k;
    const t = all()[hit.k];
    drag = hit.turn
      ? { kind: "turn", offset: t.angle - Math.atan2(w.y - t.y, w.x - t.x) }
      : { kind: "move", dx: t.x - w.x, dy: t.y - w.y };
    refresh();
  },
  move(p, held) {
    if (!held || !drag) { return; }
    const w = toW(p);
    const t = selectedThing();
    if (!t) { return; }
    if (drag.kind === "move") {
      t.x = Math.max(0, Math.min(world.w, w.x + drag.dx));
      t.y = Math.max(0, Math.min(world.h, w.y + drag.dy));
    } else {
      t.angle = Math.atan2(w.y - t.y, w.x - t.x) + drag.offset;
    }
    state.moves++;
    refresh();
  },
  up() { if (drag) { drag = null; persist(); } }
});

function turn(by) {
  const t = selectedThing();
  if (!t) { return; }
  t.angle += by;
  state.moves++;
  refresh();
  persist();
}

function nudge(dx, dy) {
  const t = selectedThing();
  if (!t) { return; }
  t.x = Math.max(0, Math.min(world.w, t.x + dx));
  t.y = Math.max(0, Math.min(world.h, t.y + dy));
  state.moves++;
  refresh();
  persist();
}

function removeSelected() {
  if (state.selected < 1) { return; }
  pieces.splice(state.selected - 1, 1);
  state.selected = -1;
  refresh();
  persist();
}

function addPiece(type) {
  if (pieces.length >= MAX_PIECES) { pieces.shift(); }
  /* Drop it in the light's path, in the first clear spot ahead. */
  const span = Math.min(world.w, world.h);
  const spots = [0.45, 0.7, 0.25, 0.9, 0.6].map((f) => ({
    x: Math.max(60, Math.min(world.w - 60, source.x + Math.cos(source.angle) * span * f)),
    y: Math.max(60, Math.min(world.h - 60, source.y + Math.sin(source.angle) * span * f))
  }));
  const clear = (q) => pieces.every((o) => Math.hypot(o.x - q.x, o.y - q.y) > 130);
  const { x, y } = spots.find(clear) || spots[0];
  /* Lenses and the curved mirror face the light; a flat mirror
     sits at a slant so the bounce is easy to see. */
  const angle = type === "mirror" ? source.angle + Math.PI * 0.85 : type === "prism" || type === "block" ? 0 : source.angle;
  pieces.push({ type, x, y, angle, size: 1 });
  state.selected = pieces.length;
  refresh();
  persist();
}

function setLight(type) {
  source.type = type;
  for (const b of document.querySelectorAll("[data-light]")) { b.setAttribute("aria-pressed", String(b.dataset.light === type)); }
  refresh();
  persist();
}

function loadScene(name) {
  const s = scene(name, world.w, world.h);
  source = { ...s.source, size: 1 };
  pieces = s.pieces.map((p) => ({ ...p }));
  state.scene = name;
  state.selected = -1;
  for (const b of document.querySelectorAll("[data-scene]")) { b.setAttribute("aria-pressed", String(b.dataset.scene === name)); }
  for (const b of document.querySelectorAll("[data-light]")) { b.setAttribute("aria-pressed", String(b.dataset.light === source.type)); }
  refresh();
}

/* Keyboard on the focused bench. */
stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const step = e.shiftKey ? 25 : 6;
  const k = e.key.toLowerCase();
  if (k === "n") {
    state.selected = (state.selected + 1) % all().length;
    refresh();
  } else if (e.key === "ArrowLeft") { nudge(-step, 0); }
  else if (e.key === "ArrowRight") { nudge(step, 0); }
  else if (e.key === "ArrowUp") { nudge(0, -step); }
  else if (e.key === "ArrowDown") { nudge(0, step); }
  else if (k === "q") { turn(e.shiftKey ? -TURN / 5 : -TURN); }
  else if (k === "e") { turn(e.shiftKey ? TURN / 5 : TURN); }
  else if (e.key === "Delete" || e.key === "Backspace") { removeSelected(); }
  else if (k === "l") { setLight(SOURCES[(SOURCES.indexOf(source.type) + 1) % SOURCES.length]); }
  else if (e.key === "Escape") { state.selected = -1; refresh(); }
  else { return; }
  e.preventDefault();
});

$("rot-l").addEventListener("click", () => turn(-TURN));
$("rot-r").addEventListener("click", () => turn(TURN));
$("remove").addEventListener("click", removeSelected);
for (const b of document.querySelectorAll("[data-add]")) { b.addEventListener("click", () => addPiece(b.dataset.add)); }
for (const b of document.querySelectorAll("[data-light]")) { b.addEventListener("click", () => setLight(b.dataset.light)); }
for (const b of document.querySelectorAll("[data-scene]")) { b.addEventListener("click", () => { loadScene(b.dataset.scene); persist(); }); }

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  if (!ok.layout) { loadScene(ok.scene); return; }
  const sx = world.w / ok.layout.w, sy = world.h / ok.layout.h;
  const place = (p) => ({ ...p, x: p.x * sx, y: p.y * sy, size: 1 });
  source = { ...place(ok.layout.source), type: ok.layout.source.light };
  pieces = ok.layout.pieces.map(place);
  state.scene = ok.scene;
  state.selected = -1;
  for (const b of document.querySelectorAll("[data-scene]")) { b.setAttribute("aria-pressed", "false"); }
  for (const b of document.querySelectorAll("[data-light]")) { b.setAttribute("aria-pressed", String(b.dataset.light === source.type)); }
  refresh();
}

/* ============================================================
   GO
   Nothing animates, so reduced motion needs no changes here.
   ============================================================ */
fitWorld();
apply(save.get());
stage.dataset.ready = "true";
