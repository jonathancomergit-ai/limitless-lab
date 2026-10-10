/* ============================================================
   Fluid Sim - the solver, unit tested

   - projection: after it, every cell has as much flowing in as
     out (divergence near zero), even round a wall
   - advection: with fade off, total dye stays within 1%, and the
     dye really moves the way the flow goes
   - fade takes dye away; walls stay dry and block the flow
   - presets build; long runs stay finite; resizing keeps walls
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFluid, step, splat, project, advectDye, advectVelocity, paintWalls, addBall, applyPreset, clearAll,
  resample, gridSize, totalDye, maxDivergence, meanSpeed, wallCount, sampleU, hueColor,
  PRESETS, STEP, SOLID
} from "../../items/fluid-sim/fluid.js";

/* A repeatable "random" number, -0.5 .. 0.5. */
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
}

/* A messy flow: random speeds everywhere. */
function messy(sim, size = 20, seed = 1) {
  const rnd = seeded(seed);
  for (let k = 0; k < sim.u.length; k++) { sim.u[k] = rnd() * size; }
  for (let k = 0; k < sim.v.length; k++) { sim.v[k] = rnd() * size; }
}

/* Centre of the dye, in cells. */
function dyeCentre(sim) {
  let sx = 0, sy = 0, s = 0;
  for (let j = 0; j < sim.rows; j++) {
    for (let i = 0; i < sim.cols; i++) {
      const d = sim.r[j * sim.cols + i];
      sx += d * (i + 0.5); sy += d * (j + 0.5); s += d;
    }
  }
  return [sx / s, sy / s];
}

test("after projection the divergence is near zero", () => {
  const sim = createFluid(48, 36);
  messy(sim);
  project(sim, 0);                       // 0 sweeps: just walls applied
  const before = maxDivergence(sim);
  assert.ok(before > 5, `the messy flow should squeeze a lot (${before})`);
  project(sim, 400);
  const after = maxDivergence(sim);
  assert.ok(after < 1e-3, `divergence left: ${after}`);
  assert.ok(after < before * 1e-4);
});

test("projection works round walls and a ball too", () => {
  const sim = createFluid(48, 36);
  addBall(sim, 16, 18, 5);
  paintWalls(sim, 30, 5, 30, 25, 1.5, true);
  messy(sim, 30, 7);
  project(sim, 500);
  assert.ok(maxDivergence(sim) < 1e-3, `divergence left: ${maxDivergence(sim)}`);
  /* Nothing flows into a wall cell. */
  const c = 18 * sim.cols + 16;
  assert.equal(sim.cell[c], SOLID);
  assert.equal(sim.u[18 * (sim.cols + 1) + 16], 0);
  assert.equal(sim.v[c], 0);
});

test("the game's own sweeps (24, warm-started) cut divergence a lot each step", () => {
  const sim = createFluid(90, 100);
  messy(sim, 20, 3);
  project(sim, 0);
  const before = maxDivergence(sim);
  for (let k = 0; k < 5; k++) { project(sim); }
  assert.ok(maxDivergence(sim) < before * 0.05, `${maxDivergence(sim)} vs ${before}`);
});

test("advection keeps total dye within 1% with fade off", () => {
  const sim = createFluid(64, 64);
  addBall(sim, 44, 30, 5);
  splat(sim, 30, 32, { vx: 40, radius: 8, blend: 1 });
  splat(sim, 20, 40, { vy: -40, radius: 6, blend: 1 });
  splat(sim, 30, 28, { radius: 5, color: [1, 0.5, 0.2], dye: 1, blend: 0 });
  sim.params.fade = 0;
  const start = totalDye(sim);
  const centre0 = dyeCentre(sim);
  for (let k = 0; k < 120; k++) {           // 2 seconds
    project(sim);
    advectDye(sim, STEP);
    advectVelocity(sim, STEP);
  }
  const end = totalDye(sim);
  assert.ok(Math.abs(end / start - 1) < 0.01, `dye changed by ${((end / start - 1) * 100).toFixed(2)}%`);
  /* And it did really move (rightwards, with the push). */
  const centre1 = dyeCentre(sim);
  assert.ok(Math.hypot(centre1[0] - centre0[0], centre1[1] - centre0[1]) > 2, "the dye should have been carried along");
});

test("a steady flow carries dye downstream", () => {
  const sim = createFluid(60, 20);
  sim.u.fill(30);                            // 30 cells a second, to the right
  project(sim, 0);
  splat(sim, 15, 10, { radius: 2, color: [1, 1, 1], dye: 1, blend: 0 });
  const x0 = dyeCentre(sim)[0];
  for (let k = 0; k < 30; k++) { advectDye(sim, STEP); }   // half a second
  const x1 = dyeCentre(sim)[0];
  assert.ok(Math.abs(x1 - x0 - 15) < 1.5, `moved ${(x1 - x0).toFixed(2)} cells, expected about 15`);
});

test("fade takes dye away at the set rate", () => {
  const sim = createFluid(40, 40);
  splat(sim, 20, 20, { radius: 4, color: [1, 1, 1], dye: 1, blend: 0 });
  sim.params.fade = 0.5;
  const start = totalDye(sim);
  for (let k = 0; k < 60; k++) { advectDye(sim, STEP); }   // 1 s
  const ratio = totalDye(sim) / start;
  assert.ok(Math.abs(ratio - Math.exp(-0.5)) < 0.01, `kept ${ratio.toFixed(3)}`);
});

test("walls stay dry, and erasing gives the cells back", () => {
  const sim = createFluid(40, 30);
  splat(sim, 20, 15, { radius: 6, color: [1, 1, 1], dye: 1, blend: 0 });
  const n = paintWalls(sim, 10, 15, 30, 15, 1.5, true);
  assert.ok(n > 20);
  assert.equal(wallCount(sim), n);
  for (let c = 0; c < sim.cell.length; c++) { if (sim.cell[c] === SOLID) { assert.equal(sim.r[c], 0); } }
  for (let k = 0; k < 60; k++) { step(sim); }
  for (let c = 0; c < sim.cell.length; c++) { if (sim.cell[c] === SOLID) { assert.equal(sim.r[c], 0); } }
  /* The outer ring can't be rubbed out. */
  paintWalls(sim, 0, 0, 40, 30, 50, false);
  assert.equal(wallCount(sim), 0);
  assert.equal(sim.cell[0], SOLID);
});

test("a push makes the fluid move; viscosity calms it faster", () => {
  const run = (visc) => {
    const sim = createFluid(50, 50, { viscosity: visc });
    splat(sim, 25, 25, { vx: 60, radius: 4, blend: 1 });
    for (let k = 0; k < 60; k++) { step(sim); }
    return meanSpeed(sim);
  };
  const thin = run(0), thick = run(60);
  assert.ok(thin > 0.2, `still moving: ${thin}`);
  assert.ok(thick < thin * 0.8, `thick ${thick} vs thin ${thin}`);
});

test("every preset runs for 5 seconds without blowing up", () => {
  for (const name of PRESETS) {
    const sim = applyPreset(createFluid(70, 60, { swirl: 10, fade: 0.2 }), name);
    for (let k = 0; k < 300; k++) { step(sim); }
    const sp = meanSpeed(sim), dye = totalDye(sim);
    assert.ok(Number.isFinite(sp) && Number.isFinite(dye), name);
    assert.ok(sp > 0.5, `${name} should be flowing (${sp})`);
    assert.ok(dye > 1, `${name} should have dye in it`);
    assert.ok(sp < 200, `${name} got too fast (${sp})`);
  }
  /* Wind blows left to right. */
  const w = applyPreset(createFluid(70, 40), "wind");
  for (let k = 0; k < 120; k++) { step(w); }
  assert.ok(sampleU(w, 10, 5) > 5);
  assert.ok(wallCount(w) > 10, "the ball");
});

test("clear all empties the tank", () => {
  const sim = applyPreset(createFluid(40, 40), "jets");
  for (let k = 0; k < 30; k++) { step(sim); }
  clearAll(sim);
  assert.equal(totalDye(sim), 0);
  assert.equal(meanSpeed(sim), 0);
  assert.equal(sim.sources.length, 0);
  step(sim);
  assert.equal(totalDye(sim), 0);
});

test("resizing keeps the walls and the dye where they were", () => {
  const sim = createFluid(42, 32);
  addBall(sim, 21, 16, 5);
  splat(sim, 10, 10, { radius: 3, color: [1, 0, 0], dye: 1, blend: 0 });
  const big = resample(sim, 82, 62);
  assert.equal(big.cell[31 * 82 + 41], SOLID, "ball centre is still a wall");
  const ratio = wallCount(big) / wallCount(sim);
  assert.ok(ratio > 3 && ratio < 5, `walls scale with area (${ratio})`);
  assert.ok(big.r[19 * 82 + 19] > 0.3, "the dye blob moved with the grid");
});

test("grid size fits the box and the cell budget", () => {
  const { cols, rows } = gridSize(390, 440, 8500);
  assert.ok(cols < rows);
  assert.ok(Math.abs((cols - 2) * (rows - 2) - 8500) < 400);
  const d = gridSize(1280, 480, 16000);
  assert.ok(d.cols > d.rows * 2);
});

test("rainbow colours are bright and in range", () => {
  for (let h = 0; h < 1; h += 0.05) {
    const c = hueColor(h);
    assert.ok(c.every((x) => x >= 0 && x <= 1));
    assert.ok(Math.max(...c) === 1);
  }
  assert.deepEqual(hueColor(0), [1, 0, 0]);
});
