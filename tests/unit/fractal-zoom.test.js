/* ============================================================
   Fractal Zoom - the maths, unit tested

   - known points inside / outside the Mandelbrot set
   - the smooth escape value: matches the formula, sits next
     to the whole-number count, and has no jumps
   - Julia sets (c = 0 is the unit circle)
   - zooming keeps the point under the finger still
   - tiles cover every pixel once; coarse pass = fine pass samples
   - iterations rise with zoom; the precision limit
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mandel, julia, escapeCount, INSIDE, ESCAPE_RADIUS, iterationsFor, zoomAt, panBy, toComplex,
  tiles, renderTile, colourIndex, pastPrecision, zoomLabel, zoomOf, validView, fitHome, HOME, PRECISION_LIMIT
} from "../../items/fractal-zoom/mandel.js";

test("known points inside the set", () => {
  const inside = [[0, 0], [-1, 0], [-2, 0], [0, 1], [0, -1], [-0.5, 0.5], [-1.3, 0], [0.25, 0], [-1.1, 0.2], [-0.1, 0.8], [0.3, 0.5], [-1.75, 0]];
  for (const [x, y] of inside) {
    assert.equal(mandel(x, y, 2000), INSIDE, `${x} + ${y}i should be inside`);
  }
});

test("known points outside the set", () => {
  const outside = [[1, 0], [0.26, 0], [-2.01, 0], [0, 1.1], [0.5, 0.5], [-0.75, 0.2], [2, 2], [-1.5, 0.5], [-0.1, 0.65], [-0.75, 0.05], [-0.15, 1.03]];
  for (const [x, y] of outside) {
    assert.ok(mandel(x, y, 2000) > 0, `${x} + ${y}i should be outside`);
  }
});

test("the shortcut for the big blobs agrees with plain iteration", () => {
  for (let k = 0; k < 4000; k++) {
    const x = -2 + (k % 80) * 0.03, y = Math.floor(k / 80) * 0.025;
    const fast = mandel(x, y, 600) === INSIDE;
    const slow = escapeCount(x, y, 600) === INSIDE;
    if (fast !== slow) {
      /* Only allowed right on the edge, where 600 steps can't tell yet. */
      assert.equal(escapeCount(x, y, 20000), INSIDE, `disagree at ${x}, ${y}`);
    }
  }
});

test("the smooth escape value matches the formula", () => {
  /* c = 2: z goes 2, 6, 38, 1446 (> 256 at step 4). */
  const nu = mandel(2, 0, 100);
  assert.ok(Math.abs(nu - (4 + 1 - Math.log2(Math.log(1446)))) < 1e-12, `got ${nu}`);
  /* c = 300: escapes on step 1 with |z| = 300. */
  assert.ok(Math.abs(mandel(300, 0, 100) - (2 - Math.log2(Math.log(300)))) < 1e-12);
  assert.equal(ESCAPE_RADIUS, 256);
});

test("smooth value has no jumps, unlike the whole-number count", () => {
  /* Walk along the real axis outside the set. */
  let prev = mandel(0.3, 0, 1000), biggest = 0, countJumps = 0, prevCount = escapeCount(0.3, 0, 1000, ESCAPE_RADIUS);
  for (let x = 0.3005; x < 2; x += 0.0005) {
    const v = mandel(x, 0, 1000);
    biggest = Math.max(biggest, Math.abs(v - prev));
    const c = escapeCount(x, 0, 1000, ESCAPE_RADIUS);
    if (c !== prevCount) { countJumps++; }
    prev = v; prevCount = c;
    assert.ok(v > 0);
  }
  assert.ok(countJumps > 5, "the plain count should step");
  assert.ok(biggest < 0.2, `smooth value jumped by ${biggest}`);
});

test("smooth value goes down as you move away from the set", () => {
  const a = mandel(0.3, 0, 1000), b = mandel(0.5, 0, 1000), c = mandel(1.5, 0, 1000);
  assert.ok(a > b && b > c);
  /* And it sits just under the whole-number count: the fraction
     log2(ln|z|) is between log2(ln 256) ≈ 2.47 and ~3.5. */
  for (const x of [0.3, 0.5, 1, 1.5]) {
    const n = escapeCount(x, 0, 1000, ESCAPE_RADIUS), v = mandel(x, 0, 1000);
    assert.ok(v <= n && v > n - 3, `x = ${x}: ${v} vs ${n}`);
  }
});

test("Julia sets: c = 0 is the unit circle", () => {
  assert.equal(julia(0.5, 0, 0, 0, 500), INSIDE);
  assert.equal(julia(0, -0.99, 0, 0, 500), INSIDE);
  assert.ok(julia(1.01, 0, 0, 0, 500) > 0);
  assert.ok(julia(0, 1.5, 0, 0, 500) > 0);
  /* Mandelbrot at c = the Julia set at z = 0, same c. */
  for (const [x, y] of [[0.3, 0.1], [-0.8, 0.3], [0.1, 0.9]]) {
    assert.equal(julia(0, 0, x, y, 800), escapeCount(x, y, 800) === INSIDE ? INSIDE : julia(0, 0, x, y, 800));
    assert.equal(julia(0, 0, x, y, 800) === INSIDE, mandel(x, y, 800) === INSIDE);
  }
});

test("zooming keeps the point under the finger still", () => {
  const v = { cx: -0.5, cy: 0.1, width: 3 };
  const before = toComplex(v, 400, 300, 300, 80);
  const z = zoomAt(v, 400, 300, 300, 80, 2);
  const after = toComplex(z, 400, 300, 300, 80);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-12 && Math.abs(before[1] - after[1]) < 1e-12);
  assert.ok(Math.abs(z.width - 1.5) < 1e-12);
  /* Zoom out is capped, and so is zoom in. */
  assert.ok(zoomAt(v, 400, 300, 0, 0, 1e-9).width <= HOME.width * 2);
  assert.ok(zoomOf(zoomAt(v, 400, 300, 0, 0, 1e30)) <= 2.1e14);
  const p = panBy(v, 400, 40, -20);
  assert.ok(Math.abs(p.cx - (v.cx - 0.3)) < 1e-12 && Math.abs(p.cy - (v.cy + 0.15)) < 1e-12);
});

test("tiles cover every pixel exactly once, middle first", () => {
  const w = 333, h = 250;
  const seen = new Uint8Array(w * h);
  const list = tiles(w, h, 64);
  for (const t of list) {
    for (let y = t.y; y < t.y + t.h; y++) { for (let x = t.x; x < t.x + t.w; x++) { seen[y * w + x]++; } }
  }
  assert.ok(seen.every((n) => n === 1));
  const first = list[0];
  assert.ok(first.x <= w / 2 && first.x + first.w >= w / 2 && first.y <= h / 2 && first.y + first.h >= h / 2);
});

test("a coarse tile is the fine tile's samples, in blocks", () => {
  const view = { cx: -0.75, cy: 0.1, width: 0.5 };
  const args = { view, canvasW: 64, canvasH: 64, x: 0, y: 0, w: 64, h: 64, maxIter: 300 };
  const coarse = renderTile({ ...args, step: 8 });
  /* A block of 8 x 8 is one value: the one at the block centre. */
  for (let j = 0; j < 64; j += 8) {
    for (let i = 0; i < 64; i += 8) {
      const v = coarse[j * 64 + i];
      for (let y = j; y < j + 8; y++) { for (let x = i; x < i + 8; x++) { assert.equal(coarse[y * 64 + x], v); } }
      const [cx, cy] = toComplex(view, 64, 64, i + 4, j + 4);
      assert.equal(v, Math.fround(mandel(cx, cy, 300)));
    }
  }
  const fine = renderTile({ ...args, step: 1 });
  const [cx, cy] = toComplex(view, 64, 64, 10.5, 20.5);
  assert.equal(fine[20 * 64 + 10], Math.fround(mandel(cx, cy, 300)));
  const juliaTile = renderTile({ ...args, juliaC: [-0.8, 0.156] });
  assert.notDeepEqual([...juliaTile], [...fine]);
});

test("iterations rise with zoom", () => {
  assert.equal(iterationsFor(1, 200), 200);
  assert.ok(iterationsFor(1e3, 200) > iterationsFor(10, 200));
  assert.ok(iterationsFor(1e12, 200) > iterationsFor(1e6, 200));
  assert.ok(iterationsFor(1e300, 1e6) <= 50000);
});

test("the precision limit, and labels", () => {
  assert.equal(PRECISION_LIMIT, 1e13);
  assert.equal(pastPrecision(1e12), false);
  assert.equal(pastPrecision(2e13), true);
  /* Why: at 1e13 a pixel is ~3e-16 wide, the gap between doubles near 1. */
  const pixel = HOME.width / PRECISION_LIMIT / 1000;
  assert.ok(pixel < 1e-15 && pixel > Number.EPSILON / 100);
  assert.equal(zoomLabel(1), "×1.0");
  assert.equal(zoomLabel(250), "×250");
  assert.equal(zoomLabel(12345), "×1.2e4");
});

test("colour index loops and marks the inside", () => {
  assert.equal(colourIndex(INSIDE, 256), -1);
  for (const nu of [0.1, 1, 5.5, 99, 12345]) {
    const i = colourIndex(nu, 256);
    assert.ok(i >= 0 && i < 256);
  }
});

test("views from a save are checked", () => {
  assert.ok(validView({ cx: -0.5, cy: 0, width: 3 }));
  assert.ok(!validView({ cx: NaN, cy: 0, width: 3 }));
  assert.ok(!validView({ cx: 0, cy: 0, width: -1 }));
  assert.ok(!validView({ cx: 99, cy: 0, width: 1 }));
  assert.ok(!validView({ cx: 0, cy: 0, width: 1e9 }));
  assert.ok(!validView(null));
});

test("the start view fits the whole set on any screen shape", () => {
  const tall = fitHome(HOME, 400, 500), wide = fitHome(HOME, 1280, 500);
  assert.equal(tall.width, HOME.width);
  assert.ok(wide.width * 500 / 1280 >= HOME.height - 1e-9);
  /* Far outside starts at the dark end of the ramp. */
  const k = colourIndex(1, 1000);
  assert.ok(k > 800 || k < 60, `index ${k}`);
});
