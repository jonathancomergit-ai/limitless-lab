/* ============================================================
   Ripple Tank - the physics, unit tested

   - the time step respects the 2D stability limit (C ≤ 1/√2),
     and nothing blows up over many steps (with walls, sources,
     and with damping switched off)
   - going past the limit DOES blow up (so the test means something)
   - a centred drop stays symmetric (left/right, up/down, diagonal)
   - walls stay dry and reflect; damping calms the tank
   - presets, wavelength, and the wall save round trip
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTank, step, run, drop, paintWall, paintLine, applyPreset, calm, clearAll,
  waveEnergy, maxHeight, wallCount, encodeWalls, decodeWalls, wavelength, gridSize,
  accumulateScreen, COURANT, STABILITY_LIMIT, STEPS_PER_SECOND, PRESETS
} from "../../items/ripple-tank/physics.js";

test("the Courant number is inside the 2D stability limit", () => {
  assert.ok(STABILITY_LIMIT > 0.707 && STABILITY_LIMIT < 0.7072);
  assert.ok(COURANT <= STABILITY_LIMIT, `C = ${COURANT} is past ${STABILITY_LIMIT}`);
  assert.ok(createTank(50, 50).courant <= STABILITY_LIMIT);
});

test("no blow-up over many steps, even with no damping at all", () => {
  const t = createTank(81, 81, { damping: 0, sponge: 0 });
  drop(t, 40, 40, { radius: 2, height: 3 });
  drop(t, 20, 55, { radius: 1, height: -2 });    // a sharp one: lots of short waves
  const start = maxHeight(t);
  let worst = 0;
  for (let k = 0; k < 6000; k++) {
    step(t);
    worst = Math.max(worst, maxHeight(t));
    assert.ok(Number.isFinite(t.u[40 * 81 + 40]), `NaN at step ${k}`);
  }
  /* Bounded: never more than a few times the starting height. */
  assert.ok(worst < start * 3, `peak grew to ${worst.toFixed(2)} from ${start.toFixed(2)}`);
});

test("no blow-up with walls, sources and the sponge, for every preset", () => {
  for (const name of PRESETS) {
    const t = applyPreset(createTank(120, 90), name);
    run(t, 4000);
    const m = maxHeight(t);
    assert.ok(Number.isFinite(m) && m < 6, `${name}: max height ${m}`);
  }
});

test("past the stability limit it DOES blow up", () => {
  const t = createTank(61, 61, { courant: 0.75, damping: 0, sponge: 0 });
  drop(t, 30, 30, { radius: 1, height: 1 });
  run(t, 400);
  const m = maxHeight(t);
  assert.ok(!Number.isFinite(m) || m > 1e6, `expected blow-up, got ${m}`);
});

test("a centred drop stays symmetric", () => {
  const n = 71, c = 35;
  const t = createTank(n, n);
  drop(t, c, c, { radius: 3, height: 2 });
  run(t, 300);
  const at = (x, y) => t.u[y * n + x];
  let worst = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = at(x, y);
      worst = Math.max(worst,
        Math.abs(v - at(n - 1 - x, y)),       // left / right
        Math.abs(v - at(x, n - 1 - y)),       // up / down
        Math.abs(v - at(y, x)));              // diagonal
    }
  }
  assert.ok(worst < 1e-5, `asymmetry ${worst}`);
  /* And the ring really did spread out from the middle. */
  assert.ok(Math.abs(at(c + 20, c)) > 1e-4, "the wave never reached 20 cells out");
});

test("waves travel at C cells per step", () => {
  const n = 201, c = 100;
  const t = createTank(n, n, { damping: 0, sponge: 0 });
  drop(t, c, c, { radius: 1.5, height: 2 });
  const steps = 120;
  run(t, steps);
  /* Find the outermost cell along the row that has clearly moved. */
  let front = 0;
  for (let x = c; x < n; x++) { if (Math.abs(t.u[c * n + x]) > 1e-3) { front = x - c; } }
  const expected = COURANT * steps;
  assert.ok(Math.abs(front - expected) < 8, `front at ${front} cells, expected about ${expected}`);
});

test("walls stay dry and reflect waves", () => {
  const n = 81;
  const t = createTank(n, n, { sponge: 0 });
  paintLine(t, 50, 1, 50, 79, 1.2);
  assert.ok(wallCount(t) > 70);
  drop(t, 30, 40, { radius: 2, height: 3 });
  run(t, 400);
  for (let i = 0; i < t.wall.length; i++) { if (t.wall[i]) { assert.equal(t.u[i], 0); } }
  /* Behind a full wall (it runs edge to edge) almost nothing gets through. */
  let behind = 0, front = 0;
  for (let y = 10; y < 70; y++) {
    behind = Math.max(behind, Math.abs(t.u[y * n + 65]));
    front = Math.max(front, Math.abs(t.u[y * n + 30]));
  }
  assert.ok(behind < 0.05 * front + 1e-3, `leak behind the wall: ${behind} vs ${front}`);
});

test("drops don't wet walls; the eraser removes walls", () => {
  const t = createTank(40, 40);
  paintWall(t, 20, 20, 3);
  const n = wallCount(t);
  assert.ok(n > 20);
  drop(t, 20, 20, { radius: 3 });
  assert.equal(t.u[20 * 40 + 20], 0);
  assert.equal(paintWall(t, 20, 20, 3, 0), n);
  assert.equal(wallCount(t), 0);
});

test("damping and the sponge calm the tank", () => {
  const t = createTank(80, 80);
  drop(t, 40, 40);
  const e0 = waveEnergy(t);
  run(t, 3000);
  assert.ok(waveEnergy(t) < e0 * 0.01, "still choppy after 3000 steps");
});

test("presets build what they say", () => {
  const t = createTank(160, 100);
  applyPreset(t, "drop");
  assert.equal(t.sources.length, 0);
  assert.ok(waveEnergy(t) > 0);
  applyPreset(t, "two");
  assert.equal(t.sources.length, 2);
  assert.equal(wallCount(t), 0);
  applyPreset(t, "slit2");
  assert.ok(t.sources.length > 50, "plane wave = a line of sources");
  /* Two gaps in the barrier column. */
  const x = Math.round(0.3 * 159);
  let gaps = 0;
  for (let y = 2; y < 98; y++) { if (!t.wall[y * 160 + x] && t.wall[(y - 1) * 160 + x]) { gaps++; } }
  assert.equal(gaps, 2);
  applyPreset(t, "gap");
  gaps = 0;
  const x2 = Math.round(0.35 * 159);
  for (let y = 2; y < 98; y++) { if (!t.wall[y * 160 + x2] && t.wall[(y - 1) * 160 + x2]) { gaps++; } }
  assert.equal(gaps, 1);
  clearAll(t);
  assert.equal(wallCount(t) + t.sources.length + waveEnergy(t), 0);
});

test("a source makes waves of the right wavelength", () => {
  assert.equal(wavelength(10), (COURANT * STEPS_PER_SECOND) / 10);
  for (const f of [6, 10, 16]) {
    /* A line of sources = a flat wave. Measure the zero crossings
       along the middle row (each pair = one wavelength). */
    const n = 301, rows = 121, c = 150, row = 60;
    const t = createTank(n, rows, { damping: 0 });
    t.freq = f;
    for (let y = 1; y < rows - 1; y++) { t.sources.push({ x: c, y, phase: 0, born: 0 }); }
    run(t, 600);
    const xs = [];
    for (let x = c + 3; x < c + 110; x++) {
      const a = t.u[row * n + x], b = t.u[row * n + x + 1];
      if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) { xs.push(x + a / (a - b)); }
    }
    const measured = (2 * (xs[xs.length - 1] - xs[0])) / (xs.length - 1);
    assert.ok(Math.abs(measured - wavelength(f)) < 0.05 * wavelength(f), `${f} Hz: measured ${measured}, expected ${wavelength(f)}`);
  }
});

test("calm keeps walls and sources", () => {
  const t = applyPreset(createTank(100, 80), "slit2");
  run(t, 50);
  const walls = wallCount(t), sources = t.sources.length;
  calm(t);
  assert.equal(waveEnergy(t), 0);
  assert.equal(wallCount(t), walls);
  assert.equal(t.sources.length, sources);
});

test("walls survive a save round trip, even into a different size", () => {
  const a = applyPreset(createTank(120, 80), "slit2");
  paintLine(a, 70, 10, 100, 60, 2);
  const saved = JSON.parse(JSON.stringify(encodeWalls(a)));
  const b = createTank(120, 80);
  assert.ok(decodeWalls(b, saved));
  assert.deepEqual([...b.wall], [...a.wall]);
  const c = createTank(60, 40);
  assert.ok(decodeWalls(c, saved));
  const ratio = wallCount(c) / wallCount(a);
  assert.ok(ratio > 0.15 && ratio < 0.4, `scaled wall count ratio ${ratio}`);
  /* Junk in, false out, tank untouched. */
  assert.equal(decodeWalls(c, { cols: 10, rows: 10, runs: "5,5" }), false);
  assert.equal(decodeWalls(c, { cols: 10, rows: 10, runs: "a,b" }), false);
  assert.equal(decodeWalls(c, null), false);
});

test("grid size fits the budget", () => {
  const g = gridSize(390, 430, 40000);
  assert.ok(Math.abs(g.cols * g.rows - 40000) < 4000);
  const d = gridSize(1280, 640, 70000);
  assert.ok(d.cols * d.rows <= 75000 && d.cols > 300);
});

test("the double slit makes bright and dark stripes on the screen", () => {
  const t = applyPreset(createTank(220, 160), "slit2");
  const acc = new Float32Array(t.rows);
  for (let k = 0; k < 2400; k++) { step(t); if (k > 900) { accumulateScreen(t, acc, 0.004); } }
  /* Look at the middle 60% of the screen: there must be clear
     peaks and dips (bright and dark fringes), not a flat glow. */
  const mid = [...acc.slice(Math.round(t.rows * 0.2), Math.round(t.rows * 0.8))];
  let peaks = 0;
  for (let i = 1; i < mid.length - 1; i++) { if (mid[i] > mid[i - 1] && mid[i] >= mid[i + 1]) { peaks++; } }
  const max = Math.max(...mid), min = Math.min(...mid);
  assert.ok(peaks >= 2, `only ${peaks} bright fringes`);
  assert.ok(min < max * 0.35, `fringes too faint: min ${min}, max ${max}`);
  /* The centre is bright: both slits are the same distance away. */
  assert.ok(acc[Math.round((t.rows - 1) / 2)] > max * 0.6, "centre fringe should be bright");
});
