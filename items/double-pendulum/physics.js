/* ============================================================
   Double Pendulum Chaos - the physics (pure, no DOM)

   Two rods, two bobs, one pivot. No friction.

     theta1, theta2   angle of each rod from straight down (rad)
     omega1, omega2   how fast each angle is changing (rad/s)

   The equations of motion are the exact ones from Lagrangian
   mechanics (no small-angle shortcut). We step them forward
   with RK4 (classic 4th-order Runge-Kutta) and a FIXED time
   step, so the same start always gives the same run.

   A state is [theta1, theta2, omega1, omega2].
   Params: { m1, m2, l1, l2, g } in kg, m, m/s^2.
   ============================================================ */

export const DEFAULT_PARAMS = Object.freeze({ m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 });

export const deg = (d) => (d * Math.PI) / 180;

/* d/dt of the state: [omega1, omega2, alpha1, alpha2]. */
export function derivs(s, p) {
  const [t1, t2, w1, w2] = s;
  const { m1, m2, l1, l2, g } = p;
  const d = t1 - t2;
  const sd = Math.sin(d), cd = Math.cos(d);
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
  const a1 = (-g * (2 * m1 + m2) * Math.sin(t1)
             - m2 * g * Math.sin(t1 - 2 * t2)
             - 2 * sd * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * cd)) / (l1 * den);
  const a2 = (2 * sd * (w1 * w1 * l1 * (m1 + m2)
             + g * (m1 + m2) * Math.cos(t1)
             + w2 * w2 * l2 * m2 * cd)) / (l2 * den);
  return [w1, w2, a1, a2];
}

/* One RK4 step of size dt. Returns a new state. */
export function rk4(s, p, dt) {
  const add = (a, b, h) => [a[0] + b[0] * h, a[1] + b[1] * h, a[2] + b[2] * h, a[3] + b[3] * h];
  const k1 = derivs(s, p);
  const k2 = derivs(add(s, k1, dt / 2), p);
  const k3 = derivs(add(s, k2, dt / 2), p);
  const k4 = derivs(add(s, k3, dt), p);
  return s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/* Where the bobs are, in metres, pivot at (0, 0), y pointing DOWN. */
export function positions(s, p) {
  const x1 = p.l1 * Math.sin(s[0]);
  const y1 = p.l1 * Math.cos(s[0]);
  return { x1, y1, x2: x1 + p.l2 * Math.sin(s[1]), y2: y1 + p.l2 * Math.cos(s[1]) };
}

/* Total energy in joules: moving (kinetic) + height (potential).
   Height is measured up from the lowest spot each bob can reach, so
   the total is never negative. With no friction it must stay put. */
export function energy(s, p) {
  const [t1, t2, w1, w2] = s;
  const { m1, m2, l1, l2, g } = p;
  const ke = 0.5 * m1 * l1 * l1 * w1 * w1
           + 0.5 * m2 * (l1 * l1 * w1 * w1 + l2 * l2 * w2 * w2 + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2));
  const h1 = l1 - l1 * Math.cos(t1);
  const h2 = l1 + l2 - l1 * Math.cos(t1) - l2 * Math.cos(t2);
  return ke + m1 * g * h1 + m2 * g * h2;
}

/* A fixed-step clock: feed it real time, it takes whole steps of
   exactly dt and keeps the leftover for next time. */
export function createStepper(dt = 1 / 600, maxSteps = 600) {
  let carry = 0;
  return {
    dt,
    steps(elapsed) {
      carry += elapsed;
      const n = Math.min(maxSteps, Math.floor(carry / dt));
      carry -= n * dt;
      if (n === maxSteps) { carry = 0; }      // way behind: drop it rather than spiral
      return n;
    },
    reset() { carry = 0; }
  };
}

/* How far apart two pendulums' lower bobs are, in metres. */
export function gap(a, b, p) {
  const pa = positions(a, p), pb = positions(b, p);
  return Math.hypot(pa.x2 - pb.x2, pa.y2 - pb.y2);
}

/* "Visibly split": the lower bobs are 5% of the full reach apart. */
export const SPLIT_FRACTION = 0.05;
export function hasSplit(a, b, p) {
  return gap(a, b, p) > SPLIT_FRACTION * (p.l1 + p.l2);
}

/* Starting states for n pendulums, each 0.001 degree further
   round (on the top rod), all at rest. */
export const NUDGE_DEG = 0.001;
export function startStates(n, theta1, theta2) {
  return Array.from({ length: n }, (_, i) => [theta1 + deg(NUDGE_DEG * i), theta2, 0, 0]);
}
