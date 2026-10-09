/* ============================================================
   Fourier Draw - the maths, unit tested

   - DFT then inverse DFT gives back the original points
   - circles come out biggest first
   - resampling spaces points evenly
   - simple shapes give the circles you'd expect
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resample, dft, idft, tip, pathLength } from "../../items/fourier-draw/dft.js";
import { makeShape, SHAPES } from "../../items/fourier-draw/shapes.js";

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("DFT then inverse gives back the original points", () => {
  for (const N of [1, 2, 7, 64, 101]) {
    const pts = Array.from({ length: N }, (_, i) => [Math.sin(i * 1.7) + i / N, Math.cos(i * 0.3) * 2 - 0.5]);
    const back = idft(dft(pts), N);
    pts.forEach(([x, y], i) => {
      assert.ok(close(back[i][0], x) && close(back[i][1], y), `N=${N}, point ${i}`);
    });
  }
});

test("DFT works on every preset, after resampling", () => {
  for (const name of SHAPES) {
    const pts = resample(makeShape(name), 128);
    const back = idft(dft(pts));
    pts.forEach(([x, y], i) => assert.ok(close(back[i][0], x, 1e-8) && close(back[i][1], y, 1e-8), name));
  }
});

test("circles are sorted biggest first", () => {
  const c = dft(resample(makeShape("heart"), 64));
  for (let i = 1; i < c.length; i++) { assert.ok(c[i - 1].amp >= c[i].amp); }
});

test("a circle drawn once is one circle, spinning once", () => {
  const N = 32;
  const pts = Array.from({ length: N }, (_, n) => [3 + 0.5 * Math.cos((2 * Math.PI * n) / N), 0.5 * Math.sin((2 * Math.PI * n) / N)]);
  const c = dft(pts);
  assert.ok(close(c[0].amp, 3) && c[0].freq === 0, "the centre comes first");
  assert.ok(close(c[1].amp, 0.5) && c[1].freq === 1, "then one circle, freq 1");
  assert.ok(c[2].amp < 1e-9);
  /* Two circles are enough to land on it at any time. */
  const [x, y] = tip(c, 0.3, 2);
  assert.ok(close(x, 3 + 0.5 * Math.cos(0.6 * Math.PI)) && close(y, 0.5 * Math.sin(0.6 * Math.PI)));
});

test("resample spaces points evenly round a closed loop", () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pts = resample(square, 8);
  assert.equal(pts.length, 8);
  const expected = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
  pts.forEach((p, i) => assert.ok(close(p[0], expected[i][0]) && close(p[1], expected[i][1]), `point ${i}`));
  assert.equal(resample([], 5).length, 0);
  assert.deepEqual(resample([[2, 3]], 2), [[2, 3], [2, 3]]);
  assert.equal(pathLength(square), 3);
});

test("presets fit on screen", () => {
  for (const name of SHAPES) {
    const pts = makeShape(name);
    assert.ok(pts.length > 8, name);
    assert.ok(pts.every(([x, y]) => Math.abs(x) <= 0.95 && Math.abs(y) <= 0.95), name);
  }
  assert.throws(() => makeShape("nope"));
});
