/* ============================================================
   Life Lab - main script

   The rules are in life.js (step, rule parser, patterns, RLE).
   This file runs the clock, paints the board, and listens.

   Sections:
     1. save       board, rule, speed, tool
     2. state      the board and what the player is doing
     3. loop       generations (update) + paint (draw)
     4. input      tap / drag, keys, buttons, rule boxes
   ============================================================ */

import { bootItem, exposeForTests, itemSlug } from "../../kit/item.js";
import { createCanvas } from "../../kit/canvas.js";
import { startLoop } from "../../kit/loop.js";
import { pointer, createKeys } from "../../kit/input.js";
import { createSave } from "../../kit/save.js";
import { mountSavePanel } from "../../kit/save-ui.js";
import { reducedMotion } from "../../kit/motion.js";
import {
  parseRule, ruleToString, ruleName, createBoard, get, set, population, step, clear,
  randomFill, parseRLE, toRLE, place, placeCentred, resizeBoard, gridFor, PATTERNS, RULE_PRESETS
} from "./life.js";

bootItem();

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const playBtn = $("play");
const msg = $("msg");

const TOOLS = ["draw", "erase"];
const calm = reducedMotion();
const MAX_STEPS_PER_FRAME = 4;

/* ============================================================
   1. SAVE
   ============================================================ */
const DEFAULTS = { board: null, gen: 0, rule: "B3/S23", speed: calm ? 3 : 10, tool: "draw" };

function validate(d) {
  if (!parseRule(d.rule)) { return "The rule in that save can't be read."; }
  if (!Number.isInteger(d.speed) || d.speed < 1 || d.speed > 30) { return "The speed in that save is out of range."; }
  if (!TOOLS.includes(d.tool)) { return "Unknown tool in that save."; }
  if (!Number.isInteger(d.gen) || d.gen < 0) { return "The generation in that save is broken."; }
  if (d.board !== null) {
    const b = d.board;
    if (!b || typeof b !== "object" || !Number.isInteger(b.cols) || !Number.isInteger(b.rows) ||
        b.cols < 1 || b.rows < 1 || b.cols > 2000 || b.rows > 2000 || typeof b.rle !== "string") {
      return "The board in that save is broken.";
    }
    if (b.rle.length > 400_000 || !parseRLE(b.rle)) { return "The board in that save can't be read."; }
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
    board: { cols: board.cols, rows: board.rows, rle: toRLE(board) },
    gen: state.gen,
    rule: ruleToString(rule),
    speed: state.speed,
    tool: state.tool
  });
}

/* ============================================================
   2. STATE
   ============================================================ */
const state = {
  gen: 0,
  pop: 0,
  speed: DEFAULTS.speed,     // generations per second
  tool: DEFAULTS.tool,
  cursor: null,              // keyboard cursor, in cells
  pattern: null              // last pattern dropped in (for the button highlight)
};

let board = createBoard(40, 40);
let spare = createBoard(40, 40);
let rule = parseRule(DEFAULTS.rule);
let clock = 0;
let painting = null;         // last cell painted while dragging
let loop = null;

const view = createCanvas(stage, { onResize: () => { fitBoard(); draw(); } });
const ctx = view.ctx;

/* Cells about 8-11 px: the glider gun (36 wide) fits a 360 px phone. */
function cellTarget() { return Math.max(7, Math.min(11, view.width / 46)); }

function fitBoard() {
  const { cols, rows } = gridFor(view.width, view.height, cellTarget());
  if (cols === board.cols && rows === board.rows) { return false; }
  board = resizeBoard(board, cols, rows);
  spare = createBoard(cols, rows);
  if (state.cursor) {
    state.cursor = { x: Math.min(cols - 1, state.cursor.x), y: Math.min(rows - 1, state.cursor.y) };
  }
  state.pop = population(board);
  return true;
}

exposeForTests({
  get gen() { return state.gen; },
  get population() { return state.pop; },
  get rule() { return ruleToString(rule); },
  get tool() { return state.tool; },
  get speed() { return state.speed; },
  get grid() { return [board.cols, board.rows]; },
  get running() { return Boolean(loop) && !loop.paused; }
});

/* ============================================================
   3. LOOP
   ============================================================ */
function advance() {
  const next = step(board, rule, spare);
  spare = board;
  board = next;
  state.gen += 1;
  state.pop = population(board);
}

function update(dt) {
  clock += dt * state.speed;
  const n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(clock));
  clock = Math.min(clock - n, 1);
  for (let k = 0; k < n; k++) { advance(); }
}

const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const C = {
  bg: color("--bg"), bg2: color("--bg-2"), line: color("--line"), cyan: color("--cyan"),
  amber: color("--amber"), text: color("--text"), dim: color("--text-dim")
};

function draw() {
  const { cols, rows, cells } = board;
  const cw = view.width / cols, ch = view.height / rows;
  ctx.fillStyle = C.bg2;
  ctx.fillRect(0, 0, view.width, view.height);

  /* Faint grid lines, so you can see where to tap. */
  if (cw >= 6) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cols; x++) { const px = Math.round(x * cw) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, view.height); }
    for (let y = 1; y < rows; y++) { const py = Math.round(y * ch) + 0.5; ctx.moveTo(0, py); ctx.lineTo(view.width, py); }
    ctx.stroke();
  }

  ctx.fillStyle = C.cyan;
  const pad = cw > 5 ? 1 : 0;
  for (let y = 0; y < rows; y++) {
    const y0 = Math.round(y * ch), y1 = Math.round((y + 1) * ch);
    for (let x = 0; x < cols; x++) {
      if (!cells[y * cols + x]) { continue; }
      const x0 = Math.round(x * cw), x1 = Math.round((x + 1) * cw);
      ctx.fillRect(x0 + pad, y0 + pad, x1 - x0 - pad, y1 - y0 - pad);
    }
  }

  /* An empty board still says something (and is never blank). */
  if (state.pop === 0) {
    ctx.fillStyle = C.dim;
    ctx.font = "600 15px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Empty board: tap to draw cells", view.width / 2, view.height / 2 + 34);
  }

  /* Keyboard cursor, only while the board has focus. */
  if (state.cursor && document.activeElement === stage) {
    ctx.strokeStyle = state.tool === "erase" ? C.amber : C.text;
    ctx.lineWidth = 2;
    ctx.strokeRect(state.cursor.x * cw - 1, state.cursor.y * ch - 1, cw + 2, ch + 2);
  }

  hud();
}

function hud() {
  $("gen").textContent = String(state.gen);
  $("pop").textContent = String(state.pop);
}

/* ============================================================
   4. INPUT
   ============================================================ */
const toCell = (p) => ({
  x: Math.max(0, Math.min(board.cols - 1, Math.floor((p.x / view.width) * board.cols))),
  y: Math.max(0, Math.min(board.rows - 1, Math.floor((p.y / view.height) * board.rows)))
});

/* Paint every cell on the line from the last cell to this one,
   so a fast drag leaves no gaps. */
function paintTo(c) {
  const from = painting || c;
  const n = Math.max(Math.abs(c.x - from.x), Math.abs(c.y - from.y), 1);
  const alive = state.tool === "draw" ? 1 : 0;
  for (let k = 0; k <= n; k++) {
    set(board, Math.round(from.x + ((c.x - from.x) * k) / n), Math.round(from.y + ((c.y - from.y) * k) / n), alive);
  }
  painting = c;
  state.pop = population(board);
  if (!loop || loop.paused) { draw(); }
}

pointer(stage, {
  down(p) { painting = null; paintTo(toCell(p)); },
  move(p, held) { if (held && painting) { paintTo(toCell(p)); } },
  up() { if (painting) { painting = null; persist(); } }
});

/* Keyboard on the focused board: a cursor that flips cells. */
stage.addEventListener("focus", () => {
  if (!state.cursor) { state.cursor = { x: Math.floor(board.cols / 2), y: Math.floor(board.rows / 2) }; }
  draw();
});
stage.addEventListener("blur", () => draw());

stage.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const c = state.cursor || { x: Math.floor(board.cols / 2), y: Math.floor(board.rows / 2) };
  const d = e.shiftKey ? 5 : 1;
  const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
  if (moves[e.key]) {
    const [dx, dy] = moves[e.key];
    state.cursor = {
      x: (c.x + dx + board.cols) % board.cols,
      y: (c.y + dy + board.rows) % board.rows
    };
  } else if (e.key === " " || e.key === "Enter") {
    state.cursor = c;
    set(board, c.x, c.y, get(board, c.x, c.y) ? 0 : 1);
    state.pop = population(board);
    persist();
  } else { return; }
  e.preventDefault();
  draw();
});

const keys = createKeys({
  play: ["KeyP"], next: ["KeyN"], clear: ["KeyX"], random: ["KeyR"], draw: ["KeyD"], erase: ["KeyE"]
});
keys.on("play", () => togglePlay());
keys.on("next", () => doStep());
keys.on("clear", () => doClear());
keys.on("random", () => doRandom());
keys.on("draw", () => setTool("draw"));
keys.on("erase", () => setTool("erase"));

function togglePlay() {
  loop.toggle();
  if (loop.paused) { persist(); }
}

function doStep() {
  if (!loop.paused) { loop.pause(); }
  advance();
  draw();
  persist();
}

function doClear() {
  clear(board);
  state.gen = 0;
  state.pop = 0;
  state.pattern = null;
  syncPatternButtons();
  persist();
  draw();
}

let seed = (Date.now() % 100000) + 1;
function doRandom() {
  randomFill(board, 0.28, seed++);
  state.gen = 0;
  state.pop = population(board);
  state.pattern = null;
  syncPatternButtons();
  persist();
  draw();
}

function dropPattern(id) {
  const pat = parseRLE(PATTERNS[id].rle);
  clear(board);
  if (id === "gun") {
    /* Top-left, so its gliders have the whole board to fly across. */
    place(board, pat, Math.max(1, Math.floor((board.cols - pat.width) / 6)), Math.max(5, Math.floor(board.rows * 0.12)));
  } else if (id === "glider" || id === "ship") {
    place(board, pat, 3, Math.floor((board.rows - pat.height) / 2) - (id === "glider" ? 6 : 0));
    if (id === "ship") {
      /* A spaceship flies left: start it on the right. */
      clear(board);
      place(board, pat, board.cols - pat.width - 4, Math.floor((board.rows - pat.height) / 2));
    }
  } else {
    placeCentred(board, pat);
  }
  state.gen = 0;
  state.pop = population(board);
  state.pattern = id;
  syncPatternButtons();
  persist();
  draw();
}

function setTool(t) {
  state.tool = t;
  painting = null;
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === t)); }
  persist();
  draw();
}

function syncPatternButtons() {
  for (const b of document.querySelectorAll("[data-pattern]")) { b.setAttribute("aria-pressed", String(b.dataset.pattern === state.pattern)); }
}

/* ---- the rule editor: two rows of 9 boxes ---------------- */
function makeBoxes(host, key) {
  for (let n = 0; n <= 8; n++) {
    const label = document.createElement("label");
    label.className = "ll-box";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.kind = key;
    input.dataset.n = String(n);
    input.setAttribute("aria-label", `${key === "birth" ? "Born" : "Survives"} with ${n} neighbour${n === 1 ? "" : "s"}`);
    const face = document.createElement("span");
    face.textContent = String(n);
    face.setAttribute("aria-hidden", "true");
    label.append(input, face);
    host.append(label);
    input.addEventListener("change", () => {
      rule[key][n] = input.checked;
      syncRule();
      persist();
    });
  }
}
makeBoxes($("birth"), "birth");
makeBoxes($("survive"), "survive");

function syncRule() {
  for (const input of document.querySelectorAll(".ll-box input")) {
    input.checked = rule[input.dataset.kind][Number(input.dataset.n)];
  }
  $("rule-out").textContent = ruleToString(rule);
  const id = ruleName(rule);
  for (const b of document.querySelectorAll("[data-rule]")) { b.setAttribute("aria-pressed", String(b.dataset.rule === id)); }
}

function setRule(id) {
  rule = parseRule(RULE_PRESETS[id].rule);
  syncRule();
  persist();
}

for (const b of document.querySelectorAll("[data-tool]")) { b.addEventListener("click", () => setTool(b.dataset.tool)); }
for (const b of document.querySelectorAll("[data-pattern]")) { b.addEventListener("click", () => dropPattern(b.dataset.pattern)); }
for (const b of document.querySelectorAll("[data-rule]")) { b.addEventListener("click", () => setRule(b.dataset.rule)); }
playBtn.addEventListener("click", togglePlay);
$("step").addEventListener("click", doStep);
$("clear").addEventListener("click", doClear);
$("random").addEventListener("click", doRandom);

$("speed").addEventListener("input", (e) => {
  state.speed = Math.max(1, Math.min(30, Math.round(Number(e.target.value))));
  syncSpeed();
  persist();
});
function syncSpeed() {
  $("speed").value = String(state.speed);
  $("speed-out").textContent = `${state.speed} gen/s`;
}

/* Load a whole save (start, import, delete). */
function apply(d) {
  const ok = validate(d) === true ? d : structuredClone(DEFAULTS);
  rule = parseRule(ok.rule);
  state.speed = ok.speed;
  state.tool = ok.tool;
  state.gen = ok.gen;
  state.pattern = null;
  if (ok.board) {
    const saved = createBoard(ok.board.cols, ok.board.rows);
    place(saved, parseRLE(ok.board.rle), 0, 0);
    board = resizeBoard(saved, board.cols, board.rows);
  } else {
    /* First visit: something to watch straight away. */
    dropPattern("gun");
    state.gen = 0;
  }
  state.pop = population(board);
  for (const b of document.querySelectorAll("[data-tool]")) { b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool)); }
  syncPatternButtons();
  syncRule();
  syncSpeed();
  draw();
}

/* ============================================================
   GO
   Reduced motion: starts paused, and slow (3 gen/s).
   ============================================================ */
fitBoard();
apply(save.get());
loop = startLoop({
  update,
  draw,
  startPaused: calm,
  onPauseChange(paused, reason) {
    playBtn.textContent = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-pressed", String(!paused));
    msg.hidden = !paused || reason !== "user";
  }
});
playBtn.textContent = loop.paused ? "Play" : "Pause";
playBtn.setAttribute("aria-pressed", String(!loop.paused));
msg.hidden = !loop.paused;

stage.dataset.ready = "true";
