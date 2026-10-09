/* ============================================================
   Double Pendulum Chaos - the physics, unit tested

   - energy stays within 0.5% over 10 simulated seconds
   - RK4 matches a known answer (small swings = two normal modes)
   - same start, same run (fixed time step)
   - two starts 0.001 degree apart end up visibly split
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rk4, energy, positions, derivs, createStepper, gap, hasSplit, startStates, deg, DEFAULT_PARAMS
} from "../../items/double-pendulum/physics.js";

const DT = 1 / 600;
const run = (s, p, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { s = rk4(s, p, DT); }
  return s;
};

test("energy stays within 0.5% over 10 simulated seconds", () => {
  const cases = [
    [[deg(120), deg(-20), 0, 0], DEFAULT_PARAMS],
    [[deg(170), deg(170), 0, 0], DEFAULT_PARAMS],
    [[deg(90), deg(0), 2, -3], { m1: 2, m2: 0.5, l1: 1.4, l2: 0.6, g: 9.81 }],
    [[deg(60), deg(150), 0, 0], { m1: 0.5, m2: 3, l1: 0.7, l2: 1.3, g: 24.8 }]
  ];
  for (const [s0, p] of cases) {
    const e0 = energy(s0, p);
    let s = s0, worst = 0;
    for (let i = 0; i < 6000; i++) {
      s = rk4(s, p, DT);
      worst = Math.max(worst, Math.abs(energy(s, p) - e0) / e0);
    }
    assert.ok(worst < 0.005, `energy drift ${(worst * 100).toFixed(4)}% for ${JSON.stringify(s0)}`);
  }
});

test("hanging still stays still; energy of the lowest spot is 0", () => {
  const s = run([0, 0, 0, 0], DEFAULT_PARAMS, 2);
  assert.ok(s.every((v) => Math.abs(v) < 1e-12));
  assert.equal(energy([0, 0, 0, 0], DEFAULT_PARAMS), 0);
});

test("small swings match the textbook normal mode", () => {
  /* Equal masses and lengths: the in-phase mode has
     theta2 = sqrt(2) * theta1 and omega^2 = (2 - sqrt(2)) g / l. */
  const p = DEFAULT_PARAMS;
  const a = 0.001;
  const w = Math.sqrt((2 - Math.SQRT2) * p.g / p.l1);
  const T = 2;
  const s = run([a, Math.SQRT2 * a, 0, 0], p, T);
  assert.ok(Math.abs(s[0] - a * Math.cos(w * T)) < a * 0.01, `theta1 ${s[0]} vs ${a * Math.cos(w * T)}`);
  assert.ok(Math.abs(s[1] - Math.SQRT2 * a * Math.cos(w * T)) < a * 0.01);
});

test("derivs: a single straight-out rod falls at g / l", () => {
  /* Both rods flat out to the side, at rest: the whole thing starts
     falling like one rod, so each angle speeds up at g / l. */
  const [, , a1, a2] = derivs([deg(90), deg(90), 0, 0], DEFAULT_PARAMS);
  assert.ok(Math.abs(a1 + 9.81) < 1e-9 && Math.abs(a2) < 1e-9);
});

test("positions: the bobs sit where the rods say", () => {
  const q = positions([deg(90), 0, 0, 0], DEFAULT_PARAMS);
  assert.ok(Math.abs(q.x1 - 1) < 1e-12 && Math.abs(q.y1) < 1e-12);
  assert.ok(Math.abs(q.x2 - 1) < 1e-12 && Math.abs(q.y2 - 1) < 1e-12);
});

test("same start, same run", () => {
  const a = run([deg(130), deg(10), 0, 0], DEFAULT_PARAMS, 5);
  const b = run([deg(130), deg(10), 0, 0], DEFAULT_PARAMS, 5);
  assert.deepEqual(a, b);
});

test("0.001 degree apart: the same at first, visibly split later", () => {
  const [a0, b0] = startStates(2, deg(120), deg(-20));
  assert.ok(Math.abs(b0[0] - a0[0] - deg(0.001)) < 1e-15);
  let a = a0, b = b0, splitAt = null;
  for (let i = 1; i <= 60 * 600 && splitAt === null; i++) {
    a = rk4(a, DEFAULT_PARAMS, DT);
    b = rk4(b, DEFAULT_PARAMS, DT);
    if (i === 600) { assert.ok(gap(a, b, DEFAULT_PARAMS) < 0.001, "still together after 1 s"); }
    if (hasSplit(a, b, DEFAULT_PARAMS)) { splitAt = i * DT; }
  }
  assert.ok(splitAt !== null && splitAt > 1, `split at ${splitAt}`);
});

test("stepper takes whole fixed steps and keeps the leftover", () => {
  const st = createStepper(0.01, 100);
  assert.equal(st.steps(0.025), 2);
  assert.equal(st.steps(0.006), 1);          // 0.005 carried + 0.006
  assert.equal(st.steps(5), 100);            // capped
  assert.equal(st.steps(0), 0);              // carry dropped after a cap
});
