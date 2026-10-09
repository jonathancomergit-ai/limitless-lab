/* ============================================================
   Life Lab - the rules, unit tested

   - a blinker flips back after 2 steps
   - a glider moves 1 cell diagonally after 4 steps
   - the rule parser reads "B36/S23" (and friends)
   - wrapping edges, RLE round trips, presets, resizing
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRule, ruleToString, ruleName, createBoard, get, set, population, step, neighbours,
  randomFill, parseRLE, toRLE, place, placeCentred, resizeBoard, gridFor, PATTERNS, RULE_PRESETS
} from "../../items/life-lab/life.js";

const CONWAY = parseRule("B3/S23");
const live = (b) => {
  const out = [];
  for (let y = 0; y < b.rows; y++) { for (let x = 0; x < b.cols; x++) { if (get(b, x, y)) { out.push(`${x},${y}`); } } }
  return out.sort();
};

test("a blinker flips, then flips back after 2 steps", () => {
  const b = createBoard(7, 7);
  set(b, 2, 3); set(b, 3, 3); set(b, 4, 3);       // horizontal
  const one = step(b, CONWAY);
  assert.deepEqual(live(one), ["3,2", "3,3", "3,4"]);   // vertical
  const two = step(one, CONWAY);
  assert.deepEqual(live(two), live(b));
});

test("a glider moves 1 cell diagonally after 4 steps", () => {
  let b = createBoard(12, 12);
  place(b, parseRLE(PATTERNS.glider.rle), 2, 2);
  const start = live(b);
  for (let k = 0; k < 4; k++) { b = step(b, CONWAY); }
  const moved = start.map((s) => { const [x, y] = s.split(",").map(Number); return `${x + 1},${y + 1}`; }).sort();
  assert.deepEqual(live(b), moved);
  assert.equal(population(b), 5);
});

test("a glider wraps round the edges and comes back", () => {
  let b = createBoard(10, 10);
  place(b, parseRLE(PATTERNS.glider.rle), 1, 1);
  const start = live(b);
  for (let k = 0; k < 40; k++) { b = step(b, CONWAY); }   // 10 cells x 4 steps
  assert.deepEqual(live(b), start);
});

test("the rule parser reads B36/S23", () => {
  const r = parseRule("B36/S23");
  assert.deepEqual(r.birth.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [3, 6]);
  assert.deepEqual(r.survive.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [2, 3]);
  assert.equal(ruleToString(r), "B36/S23");
  assert.equal(ruleName(r), "highlife");
});

test("the rule parser takes other spellings, and rejects junk", () => {
  assert.equal(ruleToString(parseRule("s23/b36")), "B36/S23");
  assert.equal(ruleToString(parseRule(" b2/s ")), "B2/S");
  assert.equal(ruleToString(parseRule("B/S")), "B/S");
  for (const bad of ["", "B9/S23", "B3S23", "hello", "B3/S23/X", null, 42]) {
    assert.equal(parseRule(bad), null, String(bad));
  }
  for (const p of Object.values(RULE_PRESETS)) { assert.equal(ruleToString(parseRule(p.rule)), p.rule); }
});

test("HighLife: 6 neighbours bring a cell to life, Conway doesn't", () => {
  const b = createBoard(5, 5);
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]]) { set(b, x, y); }
  assert.equal(neighbours(b, 2, 2), 6);
  assert.equal(get(step(b, parseRule("B36/S23")), 2, 2), 1);
  assert.equal(get(step(b, CONWAY), 2, 2), 0);
});

test("Seeds: every live cell dies each step", () => {
  const b = createBoard(6, 6);
  set(b, 2, 2); set(b, 3, 2);
  const n = step(b, parseRule("B2/S"));
  assert.equal(get(n, 2, 2), 0);
  assert.equal(get(n, 3, 2), 0);
  assert.ok(population(n) > 0);
});

test("step leaves the old board alone", () => {
  const b = createBoard(5, 5);
  set(b, 1, 2); set(b, 2, 2); set(b, 3, 2);
  const before = [...b.cells];
  step(b, CONWAY);
  assert.deepEqual([...b.cells], before);
});

test("edges wrap for neighbours", () => {
  const b = createBoard(5, 5);
  set(b, 4, 4);
  assert.equal(neighbours(b, 0, 0), 1);
  assert.equal(get(b, -1, -1), 1);
});

test("every preset pattern parses, and the pulsar has period 3", () => {
  for (const [id, p] of Object.entries(PATTERNS)) {
    const pat = parseRLE(p.rle);
    assert.ok(pat && pat.cells.length >= 5, id);
  }
  assert.equal(parseRLE(PATTERNS.gun.rle).cells.length, 36);
  assert.equal(parseRLE(PATTERNS.pulsar.rle).cells.length, 48);
  let b = placeCentred(createBoard(25, 25), parseRLE(PATTERNS.pulsar.rle));
  const start = live(b);
  b = step(b, CONWAY);
  assert.notDeepEqual(live(b), start);
  b = step(step(b, CONWAY), CONWAY);
  assert.deepEqual(live(b), start);
});

test("the glider gun makes gliders (population grows)", () => {
  let b = createBoard(60, 40);
  place(b, parseRLE(PATTERNS.gun.rle), 2, 2);
  const p0 = population(b);
  for (let k = 0; k < 60; k++) { b = step(b, CONWAY); }
  assert.ok(population(b) > p0 + 5, `population ${population(b)}`);
});

test("RLE round trip keeps every cell in place", () => {
  const b = randomFill(createBoard(23, 17), 0.35, 7);
  const back = createBoard(23, 17);
  place(back, parseRLE(toRLE(b)), 0, 0);
  assert.deepEqual([...back.cells], [...b.cells]);
  assert.equal(toRLE(createBoard(4, 4)), "!");
  assert.equal(parseRLE("hello"), null);
  assert.equal(parseRLE("3"), null);
});

test("random fill is seeded", () => {
  const a = randomFill(createBoard(30, 30), 0.3, 42);
  const b = randomFill(createBoard(30, 30), 0.3, 42);
  const c = randomFill(createBoard(30, 30), 0.3, 43);
  assert.deepEqual([...a.cells], [...b.cells]);
  assert.notDeepEqual([...a.cells], [...c.cells]);
  const p = population(a) / 900;
  assert.ok(p > 0.2 && p < 0.4);
});

test("resizing keeps the pattern centred", () => {
  const b = placeCentred(createBoard(21, 21), parseRLE(PATTERNS.rpent.rle));
  const big = resizeBoard(b, 41, 31);
  assert.equal(population(big), 5);
  const small = resizeBoard(b, 9, 9);
  assert.equal(population(small), 5);
  assert.equal(population(resizeBoard(b, 1, 1)) <= 1, true);
});

test("grid size fits the screen and the cell budget", () => {
  const phone = gridFor(390, 520, 10);
  assert.equal(phone.cols, 39);
  const huge = gridFor(4000, 3000, 10, 14000);
  assert.ok(huge.cols * huge.rows <= 14000);
  const tiny = gridFor(0, -5, 10);
  assert.ok(tiny.cols >= 8 && tiny.rows >= 8);
});
