/* ============================================================
   Sorting Race - the algorithms, unit tested

   - every algorithm sorts random, sorted, reversed and
     duplicate arrays correctly
   - the moves they report are real (indices in range, a swap
     really swaps), and the counters add up
   - known compare counts, and starting orders
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALGOS, ORDERS, createLane, tick, sortWith, isSorted, makeBars, mulberry32 } from "../../items/sorting-race/sorts.js";

function cases() {
  const rnd = mulberry32(99);
  const random = Array.from({ length: 60 }, () => Math.floor(rnd() * 1000));
  return {
    random,
    sorted: Array.from({ length: 50 }, (_, i) => i),
    reversed: Array.from({ length: 50 }, (_, i) => 50 - i),
    duplicates: Array.from({ length: 64 }, () => Math.floor(rnd() * 4)),
    allSame: Array(20).fill(7),
    empty: [],
    one: [5],
    two: [2, 1]
  };
}

test("every algorithm sorts random, sorted, reversed and duplicate arrays", () => {
  for (const algo of ALGOS) {
    for (const [name, input] of Object.entries(cases())) {
      const lane = sortWith(algo, input);
      const want = input.slice().sort((x, y) => x - y);
      assert.deepEqual(lane.a, want, `${algo} on ${name}`);
      assert.ok(lane.done);
    }
  }
});

test("lots of random arrays, every size from 0 to 40", () => {
  const rnd = mulberry32(5);
  for (const algo of ALGOS) {
    for (let n = 0; n <= 40; n++) {
      const input = Array.from({ length: n }, () => Math.floor(rnd() * 10));
      assert.ok(isSorted(sortWith(algo, input).a), `${algo} n=${n}`);
    }
  }
});

test("the moves are real: indices in range, counters add up", () => {
  for (const algo of ALGOS) {
    const input = makeBars(30, "random", 3);
    const lane = createLane(algo, input);
    let compares = 0, swaps = 0;
    for (let m = tick(lane); m; m = tick(lane)) {
      assert.ok(m.i >= 0 && m.i < 30, `${algo}: i out of range`);
      if (m.j !== undefined) { assert.ok(m.j >= 0 && m.j < 30, `${algo}: j out of range`); }
      if (m.op === "compare") { compares++; } else { swaps++; assert.ok(m.op === "swap" || m.op === "write"); }
    }
    assert.equal(lane.compares, compares);
    assert.equal(lane.swaps, swaps);
    assert.equal(lane.moves, compares + swaps);
    assert.equal(tick(lane), null, "nothing after done");
    /* The lane sorted its OWN copy. */
    assert.ok(!isSorted(input));
  }
});

test("known counts: bubble and insertion on sorted input look once and stop", () => {
  const sorted = Array.from({ length: 20 }, (_, i) => i);
  assert.equal(sortWith("bubble", sorted).compares, 19);
  assert.equal(sortWith("bubble", sorted).swaps, 0);
  assert.equal(sortWith("insertion", sorted).compares, 19);
  /* Selection always looks at every pair: n(n-1)/2. */
  assert.equal(sortWith("selection", sorted).compares, 190);
  /* Reversed: bubble and insertion swap every pair. */
  const rev = sorted.slice().reverse();
  assert.equal(sortWith("bubble", rev).swaps, 190);
  assert.equal(sortWith("insertion", rev).swaps, 190);
});

test("the fast sorts really are faster on 200 random bars", () => {
  const bars = makeBars(200, "random", 8);
  const moves = Object.fromEntries(ALGOS.map((a) => [a, sortWith(a, bars).moves]));
  for (const fast of ["merge", "quick", "heap"]) {
    for (const slow of ["bubble", "insertion", "selection"]) {
      assert.ok(moves[fast] < moves[slow] / 3, `${fast} ${moves[fast]} vs ${slow} ${moves[slow]}`);
    }
  }
});

test("starting orders", () => {
  for (const order of ORDERS) {
    const a = makeBars(40, order, 2);
    assert.equal(a.length, 40);
    assert.ok(a.every((v) => v >= 1 && v <= 40));
    assert.deepEqual(makeBars(40, order, 2), a, `${order} is seeded`);
  }
  assert.deepEqual(makeBars(5, "reversed"), [5, 4, 3, 2, 1]);
  assert.ok(!isSorted(makeBars(40, "nearly", 2)));
  assert.ok(new Set(makeBars(40, "few", 2)).size <= 4);
  assert.deepEqual(makeBars(40, "random", 4).slice().sort((x, y) => x - y), Array.from({ length: 40 }, (_, i) => i + 1));
});
