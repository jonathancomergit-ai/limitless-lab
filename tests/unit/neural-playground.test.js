/* ============================================================
   Neural Net Playground - the maths, unit tested

   - backprop gradients match a finite-difference check
   - training on XOR gets the loss under 0.1
   - the same seed gives exactly the same run
   - the presets and the decision line behave
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNet, lossAndGrad, meanLoss, createAdam, trainEpoch, predict,
  sampleGrid, accuracy, bce, rng
} from "../../items/neural-playground/net.js";
import { makePreset, PRESETS } from "../../items/neural-playground/data.js";
import { contour } from "../../items/neural-playground/contour.js";

const XOR = [[-1, -1, 0], [1, 1, 0], [-1, 1, 1], [1, -1, 1]];

function randomPoints(n, seed) {
  const r = rng(seed);
  return Array.from({ length: n }, () => [r() * 2 - 1, r() * 2 - 1, r() < 0.5 ? 0 : 1]);
}

/* ---- gradients ------------------------------------------- */

for (const activation of ["tanh", "sigmoid", "relu"]) {
  test(`${activation}: backprop matches a numerical gradient`, () => {
    const net = createNet({ hidden: [5, 3], activation, seed: 42 });
    const points = randomPoints(12, 3);
    const { grads } = lossAndGrad(net, points);
    const h = 1e-6;
    let worst = 0;
    for (let l = 0; l < net.layers.length; l++) {
      for (const key of ["W", "b"]) {
        const w = net.layers[l][key];
        for (let k = 0; k < w.length; k++) {
          const keep = w[k];
          w[k] = keep + h; const up = meanLoss(net, points);
          w[k] = keep - h; const down = meanLoss(net, points);
          w[k] = keep;
          const numeric = (up - down) / (2 * h);
          const analytic = grads[l][key][k];
          const err = Math.abs(numeric - analytic) / Math.max(1e-4, Math.abs(numeric) + Math.abs(analytic));
          worst = Math.max(worst, err);
        }
      }
    }
    assert.ok(worst < 1e-4, `largest relative gradient error ${worst}`);
  });
}

test("cross-entropy is stable for huge logits", () => {
  assert.ok(Number.isFinite(bce(800, 0)));
  assert.ok(Number.isFinite(bce(-800, 1)));
  assert.ok(Math.abs(bce(0, 1) - Math.log(2)) < 1e-12);
  assert.ok(bce(10, 1) < 1e-4);
});

/* ---- learning --------------------------------------------- */

test("XOR: training gets the loss under 0.1", () => {
  const net = createNet({ hidden: [4], activation: "tanh", seed: 1 });
  const opt = createAdam(net, { lr: 0.05 });
  let loss = Infinity;
  for (let e = 0; e < 1500; e++) { loss = trainEpoch(net, opt, XOR); }
  loss = meanLoss(net, XOR);
  assert.ok(loss < 0.1, `XOR loss ${loss}`);
  for (const [x, y, label] of XOR) { assert.equal(predict(net, x, y) > 0.5 ? 1 : 0, label); }
});

test("every activation can learn the XOR preset", () => {
  const points = makePreset("xor");
  for (const activation of ["tanh", "relu", "sigmoid"]) {
    const net = createNet({ hidden: [6, 6], activation, seed: 5 });
    const opt = createAdam(net, { lr: 0.03 });
    for (let e = 0; e < 1500; e++) { trainEpoch(net, opt, points); }
    assert.ok(accuracy(net, points) > 0.95, `${activation}: accuracy ${accuracy(net, points)}`);
  }
});

test("same seed, same result; different seed, different start", () => {
  const run = (seed) => {
    const net = createNet({ hidden: [4, 4], seed });
    const opt = createAdam(net, { lr: 0.03 });
    const points = makePreset("circle");
    for (let e = 0; e < 50; e++) { trainEpoch(net, opt, points); }
    return net.layers.flatMap((ly) => [...ly.W, ...ly.b]);
  };
  assert.deepEqual(run(9), run(9));
  assert.notDeepEqual(run(9), run(10));
});

test("no points: no crash, no change", () => {
  const net = createNet({ seed: 2 });
  const before = [...net.layers[0].W];
  const opt = createAdam(net);
  assert.equal(trainEpoch(net, opt, []), 0);
  assert.deepEqual([...net.layers[0].W], before);
});

/* ---- presets + pictures ----------------------------------- */

test("presets: in range, both colours, repeatable", () => {
  for (const name of PRESETS) {
    const pts = makePreset(name);
    assert.ok(pts.length >= 40, name);
    assert.ok(pts.every(([x, y, l]) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && (l === 0 || l === 1)), name);
    assert.ok(pts.some((p) => p[2] === 0) && pts.some((p) => p[2] === 1), name);
    assert.deepEqual(makePreset(name), pts);
  }
  assert.throws(() => makePreset("nope"));
});

test("sampleGrid gives one chance per cell, and neuron maps", () => {
  const net = createNet({ hidden: [3], seed: 4 });
  const g = sampleGrid(net, 8, { neurons: true });
  assert.equal(g.probs.length, 64);
  assert.ok(g.probs.every((p) => p > 0 && p < 1));
  assert.equal(g.maps.length, 3);              // inputs, hidden, output
  assert.equal(g.maps[1].length, 3);
  assert.ok(Math.abs(g.maps[0][0][0] - (-1 + 1 / 8)) < 1e-6);   // x of the top-left cell
  assert.ok(Math.abs(g.maps[0][1][0] - (1 - 1 / 8)) < 1e-6);    // y of the top-left cell
});

test("contour traces a circle at the right radius", () => {
  const n = 41;
  const values = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) { values[r * n + c] = Math.hypot(c - 20, r - 20) < 10 ? 1 : 0; }
  }
  const segs = contour(values, n, 0.5);
  assert.ok(segs.length > 40);
  for (let i = 0; i < segs.length; i += 2) {
    const d = Math.hypot(segs[i] - 20, segs[i + 1] - 20);
    assert.ok(d > 8.5 && d < 11.5, `point at distance ${d}`);
  }
  assert.deepEqual(contour(new Float32Array(16).fill(1), 4), []);
});
