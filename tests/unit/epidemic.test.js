/* ============================================================
   Epidemic Sim - the model, unit tested

   - with 0% infection chance nobody else gets sick
   - the same seed gives the same run
   - totals always add up
   - vaccines, masks and distancing flatten the curve
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSim, step, run, counts, applySettings, infect, infectNear, attackRate, contactChance,
  contactRadius, S, I, R, V, SIZE, DT, MASK_FACTOR, DEFAULT_SETTINGS
} from "../../items/epidemic/model.js";

test("with 0% infection chance nobody else gets sick", () => {
  for (let seed = 1; seed <= 5; seed++) {
    const sim = createSim({ chance: 0 }, seed, 3);
    run(sim, 60);
    const c = counts(sim);
    assert.equal(c.sick + c.recovered, 3, `seed ${seed}`);
    assert.equal(sim.peak.sick, 3);
  }
});

test("the same seed gives the same run; another seed doesn't", () => {
  const a = run(createSim({}, 42, 2), 40);
  const b = run(createSim({}, 42, 2), 40);
  const c = run(createSim({}, 43, 2), 40);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(a.dots.map((d) => [d.x, d.y, d.state]), b.dots.map((d) => [d.x, d.y, d.state]));
  assert.notDeepEqual(a.history, c.history);
});

test("totals always add up, every step and every history point", () => {
  const sim = createSim({ n: 400, vaccinated: 20, masked: 30, distancing: 20 }, 7, 3);
  for (let k = 0; k < 800; k++) {
    step(sim);
    const c = counts(sim);
    assert.equal(c.healthy + c.sick + c.recovered + c.vaccinated, 400);
    if (k === 200) { applySettings(sim, { vaccinated: 60 }); }
  }
  for (const h of sim.history) { assert.equal(h.healthy + h.sick + h.recovered + h.vaccinated, 400); }
});

test("an outbreak happens with the default settings, then ends", () => {
  const sim = run(createSim({}, 1, 3), 300);
  assert.ok(attackRate(sim) > 0.5, `only ${attackRate(sim)} got sick`);
  assert.ok(sim.done);
  assert.equal(counts(sim).sick, 0);
  assert.ok(sim.peak.sick > 30);
});

test("dots stay in the box; still dots don't move", () => {
  const sim = createSim({ distancing: 50 }, 3, 1);
  const still = sim.dots.filter((d) => d.still).map((d) => [d.x, d.y]);
  assert.ok(still.length > 100 && still.length < 200);
  run(sim, 30);
  for (const d of sim.dots) { assert.ok(d.x >= 0 && d.x <= SIZE && d.y >= 0 && d.y <= SIZE); }
  assert.deepEqual(sim.dots.filter((d) => d.still).map((d) => [d.x, d.y]), still);
});

test("sick dots recover after the set number of days", () => {
  const sim = createSim({ chance: 0, days: 5 }, 1, 1);
  const zero = sim.dots.find((d) => d.state === I);
  run(sim, 4.9);
  assert.equal(zero.state, I);
  run(sim, 0.2);
  assert.equal(zero.state, R);
});

/* Average over a few seeds, so the test checks the trend. */
function meanPeak(settings, seeds = 8) {
  let sum = 0;
  for (let seed = 1; seed <= seeds; seed++) { sum += run(createSim(settings, seed, 3), 200).peak.sick; }
  return sum / seeds;
}

test("vaccines, masks and distancing flatten the curve", () => {
  const base = meanPeak({});
  assert.ok(meanPeak({ vaccinated: 60 }) < base * 0.5, "vaccines");
  assert.ok(meanPeak({ masked: 80 }) < base * 0.6, "masks");
  assert.ok(meanPeak({ distancing: 70 }) < base * 0.7, "distancing");
});

test("100% vaccinated: nobody can catch it", () => {
  const sim = createSim({ vaccinated: 100 }, 1, 3);
  assert.equal(counts(sim).sick, 0);
  assert.equal(counts(sim).vaccinated, DEFAULT_SETTINGS.n);
  assert.ok(sim.done);
});

test("vaccinating mid-run only changes healthy dots", () => {
  const sim = run(createSim({}, 2, 3), 15);
  const before = counts(sim);
  applySettings(sim, { vaccinated: 50 });
  const after = counts(sim);
  assert.equal(after.sick, before.sick);
  assert.equal(after.recovered, before.recovered);
  assert.ok(after.vaccinated > 0);
  applySettings(sim, { vaccinated: 0 });
  assert.equal(counts(sim).vaccinated, 0);
  assert.equal(counts(sim).healthy, before.healthy);
});

test("masks halve the chance on each side", () => {
  const s = { chance: 60 };
  const p = contactChance(s, false, false);
  assert.ok(Math.abs(p - (1 - 0.4 ** DT)) < 1e-12);
  assert.ok(Math.abs(contactChance(s, true, false) - p * MASK_FACTOR) < 1e-12);
  assert.ok(Math.abs(contactChance(s, true, true) - p * MASK_FACTOR ** 2) < 1e-12);
  assert.equal(contactChance({ chance: 0 }, false, false), 0);
});

test("tapping infects the nearest healthy dot", () => {
  const sim = createSim({ chance: 0 }, 5, 0);
  assert.equal(counts(sim).sick, 0);
  const d = sim.dots[10];
  const k = infectNear(sim, d.x + 0.01, d.y);
  assert.equal(k, 10);
  assert.equal(d.state, I);
  assert.equal(infect(sim, 10), false);              // already sick
  assert.equal(infectNear(sim, -50, -50), -1);        // nobody near
  assert.equal(sim.done, false);
});

test("the contact circle shrinks as dots are added", () => {
  assert.ok(contactRadius(1000) < contactRadius(300));
  assert.ok(Math.abs(contactRadius(300) * Math.sqrt(300) - contactRadius(1200) * Math.sqrt(1200)) < 1e-9);
  assert.equal([S, I, R, V].length, 4);
});
