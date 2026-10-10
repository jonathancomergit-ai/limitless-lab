/* ============================================================
   Predator & Prey - the model (no DOM, unit tested)

   Two parts:

   A. THE AGENTS. A 100 x 100 field that wraps at the edges
      (walk off the right, come back on the left).
      - Grass: a GRID x GRID patchwork. An eaten patch grows
        back with a chance of 1/regrow each day.
      - Rabbits wander. Standing on grass, a hungry rabbit eats
        it. A rabbit that ate recently may have a baby.
      - Foxes wander, and chase a rabbit they can see. Catching
        one = a meal. A fox that ate recently may have a cub.
      - Anyone who goes `hunger limit` days without a meal dies.
      One step = one day. Everything random comes from one
      seeded generator, so the same seed gives the same run.

   B. THE EQUATIONS. Lotka-Volterra, the textbook version:
        rabbits' = a R - b R F      (born, eaten)
        foxes'   = d R F - g F      (born from meals, starve)
      Stepped with leapfrog in log space, where the system is a
      Hamiltonian, so its conserved quantity
        V = d R - g ln R + b F - a ln F
      stays put and the loops close.
   ============================================================ */

export const SIZE = 100;            // the field is SIZE x SIZE
export const GRID = 50;             // grass patches per side
export const RABBIT_SPEED = 1.0;    // units per day
export const FOX_SPEED = 1.5;
export const SIGHT = 7;             // how far a fox can see a rabbit
export const CATCH = 1.6;           // how close a fox must get
export const MAX_RABBITS = 4000;    // safety caps (keeps phones smooth)
export const MAX_FOXES = 1000;
export const SAMPLE_EVERY = 1;      // days between history points
export const HISTORY_MAX = 3000;    // points kept

/* The sliders. Births are % chance per day (for a fed animal).
   Hunger limits are days without food. Regrow is days (on
   average) for an eaten grass patch to grow back. */
export const DEFAULT_SETTINGS = Object.freeze({
  rabbitBirth: 15,
  foxBirth: 4,
  rabbitHunger: 10,
  foxHunger: 10,
  regrow: 25
});

export const LIMITS = Object.freeze({
  rabbitBirth:  { min: 1, max: 50 },
  foxBirth:     { min: 1, max: 30 },
  rabbitHunger: { min: 3, max: 40 },
  foxHunger:    { min: 3, max: 60 },
  regrow:       { min: 2, max: 80 }
});

/* Each preset: settings + starting numbers + a seed, so every
   visit shows the same story. */
export const PRESETS = Object.freeze({
  steady: {
    label: "Steady cycles",
    settings: { ...DEFAULT_SETTINGS },
    rabbits: 300, foxes: 30, seed: 7
  },
  "foxes-die": {
    label: "Foxes die out",
    settings: { rabbitBirth: 15, foxBirth: 4, rabbitHunger: 10, foxHunger: 4, regrow: 60 },
    rabbits: 300, foxes: 30, seed: 7
  },
  crash: {
    label: "Everything crashes",
    settings: { rabbitBirth: 15, foxBirth: 10, rabbitHunger: 10, foxHunger: 30, regrow: 25 },
    rabbits: 300, foxes: 30, seed: 7
  }
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

/* ============================================================
   A. THE AGENTS
   ============================================================ */

export function cleanSettings(s = {}) {
  const out = {};
  for (const [k, lim] of Object.entries(LIMITS)) {
    const v = Number(s[k] ?? DEFAULT_SETTINGS[k]);
    out[k] = Number.isFinite(v) ? Math.min(lim.max, Math.max(lim.min, v)) : DEFAULT_SETTINGS[k];
  }
  return out;
}

const wrap = (v) => ((v % SIZE) + SIZE) % SIZE;
/* Shortest way from a to b on a wrapping line. */
export function wrapDelta(a, b) {
  let d = b - a;
  if (d > SIZE / 2) { d -= SIZE; } else if (d < -SIZE / 2) { d += SIZE; }
  return d;
}

function animal(rnd, x, y) {
  return { x: wrap(x), y: wrap(y), heading: rnd() * Math.PI * 2, hunger: 0 };
}

/* A baby starts as hungry as its parent: no free meals, so a
   family that never eats dies out at its hunger limit. */
function baby(rnd, parent) {
  const b = animal(rnd, parent.x + rnd() - 0.5, parent.y + rnd() - 0.5);
  b.hunger = parent.hunger;
  return b;
}

/* A new run: grass mostly grown, animals scattered. */
export function createSim({ settings = {}, rabbits = 300, foxes = 30, seed = 1, grass = 0.8 } = {}) {
  const rnd = mulberry32(seed);
  const sim = {
    settings: cleanSettings(settings),
    rnd,
    t: 0,
    grass: new Uint8Array(GRID * GRID),   // 1 = grown, 0 = eaten
    rabbits: [],
    foxes: [],
    history: [],
    born: { rabbits: 0, foxes: 0 },
    eaten: 0
  };
  for (let k = 0; k < sim.grass.length; k++) { sim.grass[k] = rnd() < grass ? 1 : 0; }
  for (let k = 0; k < rabbits; k++) {
    const r = animal(rnd, rnd() * SIZE, rnd() * SIZE);
    r.hunger = Math.floor(rnd() * sim.settings.rabbitHunger * 0.5);
    sim.rabbits.push(r);
  }
  for (let k = 0; k < foxes; k++) {
    const f = animal(rnd, rnd() * SIZE, rnd() * SIZE);
    f.hunger = Math.floor(rnd() * sim.settings.foxHunger * 0.5);
    sim.foxes.push(f);
  }
  sample(sim);
  return sim;
}

export function applySettings(sim, settings) {
  sim.settings = cleanSettings({ ...sim.settings, ...settings });
  return sim;
}

export function grassCell(x, y) {
  const gx = Math.min(GRID - 1, Math.floor((wrap(x) / SIZE) * GRID));
  const gy = Math.min(GRID - 1, Math.floor((wrap(y) / SIZE) * GRID));
  return gy * GRID + gx;
}

export function grassShare(sim) {
  let n = 0;
  for (const g of sim.grass) { n += g; }
  return n / sim.grass.length;
}

export function counts(sim) {
  return { rabbits: sim.rabbits.length, foxes: sim.foxes.length, grass: grassShare(sim) };
}

function sample(sim) {
  const c = counts(sim);
  sim.history.push({ t: sim.t, rabbits: c.rabbits, foxes: c.foxes, grass: c.grass });
  if (sim.history.length > HISTORY_MAX) { sim.history.splice(0, sim.history.length - HISTORY_MAX); }
}

/* Wander: a little random turn, then a step forward. */
function wander(a, rnd, speed, turn) {
  a.heading += (rnd() - 0.5) * turn;
  a.x = wrap(a.x + Math.cos(a.heading) * speed);
  a.y = wrap(a.y + Math.sin(a.heading) * speed);
}

/* Rabbits in buckets of SIGHT x SIGHT, so a fox only checks
   the rabbits near it. */
const CELLS = Math.floor(SIZE / SIGHT);     // buckets per side
function bucketOf(x, y) {
  const bx = Math.min(CELLS - 1, Math.floor((x / SIZE) * CELLS));
  const by = Math.min(CELLS - 1, Math.floor((y / SIZE) * CELLS));
  return by * CELLS + bx;
}
function buildBuckets(rabbits) {
  const buckets = Array.from({ length: CELLS * CELLS }, () => []);
  for (const r of rabbits) { buckets[bucketOf(r.x, r.y)].push(r); }
  return buckets;
}

/* The closest live rabbit within `reach` of (x, y), or null. */
export function nearestRabbit(buckets, x, y, reach) {
  const bx = Math.min(CELLS - 1, Math.floor((x / SIZE) * CELLS));
  const by = Math.min(CELLS - 1, Math.floor((y / SIZE) * CELLS));
  let best = null, bestD = reach * reach;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const b = buckets[((by + dy + CELLS) % CELLS) * CELLS + ((bx + dx + CELLS) % CELLS)];
      for (const r of b) {
        if (r.dead) { continue; }
        const ex = wrapDelta(x, r.x), ey = wrapDelta(y, r.y);
        const d2 = ex * ex + ey * ey;
        if (d2 <= bestD) { best = r; bestD = d2; }
      }
    }
  }
  return best;
}

/* One day. */
export function step(sim) {
  const { rnd, settings: s, grass } = sim;
  sim.t += 1;

  /* 1. Grass grows back. */
  const grow = 1 / s.regrow;
  for (let k = 0; k < grass.length; k++) {
    if (!grass[k] && rnd() < grow) { grass[k] = 1; }
  }

  /* 2. Rabbits: wander, eat, maybe breed, maybe starve. */
  const rabbitBirth = s.rabbitBirth / 100;
  const babies = [];
  for (const r of sim.rabbits) {
    wander(r, rnd, RABBIT_SPEED, 1.2);
    r.hunger += 1;
    const cell = grassCell(r.x, r.y);
    if (grass[cell] && r.hunger > 1) { grass[cell] = 0; r.hunger = 0; }
    if (r.hunger >= s.rabbitHunger) { r.dead = true; continue; }
    if (r.hunger < s.rabbitHunger / 2 && rnd() < rabbitBirth) {
      babies.push(baby(rnd, r));
    }
  }
  sim.rabbits = sim.rabbits.filter((r) => !r.dead);
  for (const b of babies) {
    if (sim.rabbits.length >= MAX_RABBITS) { break; }
    sim.rabbits.push(b);
    sim.born.rabbits++;
  }

  /* 3. Foxes: chase or wander, catch, maybe breed, maybe starve. */
  const buckets = buildBuckets(sim.rabbits);
  const foxBirth = s.foxBirth / 100;
  const cubs = [];
  for (const f of sim.foxes) {
    const prey = nearestRabbit(buckets, f.x, f.y, SIGHT);
    if (prey) {
      const ex = wrapDelta(f.x, prey.x), ey = wrapDelta(f.y, prey.y);
      const d = Math.hypot(ex, ey);
      f.heading = Math.atan2(ey, ex);
      const go = Math.min(FOX_SPEED, d);
      f.x = wrap(f.x + (d > 0 ? (ex / d) * go : 0));
      f.y = wrap(f.y + (d > 0 ? (ey / d) * go : 0));
    } else {
      wander(f, rnd, FOX_SPEED, 0.9);
    }
    f.hunger += 1;
    const meal = nearestRabbit(buckets, f.x, f.y, CATCH);
    if (meal) { meal.dead = true; f.hunger = 0; sim.eaten++; }
    if (f.hunger >= s.foxHunger) { f.dead = true; continue; }
    if (f.hunger < s.foxHunger / 2 && rnd() < foxBirth) {
      cubs.push(baby(rnd, f));
    }
  }
  sim.rabbits = sim.rabbits.filter((r) => !r.dead);
  sim.foxes = sim.foxes.filter((f) => !f.dead);
  for (const c of cubs) {
    if (sim.foxes.length >= MAX_FOXES) { break; }
    sim.foxes.push(c);
    sim.born.foxes++;
  }

  if (sim.t % SAMPLE_EVERY === 0) { sample(sim); }
  return sim;
}

export function run(sim, days) {
  for (let k = 0; k < days; k++) { step(sim); }
  return sim;
}

/* Tap: drop `n` rabbits or foxes around (x, y). They start fed. */
export function drop(sim, kind, x, y, n = 1, spread = 3) {
  const list = kind === "fox" ? sim.foxes : sim.rabbits;
  const cap = kind === "fox" ? MAX_FOXES : MAX_RABBITS;
  let added = 0;
  for (let k = 0; k < n && list.length < cap; k++) {
    const a = sim.rnd() * Math.PI * 2, d = Math.sqrt(sim.rnd()) * spread;
    list.push(animal(sim.rnd, x + Math.cos(a) * d, y + Math.sin(a) * d));
    added++;
  }
  return added;
}

/* ============================================================
   B. THE EQUATIONS (Lotka-Volterra)
   ============================================================ */

/* Turn the slider settings into the four rates.
   a  rabbit births per rabbit per day (when there's food)
   b  catches per fox per rabbit per day: a fox sweeps a strip
      2 x SIGHT wide at FOX_SPEED, out of the whole field
   d  fox births per rabbit eaten, per fox per day = b x cubs per meal
   g  fox deaths per fox per day: one over the hunger limit
   It's a rough match, not a fit: the equations have no grass,
   no space and no luck. That's the point of comparing. */
export function lvParams(settings) {
  const s = cleanSettings(settings);
  const b = (2 * SIGHT * FOX_SPEED) / (SIZE * SIZE);
  /* A fed fox may breed until it's half-way to its hunger
     limit; on average a meal buys about a quarter of it. */
  const cubsPerMeal = Math.min(1, (s.foxBirth / 100) * (s.foxHunger / 4));
  return {
    /* Rabbits only breed when fed: about three days in four. */
    a: (s.rabbitBirth / 100) * 0.75,
    b,
    d: b * cubsPerMeal,
    g: 1 / s.foxHunger
  };
}

/* The quantity that never changes along a Lotka-Volterra loop. */
export function lvConserved(p, R, F) {
  return p.d * R - p.g * Math.log(R) + p.b * F - p.a * Math.log(F);
}

/* The balance point: where both populations stay still. */
export function lvBalance(p) {
  return { R: p.g / p.d, F: p.a / p.b };
}

export const LV_DT = 0.05;   // days per leapfrog step

export function createLV(params, R, F) {
  return { p: { ...params }, u: Math.log(Math.max(1e-6, R)), v: Math.log(Math.max(1e-6, F)), t: 0, history: [] };
}

export function lvState(lv) {
  return { R: Math.exp(lv.u), F: Math.exp(lv.v) };
}

/* Leapfrog (Stormer-Verlet) in log space:
   u = ln R, v = ln F,  u' = a - b e^v,  v' = d e^u - g. */
export function stepLV(lv, dt = LV_DT) {
  const { a, b, d, g } = lv.p;
  lv.u += 0.5 * dt * (a - b * Math.exp(lv.v));
  lv.v += dt * (d * Math.exp(lv.u) - g);
  lv.u += 0.5 * dt * (a - b * Math.exp(lv.v));
  lv.t += dt;
  return lv;
}

/* Advance by whole days, keeping one history point a day. */
export function runLV(lv, days) {
  const n = Math.round(1 / LV_DT);
  for (let k = 0; k < days; k++) {
    for (let j = 0; j < n; j++) { stepLV(lv); }
    lv.t = Math.round(lv.t);
    const { R, F } = lvState(lv);
    lv.history.push({ t: lv.t, rabbits: R, foxes: F });
    if (lv.history.length > HISTORY_MAX) { lv.history.splice(0, lv.history.length - HISTORY_MAX); }
  }
  return lv;
}

/* One full loop of the equations from (R, F), for the
   rabbits-vs-foxes plot. Walks round the balance point (in log
   space) until it has turned a full circle. */
export function lvLoop(p, R, F, maxDays = 3000) {
  const lv = createLV(p, R, F);
  const bal = lvBalance(p);
  const cu = Math.log(bal.R), cv = Math.log(bal.F);
  const angle = () => Math.atan2(lv.v - cv, lv.u - cu);
  const pts = [lvState(lv)];
  let turned = 0, last = angle();
  const n = Math.round(1 / LV_DT);
  for (let k = 0; k < maxDays * n && Math.abs(turned) < Math.PI * 2; k++) {
    stepLV(lv);
    const a = angle();
    let da = a - last;
    if (da > Math.PI) { da -= Math.PI * 2; } else if (da < -Math.PI) { da += Math.PI * 2; }
    turned += da;
    last = a;
    if (k % 5 === 0) { pts.push(lvState(lv)); }
  }
  pts.push(lvState(lv));
  return pts;
}
