/* ============================================================
   Gravity Sandbox - the physics, unit tested (no DOM)

   Newton's law of gravity: every body pulls on every other with

       F = G m1 m2 / d^2

   Integrator: leapfrog (kick-drift-kick, the same as velocity
   Verlet). It's "symplectic": it doesn't let energy creep up or
   down over time, so orbits stay closed for thousands of laps,
   where a simple Euler step would spiral them outwards.

   Collisions: two bodies that touch merge into one. Mass adds
   up, momentum is kept (m1 v1 + m2 v2 = (m1 + m2) v), and the
   new body sits at their centre of mass. Volume adds up too.

   Units: world units (about a screen pixel at zoom 1) and
   seconds. G = 1000 makes orbits take a few seconds.
   ============================================================ */

export const G = 1000;
export const SOFTENING = 0.5;     // stops the force blowing up at d = 0

export function body({ x = 0, y = 0, vx = 0, vy = 0, m = 1, r = 3, kind = "planet" } = {}) {
  return { x, y, vx, vy, m, r, kind, ax: 0, ay: 0, id: 0 };
}

export function createSim(bodies = [], { g = G, eps = SOFTENING } = {}) {
  const sim = { bodies: [], g, eps, t: 0, nextId: 1, merges: 0 };
  for (const b of bodies) { add(sim, b); }
  return sim;
}

export function add(sim, b) {
  b.id = sim.nextId++;
  sim.bodies.push(b);
  accelerations(sim);
  return b;
}

/* Everyone's acceleration from everyone else. O(n^2), fine for ~100 bodies. */
export function accelerations(sim) {
  const bs = sim.bodies, n = bs.length, e2 = sim.eps * sim.eps;
  for (const b of bs) { b.ax = 0; b.ay = 0; }
  for (let i = 0; i < n; i++) {
    const a = bs[i];
    for (let j = i + 1; j < n; j++) {
      const b = bs[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + e2;
      const k = sim.g / (d2 * Math.sqrt(d2));
      a.ax += k * b.m * dx; a.ay += k * b.m * dy;
      b.ax -= k * a.m * dx; b.ay -= k * a.m * dy;
    }
  }
}

/* Merge any bodies that touch. Returns how many merges happened. */
export function collide(sim) {
  let merged = 0;
  let again = true;
  while (again) {
    again = false;
    const bs = sim.bodies;
    outer:
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r) {
          bs[i] = merge(a, b);
          bs.splice(j, 1);
          merged += 1;
          again = true;        // the new, bigger body may now touch another
          break outer;
        }
      }
    }
  }
  sim.merges += merged;
  return merged;
}

/* Two bodies become one: mass, momentum and volume are all kept. */
export function merge(a, b) {
  const m = a.m + b.m;
  const big = a.m >= b.m ? a : b;
  return {
    ...big,
    x: (a.m * a.x + b.m * b.x) / m,
    y: (a.m * a.y + b.m * b.y) / m,
    vx: (a.m * a.vx + b.m * b.vx) / m,
    vy: (a.m * a.vy + b.m * b.vy) / m,
    m,
    r: Math.cbrt(a.r ** 3 + b.r ** 3)
  };
}

/* One leapfrog step: half kick, drift, (merge), new pull, half kick. */
export function step(sim, dt) {
  const bs = sim.bodies;
  for (const b of bs) { b.vx += b.ax * dt / 2; b.vy += b.ay * dt / 2; }
  for (const b of bs) { b.x += b.vx * dt; b.y += b.vy * dt; }
  collide(sim);
  accelerations(sim);
  for (const b of sim.bodies) { b.vx += b.ax * dt / 2; b.vy += b.ay * dt / 2; }
  sim.t += dt;
  return sim;
}

/* ---- conserved things ------------------------------------- */
export function energy(sim) {
  const bs = sim.bodies, e2 = sim.eps * sim.eps;
  let ke = 0, pe = 0;
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i];
    ke += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy);
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j];
      pe -= (sim.g * a.m * b.m) / Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + e2);
    }
  }
  return { ke, pe, total: ke + pe };
}

export function momentum(sim) {
  let px = 0, py = 0;
  for (const b of sim.bodies) { px += b.m * b.vx; py += b.m * b.vy; }
  return [px, py];
}

export function centreOfMass(sim) {
  let m = 0, x = 0, y = 0;
  for (const b of sim.bodies) { m += b.m; x += b.m * b.x; y += b.m * b.y; }
  return m > 0 ? [x / m, y / m] : [0, 0];
}

/* Speed for a circular orbit at distance r around mass M. */
export const circularSpeed = (M, r, g = G) => Math.sqrt((g * M) / r);

/* Make the total momentum zero, so the whole system doesn't drift off. */
export function zeroMomentum(sim) {
  const [px, py] = momentum(sim);
  const m = sim.bodies.reduce((s, b) => s + b.m, 0);
  for (const b of sim.bodies) { b.vx -= px / m; b.vy -= py / m; }
  return sim;
}

/* ============================================================
   PRESETS: bodies + how far out to show (extent, world units)
   ============================================================ */
export const PRESETS = {
  solar: {
    name: "Sun + planets",
    extent: 290,
    make() {
      const sun = body({ m: 1000, r: 16, kind: "star" });
      const planets = [[70, 2, 4], [120, 6, 6], [180, 10, 7], [255, 3, 4.5]].map(([d, m, r], k) => {
        const a = k * 1.9;                          // spread them round
        const v = circularSpeed(1000, d);
        return body({ x: d * Math.cos(a), y: d * Math.sin(a), vx: -v * Math.sin(a), vy: v * Math.cos(a), m, r });
      });
      return [sun, ...planets];
    }
  },
  binary: {
    name: "Binary stars",
    extent: 300,
    make() {
      /* Equal stars on one circle round their centre: v = sqrt(G m / 4a). */
      const m = 500, a = 55, v = Math.sqrt((G * m) / (4 * a));
      const d = 250, vp = circularSpeed(2 * m, d);
      return [
        body({ x: -a, vy: -v, m, r: 11, kind: "star" }),
        body({ x: a, vy: v, m, r: 11, kind: "star" }),
        body({ y: -d, vx: vp, m: 3, r: 5 })        // a planet round both
      ];
    }
  },
  figure8: {
    name: "Figure-8",
    extent: 170,
    /* Chenciner & Montgomery (2000): three equal masses chase
       each other round one figure of eight. Scaled from G = m = 1
       by length L and speed V, with G m = V^2 L. */
    make() {
      const L = 150, V = 150, m = (V * V * L) / G;
      const p = [0.97000436, -0.24308753], v3 = [-0.93240737, -0.86473146];
      return [
        body({ x: p[0] * L, y: p[1] * L, vx: (-v3[0] / 2) * V, vy: (-v3[1] / 2) * V, m, r: 7, kind: "a" }),
        body({ x: -p[0] * L, y: -p[1] * L, vx: (-v3[0] / 2) * V, vy: (-v3[1] / 2) * V, m, r: 7, kind: "b" }),
        body({ x: 0, y: 0, vx: v3[0] * V, vy: v3[1] * V, m, r: 7, kind: "c" })
      ];
    }
  },
  moons: {
    name: "Planet + moons",
    extent: 200,
    make() {
      const M = 400;
      const planet = body({ m: M, r: 13, kind: "planet" });
      const moons = [[45, 0.5, 2.5, 0], [85, 1, 3.5, 2.1], [140, 1.5, 4, 4.2], [175, 0.3, 2, 1]].map(([d, m, r, a]) => {
        const v = circularSpeed(M, d);
        return body({ x: d * Math.cos(a), y: d * Math.sin(a), vx: -v * Math.sin(a), vy: v * Math.cos(a), m, r, kind: "moon" });
      });
      return [planet, ...moons];
    }
  }
};
export const PRESET_IDS = Object.keys(PRESETS);

export function loadPreset(id) {
  const sim = createSim(PRESETS[id].make());
  if (id !== "figure8") { zeroMomentum(sim); }   // the figure-8 already has zero
  return sim;
}

/* Sizes for a thrown body. */
export const SIZES = {
  moon: { m: 0.5, r: 3, kind: "moon" },
  planet: { m: 8, r: 6, kind: "planet" },
  star: { m: 400, r: 12, kind: "star" }
};
