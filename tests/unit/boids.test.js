/* ============================================================
   Boids Flocking - the rules, unit tested

   Small hand-made setups, each checking a rule pushes the
   right way:
   - separation: away from a bird that's too close
   - alignment: turn to match the neighbours' heading
   - cohesion: towards the middle of the neighbours
   - a weight of 0 switches a rule off
   - flee a predator, steer away from a wall
   Plus: the grid finds exactly the same neighbours as checking
   every pair, edges wrap, and a random flock lines up.
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARAMS, createFlock, wrapDelta, buildGrid, neighbours, ruleDirections, steer, forces, stepFlock, order, seeded
} from "../../items/boids/flock.js";

/* A flock from a list of [x, y, vx, vy]. */
function flockOf(birds, w = 400, h = 400) {
  const f = createFlock(birds.length, w, h, seeded(1));
  birds.forEach(([x, y, vx, vy], i) => { f.x[i] = x; f.y[i] = y; f.vx[i] = vx; f.vy[i] = vy; });
  return f;
}
const only = (o) => ({ ...PARAMS, separation: 0, alignment: 0, cohesion: 0, ...o });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

test("separation pushes away from a bird that's too close", () => {
  /* Bird 0 heading up; a bird 10 px to its right. */
  const f = flockOf([[200, 200, 0, -100], [210, 200, 0, -100]]);
  const { sep, total } = forces(f, 0, [1], only({ separation: 1 }));
  assert.ok(sep[0] < 0, "pushed left, away from it");
  assert.ok(Math.abs(sep[1]) < Math.abs(sep[0]) * 2);
  assert.deepEqual(total, sep);
  /* Further than half the vision radius: no push. */
  const g = flockOf([[200, 200, 0, -100], [240, 200, 0, -100]]);
  assert.deepEqual(forces(g, 0, [1], only({ separation: 1 })).sep.map(Math.abs), [0, 0]);
});

test("separation: the closer bird pushes harder", () => {
  const f = flockOf([[200, 200, 0, 0], [205, 200, 0, 0], [200, 180, 0, 0]]);
  const { sep } = ruleDirections(f, 0, [1, 2], 50);
  /* 5 px to the right vs 20 px above: mostly pushed left. */
  assert.ok(sep[0] < 0 && sep[1] > 0);
  assert.ok(Math.abs(sep[0]) > 3 * Math.abs(sep[1]));
});

test("alignment turns a bird to fly the way its neighbours fly", () => {
  /* Bird 0 heads right; two neighbours head straight down (+y). */
  const f = flockOf([[200, 200, 100, 0], [230, 200, 0, 100], [200, 230, 0, 100]]);
  const { ali } = forces(f, 0, [1, 2], only({ alignment: 1 }));
  assert.ok(ali[1] > 0, "turned towards down");
  assert.ok(ali[0] < 0, "and eased off going right");
  /* Already lined up: nothing to do. */
  const g = flockOf([[200, 200, 120, 0], [230, 200, 120, 0]]);
  const a = forces(g, 0, [1], only({ alignment: 1 })).ali;
  assert.ok(Math.hypot(...a) < 1e-6);
});

test("cohesion steers towards the middle of the neighbours", () => {
  /* Neighbours above-left and below-left: the middle is straight left. */
  const f = flockOf([[200, 200, 0, 0], [170, 180, 0, 0], [170, 220, 0, 0]]);
  const { coh } = forces(f, 0, [1, 2], only({ cohesion: 1 }));
  assert.ok(coh[0] < 0);
  assert.ok(Math.abs(coh[1]) < 1e-6);
});

test("a rule with weight 0 does nothing; no neighbours = no rule forces", () => {
  const f = flockOf([[200, 200, 50, 0], [205, 210, 0, 80]]);
  const r = forces(f, 0, [1], only({}));
  for (const k of ["sep", "ali", "coh", "flee", "avoid", "total"]) { assert.ok(Math.hypot(...r[k]) === 0, k); }
  const alone = forces(f, 0, [], PARAMS);
  assert.ok(Math.hypot(...alone.total) === 0);
});

test("steering force is capped", () => {
  const s = steer([1, 0], -120, 0, 120, 100);   // wants +240, allowed 100
  assert.ok(Math.abs(Math.hypot(...s) - 100) < 1e-9);
  assert.ok(s[0] > 0);
});

test("birds flee a predator and steer away from a wall", () => {
  const f = flockOf([[200, 200, 0, -100]]);
  const flee = forces(f, 0, [], only({}), { predators: [{ x: 230, y: 200 }] }).flee;
  assert.ok(flee[0] < 0, "away from a predator on the right");
  const avoid = forces(f, 0, [], only({}), { obstacles: [{ x: 200, y: 175, r: 10 }] }).avoid;
  assert.ok(avoid[1] > 0, "away from a wall just ahead (above)");
  /* A far-off predator is ignored. */
  assert.deepEqual(forces(f, 0, [], only({}), { predators: [{ x: 390, y: 10 }] }).flee.map(Math.abs), [0, 0]);
});

test("edges wrap: a bird near the right edge sees one near the left", () => {
  assert.equal(wrapDelta(390, 400), -10);
  assert.equal(wrapDelta(-395, 400), 5);
  const f = flockOf([[395, 100, 0, 0], [5, 100, 0, 0]]);
  const grid = buildGrid(f, 50);
  assert.deepEqual(neighbours(f, grid, 0, 50), [1]);
  /* The neighbour across the edge is to the RIGHT, so cohesion goes right. */
  assert.ok(ruleDirections(f, 0, [1], 50).coh[0] > 0);
});

test("the grid finds exactly the neighbours a brute-force check does", () => {
  for (const [w, h, vision] of [[640, 480, 50], [390, 600, 120], [100, 90, 60]]) {
    const f = createFlock(300, w, h, seeded(42));
    const grid = buildGrid(f, vision);
    for (let i = 0; i < f.n; i += 7) {
      const fast = neighbours(f, grid, i, vision).slice().sort((a, b) => a - b);
      const slow = [];
      for (let j = 0; j < f.n; j++) {
        if (j !== i && Math.hypot(wrapDelta(f.x[j] - f.x[i], w), wrapDelta(f.y[j] - f.y[i], h)) < vision) { slow.push(j); }
      }
      assert.deepEqual(fast, slow, `bird ${i} in ${w}x${h}`);
    }
  }
});

test("a random flock lines up; with alignment and cohesion off, it doesn't", () => {
  const run = (p) => {
    const f = createFlock(200, 500, 500, seeded(7));
    const o0 = order(f);
    for (let k = 0; k < 600; k++) { stepFlock(f, p, 1 / 60); }
    return [o0, order(f)];
  };
  const [before, after] = run(PARAMS);
  assert.ok(before < 0.25, `starts messy (${before})`);
  assert.ok(after > 0.6, `ends lined up (${after})`);
  const [, loose] = run({ ...PARAMS, alignment: 0, cohesion: 0 });
  assert.ok(loose < 0.4, `no alignment stays messy (${loose})`);
});

test("speeds stay between the floor and the top speed; birds stay in the world", () => {
  const f = createFlock(150, 300, 200, seeded(3));
  const p = { ...PARAMS, speed: 90 };
  const world = { predators: [{ x: 150, y: 100 }], obstacles: [{ x: 60, y: 60, r: 12 }] };
  for (let k = 0; k < 200; k++) { stepFlock(f, p, 1 / 60, world); }
  for (let i = 0; i < f.n; i++) {
    const s = Math.hypot(f.vx[i], f.vy[i]);
    assert.ok(s <= 90 + 1e-3 && s >= 90 * 0.4 - 1e-3, `speed ${s}`);
    assert.ok(f.x[i] >= 0 && f.x[i] < 300 && f.y[i] >= 0 && f.y[i] < 200);
  }
  const all = Array.from(f.x, (x, i) => Math.hypot(x - 60, f.y[i] - 60));
  assert.ok(all.every((d) => d >= 12 - 0.01), "nobody inside the wall");
});

test("order: all one way = 1, two opposite = 0", () => {
  assert.ok(Math.abs(order(flockOf([[0, 0, 1, 0], [5, 5, 3, 0]])) - 1) < 1e-6);
  assert.ok(order(flockOf([[0, 0, 1, 0], [5, 5, -1, 0]])) < 1e-6);
  assert.ok(dot([1, 0], [0, 1]) === 0);
});
