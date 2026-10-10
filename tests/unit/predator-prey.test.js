/* ============================================================
   Predator & Prey - the model, unit tested

   - the Lotka-Volterra leapfrog keeps its conserved quantity
     within 1% over 10 cycles (and the loop closes)
   - a fox with no food starves at its hunger limit (cubs too)
   - the same seed gives the same run
   - the presets tell their stories: steady cycles keep going,
     foxes die out, everything crashes
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSim, step, run, counts, drop, applySettings, cleanSettings, wrapDelta, grassShare,
  lvParams, lvConserved, lvBalance, createLV, stepLV, lvState, runLV, lvLoop,
  PRESETS, DEFAULT_SETTINGS, LIMITS, SIZE, LV_DT
} from "../../items/predator-prey/model.js";

/* How many times the foxes boom and crash: rises above 1.6x
   the last low, then falls below 0.6x that high. */
function waves(series) {
  let n = 0, rising = true, lo = series[0], hi = series[0];
  for (const v of series) {
    if (rising) {
      lo = Math.min(lo, v);
      if (v > lo * 1.6 + 3) { rising = false; hi = v; }
    } else {
      hi = Math.max(hi, v);
      if (v < hi * 0.6) { n++; rising = true; lo = v; }
    }
  }
  return n;
}

test("Lotka-Volterra: the conserved quantity stays within 1% over 10 cycles", () => {
  for (const preset of Object.values(PRESETS)) {
    const p = lvParams(preset.settings);
    const lv = createLV(p, preset.rabbits, preset.foxes);
    const v0 = lvConserved(p, preset.rabbits, preset.foxes);
    const { R: R0 } = lvBalance(p);
    let crossings = 0, above = preset.rabbits > R0, worst = 0, steps = 0;
    while (crossings < 20 && steps < 2e6) {
      stepLV(lv);
      steps++;
      const { R, F } = lvState(lv);
      worst = Math.max(worst, Math.abs(lvConserved(p, R, F) - v0) / Math.abs(v0));
      if ((R > R0) !== above) { above = !above; crossings++; }
    }
    assert.equal(crossings, 20, `${preset.label}: didn't finish 10 cycles`);
    assert.ok(worst < 0.01, `${preset.label}: drifted ${(worst * 100).toFixed(3)}%`);
  }
});

test("Lotka-Volterra: populations swing round the balance point and the loop closes", () => {
  const p = lvParams(DEFAULT_SETTINGS);
  const bal = lvBalance(p);
  assert.ok(Math.abs(p.a - p.b * bal.F) < 1e-12 && Math.abs(p.d * bal.R - p.g) < 1e-12);
  /* Start at the balance point: nothing moves. */
  const still = runLV(createLV(p, bal.R, bal.F), 200);
  const end = still.history[still.history.length - 1];
  assert.ok(Math.abs(end.rabbits - bal.R) / bal.R < 1e-6 && Math.abs(end.foxes - bal.F) / bal.F < 1e-6);
  /* Start away from it: one loop comes back to where it started. */
  const loop = lvLoop(p, 300, 30);
  const first = loop[0], last = loop[loop.length - 1];
  assert.ok(loop.length > 20);
  assert.ok(Math.abs(last.R - first.R) / first.R < 0.05, `R ${first.R} -> ${last.R}`);
  assert.ok(Math.abs(last.F - first.F) / first.F < 0.05, `F ${first.F} -> ${last.F}`);
  assert.ok(Math.max(...loop.map((q) => q.R)) > bal.R && Math.min(...loop.map((q) => q.R)) < bal.R);
  assert.ok(LV_DT <= 0.1);
});

test("a fox with no food starves at its hunger limit", () => {
  for (const limit of [3, 10, 25]) {
    const sim = createSim({ settings: { foxHunger: limit, foxBirth: 30 }, rabbits: 0, foxes: 0, seed: 3 });
    drop(sim, "fox", 50, 50, 1);
    assert.equal(sim.foxes[0].hunger, 0);
    run(sim, limit - 1);
    assert.ok(sim.foxes.length >= 1, `limit ${limit}: died early`);
    assert.equal(sim.foxes[0].hunger, limit - 1);
    step(sim);
    /* Cubs start as hungry as their parent, so they go too. */
    assert.equal(sim.foxes.length, 0, `limit ${limit}: still ${sim.foxes.length} foxes`);
  }
});

test("a fox that keeps eating doesn't starve; a rabbit with no grass does", () => {
  const sim = createSim({ settings: { foxHunger: 5, rabbitBirth: 1, foxBirth: 1 }, rabbits: 0, foxes: 0, seed: 4, grass: 0 });
  drop(sim, "fox", 50, 50, 1);
  for (let day = 0; day < 20; day++) {
    const f = sim.foxes[0];
    drop(sim, "rabbit", f.x, f.y, 1, 0);
    step(sim);
  }
  assert.ok(sim.foxes.length >= 1);
  assert.ok(sim.foxes[0].hunger <= 1);

  const hungry = createSim({ settings: { rabbitHunger: 6, regrow: 80 }, rabbits: 0, foxes: 0, seed: 5, grass: 0 });
  hungry.grass.fill(0);
  drop(hungry, "rabbit", 20, 20, 1);
  /* Stop the grass from ever growing back: regrow is a chance per day. */
  const realStep = () => { hungry.grass.fill(0); step(hungry); };
  for (let k = 0; k < 5; k++) { realStep(); }
  assert.ok(hungry.rabbits.length >= 1);
  realStep();
  assert.equal(hungry.rabbits.length, 0);
});

test("the same seed gives the same run; another seed doesn't", () => {
  const make = (seed) => run(createSim({ settings: DEFAULT_SETTINGS, rabbits: 300, foxes: 30, seed }), 200);
  const a = make(7), b = make(7), c = make(8);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(a.foxes.map((f) => [f.x, f.y, f.hunger]), b.foxes.map((f) => [f.x, f.y, f.hunger]));
  assert.notDeepEqual(a.history, c.history);
});

test("steady cycles: several boom-and-crash waves, nobody dies out", () => {
  const P = PRESETS.steady;
  const sim = createSim({ settings: P.settings, rabbits: P.rabbits, foxes: P.foxes, seed: P.seed });
  for (let day = 0; day < 1500; day++) {
    step(sim);
    assert.ok(sim.foxes.length > 0 && sim.rabbits.length > 0, `died out on day ${day}`);
  }
  const foxWaves = waves(sim.history.map((h) => h.foxes));
  assert.ok(foxWaves >= 5, `only ${foxWaves} waves`);
  const rabbits = sim.history.slice(100).map((h) => h.rabbits);
  assert.ok(Math.max(...rabbits) > Math.min(...rabbits) * 3, "rabbits hardly swing");
});

test("foxes die out: rabbits carry on, held back by the grass", () => {
  const P = PRESETS["foxes-die"];
  const sim = run(createSim({ settings: P.settings, rabbits: P.rabbits, foxes: P.foxes, seed: P.seed }), 400);
  assert.equal(sim.foxes.length, 0);
  assert.ok(sim.rabbits.length > 100);
});

test("everything crashes: foxes eat every rabbit, then starve", () => {
  const P = PRESETS.crash;
  const sim = run(createSim({ settings: P.settings, rabbits: P.rabbits, foxes: P.foxes, seed: P.seed }), 300);
  assert.deepEqual([sim.rabbits.length, sim.foxes.length], [0, 0]);
  assert.ok(Math.max(...sim.history.map((h) => h.foxes)) > 300, "foxes never boomed");
  assert.ok(grassShare(sim) > 0.9, "grass should grow back");
});

test("settings are clamped; the field wraps; drops add animals", () => {
  const s = cleanSettings({ rabbitBirth: 999, foxHunger: -4, regrow: "x" });
  assert.equal(s.rabbitBirth, LIMITS.rabbitBirth.max);
  assert.equal(s.foxHunger, LIMITS.foxHunger.min);
  assert.equal(s.regrow, DEFAULT_SETTINGS.regrow);
  assert.equal(wrapDelta(98, 2), 4);
  assert.equal(wrapDelta(2, 98), -4);
  const sim = createSim({ rabbits: 10, foxes: 2, seed: 9 });
  assert.equal(drop(sim, "rabbit", 99, 99, 5), 5);
  assert.equal(drop(sim, "fox", 1, 1, 2), 2);
  assert.deepEqual([counts(sim).rabbits, counts(sim).foxes], [15, 4]);
  run(sim, 50);
  for (const a of [...sim.rabbits, ...sim.foxes]) { assert.ok(a.x >= 0 && a.x < SIZE && a.y >= 0 && a.y < SIZE); }
  applySettings(sim, { regrow: 3 });
  assert.equal(sim.settings.regrow, 3);
});
