/* ============================================================
   Life Lab - the rules (no DOM, unit tested)

   A board is { cols, rows, cells } where cells is a Uint8Array
   (1 = alive). The edges wrap: a glider leaving the right side
   comes back on the left, like a doughnut.

   A rule says how many live neighbours make a dead cell come
   alive (Birth) and keep a live cell alive (Survive). Conway's
   rule is "B3/S23". Written as { birth, survive }, each a
   9-long array of true/false for 0..8 neighbours.

   Patterns use the standard Life RLE text format:
     b = dead, o = alive, $ = next row, ! = end, 3o = ooo
   ============================================================ */

/* ---- rules ------------------------------------------------ */

export const RULE_PRESETS = {
  conway:   { name: "Conway",      rule: "B3/S23" },
  highlife: { name: "HighLife",    rule: "B36/S23" },
  seeds:    { name: "Seeds",       rule: "B2/S" },
  daynight: { name: "Day & Night", rule: "B3678/S34678" }
};

/* "B36/S23" -> { birth, survive }. Also takes "S23/B36" and
   lower case. Returns null for anything it can't read. */
export function parseRule(text) {
  if (typeof text !== "string") { return null; }
  const t = text.trim().toUpperCase().replace(/\s+/g, "");
  const m = t.match(/^B([0-8]*)\/S([0-8]*)$/) || t.match(/^S([0-8]*)\/B([0-8]*)$/);
  if (!m) { return null; }
  const [b, s] = t.startsWith("B") ? [m[1], m[2]] : [m[2], m[1]];
  const birth = Array(9).fill(false);
  const survive = Array(9).fill(false);
  for (const ch of b) { birth[Number(ch)] = true; }
  for (const ch of s) { survive[Number(ch)] = true; }
  return { birth, survive };
}

/* { birth, survive } -> "B36/S23" */
export function ruleToString(rule) {
  const digits = (arr) => arr.map((on, n) => (on ? String(n) : "")).join("");
  return `B${digits(rule.birth)}/S${digits(rule.survive)}`;
}

/* Which named preset a rule is, or null. */
export function ruleName(rule) {
  const s = ruleToString(rule);
  for (const [id, p] of Object.entries(RULE_PRESETS)) { if (p.rule === s) { return id; } }
  return null;
}

/* ---- boards ----------------------------------------------- */

export function createBoard(cols, rows) {
  cols = Math.max(1, Math.floor(cols));
  rows = Math.max(1, Math.floor(rows));
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

const wrap = (v, n) => ((v % n) + n) % n;

export function get(board, x, y) {
  return board.cells[wrap(y, board.rows) * board.cols + wrap(x, board.cols)];
}

export function set(board, x, y, alive = 1) {
  board.cells[wrap(y, board.rows) * board.cols + wrap(x, board.cols)] = alive ? 1 : 0;
}

export function population(board) {
  let n = 0;
  for (let i = 0; i < board.cells.length; i++) { n += board.cells[i]; }
  return n;
}

export function clear(board) { board.cells.fill(0); return board; }

/* Live neighbours of (x, y), edges wrapping. */
export function neighbours(board, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) { n += get(board, x + dx, y + dy); }
    }
  }
  return n;
}

/* One generation. Returns a NEW board (the old one is untouched).
   Pass `into` (same size) to reuse memory. */
export function step(board, rule, into = null) {
  const { cols, rows, cells } = board;
  const out = into && into.cols === cols && into.rows === rows ? into : createBoard(cols, rows);
  const next = out.cells;
  const birth = rule.birth, survive = rule.survive;
  for (let y = 0; y < rows; y++) {
    const up = ((y + rows - 1) % rows) * cols;
    const mid = y * cols;
    const down = ((y + 1) % rows) * cols;
    for (let x = 0; x < cols; x++) {
      const l = (x + cols - 1) % cols;
      const r = (x + 1) % cols;
      const n = cells[up + l] + cells[up + x] + cells[up + r] +
                cells[mid + l] +                cells[mid + r] +
                cells[down + l] + cells[down + x] + cells[down + r];
      next[mid + x] = (cells[mid + x] ? survive[n] : birth[n]) ? 1 : 0;
    }
  }
  return out;
}

/* Fill with random cells. `density` 0..1. Seeded, so the same
   seed gives the same board. */
export function randomFill(board, density = 0.3, seed = 1) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < board.cells.length; i++) { board.cells[i] = rnd() < density ? 1 : 0; }
  return board;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- patterns (RLE) --------------------------------------- */

export const PATTERNS = {
  glider:   { name: "Glider",      rle: "bo$2bo$3o!" },
  gun:      { name: "Glider gun",  rle: "24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!" },
  pulsar:   { name: "Pulsar",      rle: "2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!" },
  rpent:    { name: "R-pentomino", rle: "b2o$2o$bo!" },
  ship:     { name: "Spaceship",   rle: "bo2bo$o$o3bo$4o!" }
};

/* RLE text -> { width, height, cells: [[x, y], ...] }.
   Returns null if the text isn't valid RLE. */
export function parseRLE(text) {
  if (typeof text !== "string") { return null; }
  const body = text.split("\n").filter((l) => !/^\s*(#|x\s*=)/.test(l)).join("").replace(/\s+/g, "");
  if (!/^[0-9bo$]*!?$/.test(body)) { return null; }
  const cells = [];
  let x = 0, y = 0, count = "", width = 0;
  for (const ch of body) {
    if (ch >= "0" && ch <= "9") { count += ch; continue; }
    const n = count ? Number(count) : 1;
    count = "";
    if (n > 100000) { return null; }
    if (ch === "b") { x += n; }
    else if (ch === "o") {
      for (let k = 0; k < n; k++) { cells.push([x + k, y]); }
      x += n;
    } else if (ch === "$") { width = Math.max(width, x); x = 0; y += n; }
    else if (ch === "!") { break; }
    width = Math.max(width, x);
  }
  if (count) { return null; }
  return { width, height: cells.length ? Math.max(...cells.map((c) => c[1])) + 1 : 0, cells };
}

/* Board -> RLE text, trimmed to rows/columns that hold life
   only at the ends (so positions are kept exactly). */
export function toRLE(board) {
  const { cols, rows, cells } = board;
  let lastRow = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) { if (cells[y * cols + x]) { lastRow = y; break; } }
  }
  let out = "";
  let blankRows = 0;
  const run = (n, ch) => (n > 1 ? `${n}${ch}` : ch);
  for (let y = 0; y <= lastRow; y++) {
    let line = "";
    let x = 0;
    while (x < cols) {
      const v = cells[y * cols + x];
      let n = 1;
      while (x + n < cols && cells[y * cols + x + n] === v) { n++; }
      if (v || x + n < cols) { line += run(n, v ? "o" : "b"); }   // drop trailing dead
      x += n;
    }
    if (y > 0) { blankRows++; }
    if (line || y === lastRow) {
      if (y > 0) { out += run(blankRows, "$"); }
      out += line;
      blankRows = 0;
    }
  }
  return out + "!";
}

/* Stamp a pattern with its top-left at (x0, y0). Wraps. */
export function place(board, pattern, x0, y0) {
  for (const [x, y] of pattern.cells) { set(board, x0 + x, y0 + y, 1); }
  return board;
}

/* Stamp a pattern in the middle of the board. */
export function placeCentred(board, pattern) {
  const x0 = Math.floor((board.cols - pattern.width) / 2);
  const y0 = Math.floor((board.rows - pattern.height) / 2);
  return place(board, pattern, x0, y0);
}

/* Copy a board into another size, keeping it centred
   (cells that no longer fit are dropped). */
export function resizeBoard(board, cols, rows) {
  const out = createBoard(cols, rows);
  const ox = Math.floor((out.cols - board.cols) / 2);
  const oy = Math.floor((out.rows - board.rows) / 2);
  for (let y = 0; y < board.rows; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= out.rows) { continue; }
    for (let x = 0; x < board.cols; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= out.cols) { continue; }
      out.cells[ty * out.cols + tx] = board.cells[y * board.cols + x];
    }
  }
  return out;
}

/* Grid size for a stage: cells about `cell` px, never tiny. */
export function gridFor(width, height, cell = 10, maxCells = 14000) {
  let c = Math.max(4, cell);
  let cols = Math.max(8, Math.floor(width / c));
  let rows = Math.max(8, Math.floor(height / c));
  while (cols * rows > maxCells) {
    c += 1;
    cols = Math.max(8, Math.floor(width / c));
    rows = Math.max(8, Math.floor(height / c));
  }
  return { cols, rows };
}
