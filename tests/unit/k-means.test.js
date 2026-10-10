/* ============================================================
   k-Means Clustering - the algorithm, unit tested

   - finds the obvious 3 groups on 3 far-apart blobs
   - the total distance (spread) never goes up between steps
   - seeded starts, empty groups, the elbow, presets
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRun, addToRun, stacked, step, runToEnd, spread, sizes, elbow, preset, initCentres, nearest, mulberry32, PRESETS
} from "../../items/k-means/kmeans.js";

function farBlobs(seed = 3) {
  const rnd = mulberry32(seed);
  const pts = [], truth = [];
  [[0.15, 0.15], [0.85, 0.2], [0.5, 0.85]].forEach(([cx, cy], g) => {
    for (let k = 0; k < 40; k++) {
      pts.push({ x: cx + (rnd() - 0.5) * 0.1, y: cy + (rnd() - 0.5) * 0.1 });
      truth.push(g);
    }
  });
  return { pts, truth };
}

test("finds the obvious 3 groups on 3 far-apart blobs", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { pts, truth } = farBlobs(seed);
    const run = runToEnd(createRun(pts, 3, seed));
    assert.ok(run.done, `seed ${seed} never settled`);
    /* Each true blob is entirely one group, and the groups differ. */
    const label = [0, 1, 2].map((g) => {
      const mine = [...run.assign].filter((_, i) => truth[i] === g);
      assert.ok(mine.every((j) => j === mine[0]), `seed ${seed}: blob ${g} was split`);
      return mine[0];
    });
    assert.equal(new Set(label).size, 3, `seed ${seed}: two blobs were merged`);
    assert.deepEqual(sizes(run).sort(), [40, 40, 40]);
  }
});

test("the total distance never goes up between steps", () => {
  for (const name of PRESETS) {
    for (const k of [2, 3, 5, 8]) {
      const run = createRun(preset(name, 11), k, k * 7);
      let last = spread(run);
      for (let s = 0; s < 200 && !run.done; s++) {
        step(run);
        const now = spread(run);
        assert.ok(now <= last + 1e-12, `${name} k=${k}: went up at step ${s}: ${last} -> ${now}`);
        last = now;
      }
      assert.ok(run.done, `${name} k=${k} never settled`);
    }
  }
});

test("steps alternate: assign, then move", () => {
  const run = createRun(preset("blobs3"), 3, 1);
  assert.equal(run.phase, "assign");
  assert.ok([...run.assign].every((j) => j === -1));
  step(run);
  assert.equal(run.phase, "move");
  assert.ok([...run.assign].every((j) => j >= 0 && j < 3));
  const before = run.centres.map((c) => ({ ...c }));
  step(run);
  assert.equal(run.phase, "assign");
  assert.equal(run.steps, 2);
  assert.notDeepEqual(run.centres, before);
  /* Trails remember where each centre has been. */
  assert.ok(run.trails.some((t) => t.length === 2));
});

test("after a move, each centre is the mean of its points", () => {
  const run = createRun(preset("blobs5"), 5, 4);
  step(run); step(run);
  run.centres.forEach((c, j) => {
    const mine = run.points.filter((_, i) => run.assign[i] === j);
    if (!mine.length) { return; }
    const mx = mine.reduce((s, p) => s + p.x, 0) / mine.length;
    const my = mine.reduce((s, p) => s + p.y, 0) / mine.length;
    assert.ok(Math.abs(c.x - mx) < 1e-12 && Math.abs(c.y - my) < 1e-12);
  });
});

test("the seeded start can be replayed", () => {
  const pts = preset("smiley");
  assert.deepEqual(initCentres(pts, 4, 9), initCentres(pts, 4, 9));
  assert.notDeepEqual(initCentres(pts, 4, 9), initCentres(pts, 4, 10));
  const a = runToEnd(createRun(pts, 4, 9)), b = runToEnd(createRun(pts, 4, 9));
  assert.deepEqual([...a.assign], [...b.assign]);
});

test("odd cases: no points, fewer points than k, all points the same", () => {
  const empty = runToEnd(createRun([], 3, 1));
  assert.ok(empty.done);
  assert.equal(spread(empty), 0);
  const two = runToEnd(createRun([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], 4, 1));
  assert.ok(two.done);
  assert.equal(spread(two), 0);
  const same = runToEnd(createRun(Array.from({ length: 10 }, () => ({ x: 0.5, y: 0.5 })), 3, 1));
  assert.ok(same.done);
  assert.equal(spread(same), 0);
});

test("the elbow: spread falls as k goes up, with a bend at the true k", () => {
  const pts = farBlobs(5).pts;
  const e = elbow(pts, 8, 1);
  assert.equal(e.length, 8);
  for (let k = 1; k < 8; k++) { assert.ok(e[k] <= e[k - 1] + 1e-9, `k=${k + 1} worse than k=${k}`); }
  /* Big drops up to 3, small ones after. */
  assert.ok(e[1] < e[0] * 0.6 && e[2] < e[1] * 0.4, JSON.stringify(e));
  assert.ok(e[3] > e[2] * 0.5, JSON.stringify(e));
});

test("presets are seeded and inside the square", () => {
  for (const name of PRESETS) {
    const a = preset(name, 3), b = preset(name, 3);
    assert.deepEqual(a, b);
    assert.ok(a.length >= 100);
    assert.ok(a.every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
  }
  assert.equal(nearest([{ x: 0, y: 0 }, { x: 1, y: 1 }], { x: 0.9, y: 0.8 }), 1);
});

/* Clear, then tap dots in one at a time, like main.js does. */
function tapIn(pts, k, seed, run = createRun([], k, seed)) {
  const points = run.points;
  for (const p of pts) { points.push(p); run = addToRun(run, points, k, seed); }
  return run;
}

test("after Clear, dots tapped in one at a time still fill all k groups", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const run = runToEnd(tapIn(farBlobs(seed).pts, 3, seed));
    assert.ok(run.done, `seed ${seed} never settled`);
    assert.ok(!stacked(run.centres), `seed ${seed}: centres stacked`);
    assert.ok(sizes(run).every((n) => n > 0), `seed ${seed}: empty group ${sizes(run)}`);
  }
});

test("a Step on one dot, then more dots: the stacked centres start afresh", () => {
  const { pts } = farBlobs(2);
  const run0 = runToEnd(tapIn(pts.slice(0, 1), 3, 1));
  assert.ok(stacked(run0.centres));
  const run = runToEnd(tapIn(pts.slice(1), 3, 1, run0));
  assert.ok(sizes(run).every((n) => n > 0), `empty group ${sizes(run)}`);
});

test("after the first move, an added dot keeps the centres and waits for an assign", () => {
  const points = preset("blobs3");
  const run = createRun(points, 3, 1);
  step(run); step(run);
  const centres = run.centres.map((c) => ({ ...c }));
  points.push({ x: 0.5, y: 0.5 });
  const same = addToRun(run, points, 3, 1);
  assert.equal(same, run);
  assert.deepEqual(run.centres, centres);
  assert.equal(run.phase, "assign");
  assert.equal(run.assign.length, points.length);
  assert.equal(run.assign[points.length - 1], -1);
});
