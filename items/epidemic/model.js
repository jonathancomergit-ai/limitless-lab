/* ============================================================
   Epidemic Sim - the model (no DOM, unit tested)

   Dots wander round a 100 x 100 box. When a sick dot comes
   within CONTACT_RADIUS of a healthy one, the germ may jump.

   Every dot has a state:
     S healthy (can catch it)   I sick   R recovered   V vaccinated
   Sick dots recover after `days` days. Recovered and vaccinated
   dots can't catch it again.

   Each dot also gets three fixed random numbers at the start.
   The sliders compare against them, so moving a slider changes
   the same dots every time (and a run is repeatable):
     vaxRoll  < vaccinated %  -> vaccinated (if still healthy)
     maskRoll < masked %      -> wears a mask
     moveRoll < distancing %  -> stays at home (doesn't move)

   Everything random comes from one seeded generator, so the
   same seed and settings give exactly the same run.
   ============================================================ */

export const S = 0, I = 1, R = 2, V = 3;
export const SIZE = 100;              // the box is SIZE x SIZE
export const CONTACT_RADIUS = 2.5;      // at 300 dots; scaled for other counts
export const SPEED = 6;               // box units per day
export const DT = 0.05;               // days per step
export const MASK_FACTOR = 0.5;       // a mask halves the chance (each side)
export const SAMPLE_EVERY = 0.25;     // days between history points

export const DEFAULT_SETTINGS = Object.freeze({
  n: 300,          // dots
  chance: 60,      // % chance per day of close contact
  days: 7,         // days sick
  vaccinated: 0,   // %
  masked: 0,       // %
  distancing: 0    // % of dots that stay still
});

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A new run. `sick` dots start ill (picked from the unvaccinated). */
export function createSim(settings = {}, seed = 1, sick = 1) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const rnd = mulberry32(seed);
  const n = Math.max(1, Math.floor(s.n));
  const dots = [];
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    dots.push({
      x: rnd() * SIZE, y: rnd() * SIZE,
      vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED,
      state: S, sickSince: 0,
      vaxRoll: rnd(), maskRoll: rnd(), moveRoll: rnd()
    });
  }
  const sim = { settings: s, dots, radius: contactRadius(n), t: 0, rnd, history: [], peak: { t: 0, sick: 0 }, nextSample: 0, done: false };
  applySettings(sim, s);
  /* Patient zero: the first unvaccinated dots. */
  let left = sick;
  for (const d of dots) {
    if (left <= 0) { break; }
    if (d.state === S) { d.state = I; d.sickSince = 0; left--; }
  }
  sample(sim);
  return sim;
}

/* More dots = smaller contact circle, so the crowd keeps about
   the same number of meetings per day whatever the dot count. */
export function contactRadius(n) {
  return CONTACT_RADIUS * Math.sqrt(300 / Math.max(1, n));
}

/* Change sliders mid-run. Only healthy dots can become
   vaccinated (and only vaccinated ones go back to healthy). */
export function applySettings(sim, settings) {
  const s = (sim.settings = { ...sim.settings, ...settings });
  for (const d of sim.dots) {
    const vax = d.vaxRoll < s.vaccinated / 100;
    if (vax && d.state === S) { d.state = V; }
    if (!vax && d.state === V) { d.state = S; }
    d.masked = d.maskRoll < s.masked / 100;
    d.still = d.moveRoll < s.distancing / 100;
  }
  return sim;
}

export function counts(sim) {
  const c = { healthy: 0, sick: 0, recovered: 0, vaccinated: 0, total: sim.dots.length };
  for (const d of sim.dots) {
    if (d.state === S) { c.healthy++; } else if (d.state === I) { c.sick++; } else if (d.state === R) { c.recovered++; } else { c.vaccinated++; }
  }
  return c;
}

function sample(sim) {
  const c = counts(sim);
  sim.history.push({ t: sim.t, healthy: c.healthy, sick: c.sick, recovered: c.recovered, vaccinated: c.vaccinated });
  if (c.sick > sim.peak.sick) { sim.peak = { t: sim.t, sick: c.sick }; }
  sim.nextSample = sim.t + SAMPLE_EVERY;
  if (c.sick === 0) { sim.done = true; }
}

/* Chance one contact passes the germ on during one step. */
export function contactChance(settings, sickMasked, healthyMasked, dt = DT) {
  const perDay = Math.min(1, Math.max(0, settings.chance / 100));
  let p = 1 - Math.pow(1 - perDay, dt);
  if (sickMasked) { p *= MASK_FACTOR; }
  if (healthyMasked) { p *= MASK_FACTOR; }
  return p;
}

/* One step of DT days. */
export function step(sim) {
  if (sim.done) { return sim; }
  const { dots, rnd, settings } = sim;
  sim.t += DT;

  /* 1. Move. Dots bounce off the walls and wobble a little. */
  for (const d of dots) {
    if (d.still) { continue; }
    const turn = (rnd() - 0.5) * 0.6;
    const c = Math.cos(turn), s = Math.sin(turn);
    [d.vx, d.vy] = [d.vx * c - d.vy * s, d.vx * s + d.vy * c];
    d.x += d.vx * DT;
    d.y += d.vy * DT;
    if (d.x < 0) { d.x = -d.x; d.vx = Math.abs(d.vx); }
    if (d.x > SIZE) { d.x = 2 * SIZE - d.x; d.vx = -Math.abs(d.vx); }
    if (d.y < 0) { d.y = -d.y; d.vy = Math.abs(d.vy); }
    if (d.y > SIZE) { d.y = 2 * SIZE - d.y; d.vy = -Math.abs(d.vy); }
  }

  /* 2. Spread. A grid of buckets so each sick dot only checks
        the dots near it. New cases start next step. */
  const cell = sim.radius;
  const nCells = Math.ceil(SIZE / cell) + 1;
  const buckets = new Map();
  for (let k = 0; k < dots.length; k++) {
    const d = dots[k];
    if (d.state !== S) { continue; }
    const key = Math.floor(d.x / cell) * nCells + Math.floor(d.y / cell);
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push(k);
  }
  const r2 = sim.radius * sim.radius;
  const caught = [];
  for (const d of dots) {
    if (d.state !== I) { continue; }
    const cx = Math.floor(d.x / cell), cy = Math.floor(d.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const b = buckets.get(gx * nCells + gy);
        if (!b) { continue; }
        for (const k of b) {
          const o = dots[k];
          const dx = o.x - d.x, dy = o.y - d.y;
          if (dx * dx + dy * dy > r2) { continue; }
          if (rnd() < contactChance(settings, d.masked, o.masked)) { caught.push(o); }
        }
      }
    }
  }

  /* 3. Recover. */
  for (const d of dots) {
    if (d.state === I && sim.t - d.sickSince >= settings.days) { d.state = R; }
  }
  for (const o of caught) {
    if (o.state === S) { o.state = I; o.sickSince = sim.t; }
  }

  if (sim.t >= sim.nextSample - 1e-9) { sample(sim); }
  return sim;
}

export function run(sim, days) {
  const steps = Math.round(days / DT);
  for (let k = 0; k < steps && !sim.done; k++) { step(sim); }
  return sim;
}

/* Tap: make the nearest healthy dot within `radius` sick.
   Returns its index, or -1. */
export function infectNear(sim, x, y, radius = 6) {
  let best = -1, bestD = radius * radius;
  sim.dots.forEach((d, k) => {
    if (d.state !== S) { return; }
    const d2 = (d.x - x) ** 2 + (d.y - y) ** 2;
    if (d2 <= bestD) { best = k; bestD = d2; }
  });
  if (best >= 0) { infect(sim, best); }
  return best;
}

export function infect(sim, k) {
  const d = sim.dots[k];
  if (!d || d.state !== S) { return false; }
  d.state = I;
  d.sickSince = sim.t;
  sim.done = false;
  sample(sim);
  return true;
}

/* Ever sick so far (sick now + recovered). */
export function attackRate(sim) {
  const c = counts(sim);
  return (c.sick + c.recovered) / c.total;
}
