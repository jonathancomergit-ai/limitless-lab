/* ============================================================
   Gravity Sandbox - the physics, unit tested

   - a circular orbit keeps its radius within 1% over 10 orbits
   - a merge keeps momentum (and mass, and volume)
   - energy and momentum stay put over many steps
   - the figure-8 comes back to where it started after one period
   - leapfrog run backwards retraces its steps
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  G, body, createSim, step, merge, collide, energy, momentum, centreOfMass, circularSpeed, loadPreset, PRESET_IDS, add
} from "../../items/gravity-sandbox/physics.js";

const DT = 1 / 600;

test("a circular orbit keeps its radius within 1% over 10 orbits", () => {
  for (const [M, r] of [[1000, 100], [400, 60], [1000, 250]]) {
    /* A tiny planet, so the star barely wobbles. */
    const v = circularSpeed(M, r);
    const sim = createSim([body({ m: M, r: 5 }), body({ x: r, vy: v, m: 1e-6, r: 1 })]);
    const period = (2 * Math.PI * r) / v;
    const steps = Math.ceil((10 * period) / DT);
    let worst = 0;
    for (let k = 0; k < steps; k++) {
      step(sim, DT);
      const [s, p] = sim.bodies;
      worst = Math.max(worst, Math.abs(Math.hypot(p.x - s.x, p.y - s.y) - r) / r);
    }
    assert.equal(sim.bodies.length, 2);
    assert.ok(worst < 0.01, `M=${M} r=${r}: radius wandered ${(worst * 100).toFixed(3)}%`);
  }
});

test("a merge keeps momentum, mass and volume", () => {
  const a = body({ x: 0, y: 0, vx: 10, vy: -2, m: 3, r: 4 });
  const b = body({ x: 5, y: 1, vx: -4, vy: 7, m: 1, r: 2 });
  const c = merge(a, b);
  assert.equal(c.m, 4);
  assert.ok(Math.abs(c.m * c.vx - (3 * 10 + 1 * -4)) < 1e-12);
  assert.ok(Math.abs(c.m * c.vy - (3 * -2 + 1 * 7)) < 1e-12);
  assert.ok(Math.abs(c.r ** 3 - (4 ** 3 + 2 ** 3)) < 1e-9);
  assert.ok(Math.abs(c.x - 1.25) < 1e-12 && Math.abs(c.y - 0.25) < 1e-12, "at the centre of mass");
});

test("a head-on crash inside the sim merges and keeps total momentum", () => {
  const sim = createSim([
    body({ x: -40, vx: 60, m: 5, r: 4 }),
    body({ x: 40, vx: -20, vy: 2, m: 2, r: 3 })
  ]);
  const p0 = momentum(sim);
  const com0 = centreOfMass(sim);
  let k = 0;
  while (sim.bodies.length > 1 && k++ < 5000) { step(sim, DT); }
  assert.equal(sim.bodies.length, 1, "they merged");
  assert.equal(sim.merges, 1);
  const p1 = momentum(sim);
  assert.ok(Math.abs(p1[0] - p0[0]) < 1e-9 && Math.abs(p1[1] - p0[1]) < 1e-9, `momentum ${p0} -> ${p1}`);
  /* The centre of mass moves in a straight line at P / M. */
  const [cx, cy] = centreOfMass(sim);
  assert.ok(Math.abs(cx - (com0[0] + (p0[0] / 7) * sim.t)) < 1e-6);
  assert.ok(Math.abs(cy - (com0[1] + (p0[1] / 7) * sim.t)) < 1e-6);
});

test("collide merges a chain of touching bodies into one", () => {
  const sim = createSim([body({ x: 0, r: 3 }), body({ x: 5, r: 3 }), body({ x: 9, r: 3 })]);   // the first two merge, then reach the third
  collide(sim);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].m, 3);
});

test("every preset: energy stays within 0.5% and momentum stays put over 10 s", () => {
  for (const id of PRESET_IDS) {
    const sim = loadPreset(id);
    const n0 = sim.bodies.length;
    const e0 = energy(sim).total;
    const p0 = momentum(sim);
    let worst = 0;
    for (let k = 0; k < 6000; k++) {
      step(sim, DT);
      worst = Math.max(worst, Math.abs((energy(sim).total - e0) / e0));
    }
    assert.equal(sim.bodies.length, n0, `${id}: nothing should crash`);
    assert.ok(worst < 0.005, `${id}: energy drift ${(worst * 100).toFixed(4)}%`);
    const p1 = momentum(sim);
    assert.ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-6, `${id}: momentum`);
  }
});

test("the figure-8 comes back round after one period", () => {
  const sim = loadPreset("figure8");
  const start = sim.bodies.map((b) => [b.x, b.y]);
  /* Period 6.3259 in G = m = 1 units; time scale here is L / V = 1 s. */
  const T = 6.32591398;
  const n = Math.round(T / DT);
  for (let k = 0; k < n; k++) { step(sim, DT); }
  sim.bodies.forEach((b, i) => {
    const d = Math.hypot(b.x - start[i][0], b.y - start[i][1]);
    assert.ok(d < 3, `body ${i} is ${d.toFixed(2)} away from its start`);
  });
});

test("leapfrog is time-reversible: run back, end up at the start", () => {
  const sim = loadPreset("solar");
  const start = sim.bodies.map((b) => [b.x, b.y]);
  for (let k = 0; k < 1200; k++) { step(sim, DT); }
  for (const b of sim.bodies) { b.vx = -b.vx; b.vy = -b.vy; }
  for (let k = 0; k < 1200; k++) { step(sim, DT); }
  sim.bodies.forEach((b, i) => assert.ok(Math.hypot(b.x - start[i][0], b.y - start[i][1]) < 1e-6));
});

test("add gives each body its own id and updates the pull", () => {
  const sim = createSim([body({ m: 100 })]);
  const b = add(sim, body({ x: 50, m: 1 }));
  assert.notEqual(b.id, sim.bodies[0].id);
  assert.ok(b.ax < 0, "pulled towards the big one");
  assert.ok(Math.abs(b.ax + (G * 100) / 2500) < 1);
});
