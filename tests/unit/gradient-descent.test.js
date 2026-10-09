/* ============================================================
   Gradient Descent Hill - the maths, unit tested

   - every hill's slope matches a numerical check
   - Adam (and the other two) reach the bowl's bottom
   - a huge learning rate blows up
   - the saddle traps plain GD exactly on its ridge
   - Rosenbrock: momentum beats plain GD along the valley
   - marching squares draws a circle as a closed ring
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HILLS, HILL_IDS, OPTIMISERS, createBall, step, run, numericGrad, contourSegments
} from "../../items/gradient-descent/descent.js";

test("gradients match a numerical check on every hill", () => {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const id of HILL_IDS) {
    const h = HILLS[id];
    const [x0, x1, y0, y1] = h.box;
    for (let k = 0; k < 200; k++) {
      const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
      const [gx, gy] = h.grad(x, y);
      const [nx, ny] = numericGrad(h.f, x, y);
      const scale = Math.max(1, Math.abs(gx), Math.abs(gy));
      assert.ok(Math.abs(gx - nx) / scale < 1e-6, `${id} d/dx at (${x}, ${y}): ${gx} vs ${nx}`);
      assert.ok(Math.abs(gy - ny) / scale < 1e-6, `${id} d/dy at (${x}, ${y}): ${gy} vs ${ny}`);
    }
  }
});

test("the minimum of each hill really is flat and lowest nearby", () => {
  for (const id of HILL_IDS) {
    const h = HILLS[id];
    const [mx, my] = h.min;
    const [gx, gy] = h.grad(mx, my);
    assert.ok(Math.hypot(gx, gy) < 1e-12, `${id}: slope at the minimum`);
    for (const [dx, dy] of [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]]) {
      assert.ok(h.f(mx + dx, my + dy) > h.f(mx, my), `${id}: neighbour is lower`);
    }
  }
});

test("Adam reaches the bowl's bottom", () => {
  const h = HILLS.bowl;
  const b = run(createBall("adam", ...h.start), h, 0.1, 3000);
  assert.equal(b.status, "settled");
  assert.ok(Math.hypot(b.x, b.y) < 1e-3, `ended at (${b.x}, ${b.y})`);
  assert.ok(h.f(b.x, b.y) < 1e-6);
});

test("all three racers reach the bowl's bottom at a sensible learning rate", () => {
  const h = HILLS.bowl;
  for (const { id } of OPTIMISERS) {
    const b = run(createBall(id, ...h.start), h, 10 ** h.lrExp, 3000);
    assert.equal(b.status, "settled", id);
    assert.ok(h.f(b.x, b.y) < 1e-6, `${id} loss ${h.f(b.x, b.y)}`);
  }
});

test("a huge learning rate blows up", () => {
  const h = HILLS.bowl;
  /* Across the bowl the slope is 4y, so any lr above 2/4 overshoots
     by more than it corrects: each step lands further out. */
  const b = createBall("gd", ...h.start);
  const dist = [];
  for (let i = 0; i < 6; i++) { step(b, h, 0.8); dist.push(Math.abs(b.y)); }
  for (let i = 1; i < dist.length; i++) { assert.ok(dist[i] > dist[i - 1], "the zig-zag grows"); }
  run(b, h, 0.8, 200);
  assert.equal(b.status, "blew up");
  const m = run(createBall("momentum", ...h.start), h, 3, 200);
  assert.equal(m.status, "blew up");
  /* Just under the limit it still lands. */
  const ok = run(createBall("gd", ...h.start), h, 0.45, 3000);
  assert.equal(ok.status, "settled");
});

test("loss goes down for every racer on every hill at its default rate", () => {
  for (const id of HILL_IDS) {
    const h = HILLS[id];
    for (const o of OPTIMISERS) {
      const b = run(createBall(o.id, ...h.start), h, 10 ** h.lrExp, 400);
      assert.ok(h.f(b.x, b.y) < h.f(...h.start), `${id} / ${o.id}`);
      assert.notEqual(b.status, "blew up", `${id} / ${o.id}`);
    }
  }
});

test("the saddle traps plain GD if it starts exactly on the ridge", () => {
  const h = HILLS.saddle;
  const b = run(createBall("gd", -2.7, 0), h, 0.1, 3000);
  assert.equal(b.status, "settled");
  assert.ok(Math.abs(b.x) < 1e-3 && b.y === 0, "stuck on the saddle point");
  assert.ok(Math.abs(h.f(b.x, b.y) - 1.25) < 1e-6);
  /* A hair off the ridge, it rolls off into a real bottom. */
  const off = run(createBall("gd", -2.7, 0.001), h, 0.1, 3000);
  assert.ok(h.f(off.x, off.y) < 1e-6);
});

test("Rosenbrock: momentum gets along the valley far faster than plain GD", () => {
  const h = HILLS.valley;
  const lr = 10 ** h.lrExp;
  const stepsToBottom = (kind) => {
    const b = createBall(kind, ...h.start);
    for (let i = 0; i < 5000; i++) { step(b, h, lr); if (h.f(b.x, b.y) < 1e-3) { return b.t; } }
    return Infinity;
  };
  const gd = stepsToBottom("gd"), mom = stepsToBottom("momentum");
  assert.ok(mom * 5 < gd, `momentum ${mom} vs GD ${gd}`);
});

test("same start, same race (no randomness)", () => {
  const h = HILLS.bumpy;
  const a = run(createBall("adam", 1, 2), h, 0.05, 300);
  const b = run(createBall("adam", 1, 2), h, 0.05, 300);
  assert.deepEqual(a, b);
});

test("marching squares: a circle's contour is a closed ring at the right radius", () => {
  const n = 40, r = 12.3;   // not a whole number, so no grid point sits exactly on it
  const values = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) { for (let i = 0; i <= n; i++) { values[j * (n + 1) + i] = Math.hypot(i - n / 2, j - n / 2); } }
  const segs = contourSegments(values, n, n, r);
  assert.ok(segs.length / 4 > 30, "plenty of segments");
  /* Every end point sits on the circle... */
  for (let k = 0; k < segs.length; k += 2) {
    assert.ok(Math.abs(Math.hypot(segs[k] - n / 2, segs[k + 1] - n / 2) - r) < 0.1);
  }
  /* ...and every point is shared by exactly two segments (closed). */
  const key = (x, y) => `${x.toFixed(6)},${y.toFixed(6)}`;
  const count = new Map();
  for (let k = 0; k < segs.length; k += 2) { const q = key(segs[k], segs[k + 1]); count.set(q, (count.get(q) || 0) + 1); }
  for (const c of count.values()) { assert.equal(c, 2); }
  /* A level above everything gives nothing. */
  assert.equal(contourSegments(values, n, n, 1e9).length, 0);
});
