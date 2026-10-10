/* ============================================================
   Fluid Sim - the solver (no DOM, unit tested)

   "Stable fluids" (Jos Stam, 1999) on a staggered grid:

     cell (i, j)      dye (r, g, b), pressure, wall flag
     u face (i, j)    sideways speed on the LEFT edge of cell i
     v face (i, j)    up/down speed on the TOP edge of cell j

   One step:
     1. sources      jets push fluid and pour in dye
     2. forces       swirl (vorticity confinement) + buoyancy
     3. diffusion    viscosity: speeds blur into their neighbours
     4. projection   remove any squeeze or stretch (divergence)
     5. advection    carry the dye along the clean flow; fade it
     6. advection    carry the speeds along with themselves
   (Step 6 leaves a little squeeze behind; the next step's
   projection takes it out before anything uses it.)

   Units: positions in cells, speeds in cells per second,
   time in seconds. y points down (like the screen).

   Cell kinds:
     FLUID  normal water
     SOLID  a wall: nothing flows through it
     OPEN   an exit: fluid can leave (pressure held at 0)
   The outer ring of cells is always SOLID or OPEN.
   ============================================================ */

export const FLUID = 0;
export const SOLID = 1;
export const OPEN = 2;

export const STEP = 1 / 60;          // one solver step, in seconds
export const MAX_DYE = 4;            // per colour channel, per cell
export const PRESETS = ["jets", "smoke", "wind"];
export const PRESET_NAMES = { jets: "Two jets", smoke: "Rising smoke", wind: "Wind past a ball", none: "Your tank" };

/* ============================================================
   MAKING A TANK
   ============================================================ */
export function createFluid(cols, rows, params = {}) {
  cols = Math.max(4, Math.round(cols));
  rows = Math.max(4, Math.round(rows));
  const n = cols * rows;
  const nu = (cols + 1) * rows;
  const nv = cols * (rows + 1);
  const sim = {
    cols, rows,
    u: new Float32Array(nu), v: new Float32Array(nv),
    u0: new Float32Array(nu), v0: new Float32Array(nv),
    uMask: new Uint8Array(nu), vMask: new Uint8Array(nv),
    r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
    r0: new Float32Array(n), g0: new Float32Array(n), b0: new Float32Array(n),
    p: new Float32Array(n), div: new Float32Array(n),
    /* Per cell, for the pressure solver: which neighbours are not
       walls (1 or 0), and 1 / how many (0 = not a fluid cell). */
    wl: new Float32Array(n), wr: new Float32Array(n), wu: new Float32Array(n), wd: new Float32Array(n),
    invK: new Float32Array(n),
    curl: new Float32Array(n), fx: new Float32Array(n), fy: new Float32Array(n),
    cell: new Uint8Array(n),
    params: {
      viscosity: 0,      // cells² per second
      fade: 0,           // fraction of dye lost per second
      swirl: 0,          // vorticity confinement strength
      buoyancy: 0,       // how hard dye floats up, cells/s² per unit of dye
      iterations: 24,    // pressure solver sweeps per projection
      ...params
    },
    inflow: 0,           // wind from the left edge, cells/s (0 = none)
    open: false,         // right edge is an exit
    sources: [],         // jets: { x, y, dx, dy, speed, radius, color, dye } (x, y as 0..1 of the tank)
    t: 0,
    dirty: true
  };
  setEdges(sim);
  return sim;
}

/* The outer ring: walls, or an exit on the right for the wind. */
export function setEdges(sim) {
  const { cols, rows, cell } = sim;
  for (let i = 0; i < cols; i++) { cell[i] = SOLID; cell[(rows - 1) * cols + i] = SOLID; }
  for (let j = 0; j < rows; j++) {
    cell[j * cols] = SOLID;
    cell[j * cols + cols - 1] = sim.open && j > 0 && j < rows - 1 ? OPEN : SOLID;
  }
  sim.dirty = true;
}

/* A grid that fills a w x h box with about `budget` cells
   (plus the outer ring). */
export function gridSize(w, h, budget) {
  const s = Math.sqrt(Math.max(1, w * h) / Math.max(64, budget));
  return {
    cols: Math.max(16, Math.round(w / s)) + 2,
    rows: Math.max(16, Math.round(h / s)) + 2
  };
}

/* Which faces can carry flow? A face between two non-wall cells,
   at least one of them real fluid. Rebuilt after walls change. */
function rebuildMasks(sim) {
  const { cols, rows, cell, uMask, vMask } = sim;
  const W = cols + 1;
  uMask.fill(0);
  vMask.fill(0);
  for (let j = 0; j < rows; j++) {
    for (let i = 1; i < cols; i++) {
      const a = cell[j * cols + i - 1], b = cell[j * cols + i];
      uMask[j * W + i] = a !== SOLID && b !== SOLID && (a === FLUID || b === FLUID) ? 1 : 0;
    }
  }
  for (let j = 1; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = cell[(j - 1) * cols + i], b = cell[j * cols + i];
      vMask[j * cols + i] = a !== SOLID && b !== SOLID && (a === FLUID || b === FLUID) ? 1 : 0;
    }
  }
  const { wl, wr, wu, wd, invK } = sim;
  wl.fill(0); wr.fill(0); wu.fill(0); wd.fill(0); invK.fill(0);
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const c = j * cols + i;
      if (cell[c] !== FLUID) { continue; }
      wl[c] = cell[c - 1] !== SOLID ? 1 : 0;
      wr[c] = cell[c + 1] !== SOLID ? 1 : 0;
      wu[c] = cell[c - cols] !== SOLID ? 1 : 0;
      wd[c] = cell[c + cols] !== SOLID ? 1 : 0;
      const k = wl[c] + wr[c] + wu[c] + wd[c];
      invK[c] = k ? 1 / k : 0;
    }
  }
  sim.dirty = false;
}

/* Walls hold still; the wind blows in on the left. */
export function enforceBoundaries(sim) {
  if (sim.dirty) { rebuildMasks(sim); }
  const { u, v, uMask, vMask, cols, rows, cell } = sim;
  for (let k = 0; k < u.length; k++) { if (!uMask[k]) { u[k] = 0; } }
  for (let k = 0; k < v.length; k++) { if (!vMask[k]) { v[k] = 0; } }
  if (sim.inflow) {
    for (let j = 1; j < rows - 1; j++) {
      if (cell[j * cols + 1] === FLUID) { u[j * (cols + 1) + 1] = sim.inflow; }
    }
  }
}

/* ============================================================
   SAMPLING (bilinear, clamped to the tank)
   ============================================================ */
function bilerp(q, stride, maxI, maxJ, gx, gy) {
  if (gx < 0) { gx = 0; } else if (gx > maxI) { gx = maxI; }
  if (gy < 0) { gy = 0; } else if (gy > maxJ) { gy = maxJ; }
  let i = gx | 0, j = gy | 0;
  if (i >= maxI) { i = maxI - 1; }
  if (j >= maxJ) { j = maxJ - 1; }
  const fx = gx - i, fy = gy - j;
  const k = j * stride + i;
  const a = q[k] + (q[k + 1] - q[k]) * fx;
  const b = q[k + stride] + (q[k + stride + 1] - q[k + stride]) * fx;
  return a + (b - a) * fy;
}

/* Sideways speed at a point (u faces sit at (i, j + 0.5)). */
const su = (u, cols, rows, x, y) => bilerp(u, cols + 1, cols, rows - 1, x, y - 0.5);
const sv = (v, cols, rows, x, y) => bilerp(v, cols, cols - 1, rows, x - 0.5, y);
export function sampleU(sim, x, y) { return su(sim.u, sim.cols, sim.rows, x, y); }
/* Up/down speed at a point (v faces sit at (i + 0.5, j)). */
export function sampleV(sim, x, y) { return sv(sim.v, sim.cols, sim.rows, x, y); }
/* A cell value at a point (cell centres sit at (i + 0.5, j + 0.5)). */
export function sampleCell(sim, q, x, y) { return bilerp(q, sim.cols, sim.cols - 1, sim.rows - 1, x - 0.5, y - 0.5); }

/* Where did the fluid now at (x, y) come from, dt ago? (RK2) */
function backtrace(u, v, cols, rows, x, y, ux, vy, dt, out) {
  const mx = x - 0.5 * dt * ux, my = y - 0.5 * dt * vy;
  out[0] = x - dt * su(u, cols, rows, mx, my);
  out[1] = y - dt * sv(v, cols, rows, mx, my);
}

/* ============================================================
   1-2. SOURCES AND FORCES
   ============================================================ */

/* Push fluid towards (vx, vy) and add dye, in a soft round blob.
   blend 0..1: how much of the old speed is replaced at the centre. */
export function splat(sim, cx, cy, { vx = 0, vy = 0, radius = 3, color = null, dye = 0.5, blend = 0.8 } = {}) {
  const { cols, rows, cell, u, v, r, g, b } = sim;
  const W = cols + 1;
  const r2 = radius * radius;
  const reach = Math.ceil(radius * 2.2);
  const i0 = Math.max(0, Math.floor(cx) - reach), i1 = Math.min(cols, Math.ceil(cx) + reach);
  const j0 = Math.max(0, Math.floor(cy) - reach), j1 = Math.min(rows - 1, Math.ceil(cy) + reach);
  const push = blend > 0 && (vx || vy || blend >= 1);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (push) {
        const du = i - cx, dvy = j + 0.5 - cy;
        const wu = Math.exp(-(du * du + dvy * dvy) / r2) * blend;
        if (wu > 0.01) { const k = j * W + i; u[k] += (vx - u[k]) * wu; }
        if (i < cols) {
          const dx = i + 0.5 - cx, dy = j - cy;
          const wv = Math.exp(-(dx * dx + dy * dy) / r2) * blend;
          if (wv > 0.01) { const k = j * cols + i; v[k] += (vy - v[k]) * wv; }
        }
      }
      if (color && dye > 0 && i < cols) {
        const c = j * cols + i;
        if (cell[c] !== FLUID) { continue; }
        const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
        const w = Math.exp(-(dx * dx + dy * dy) / r2) * dye;
        if (w < 0.004) { continue; }
        r[c] = Math.min(MAX_DYE, r[c] + color[0] * w);
        g[c] = Math.min(MAX_DYE, g[c] + color[1] * w);
        b[c] = Math.min(MAX_DYE, b[c] + color[2] * w);
      }
    }
  }
}

/* Jets: every step, each one pushes and pours. */
function applySources(sim, dt) {
  const s = Math.min(sim.cols, sim.rows) / 100;           // jets scale with the tank
  for (const j of sim.sources) {
    const x = j.x * sim.cols, y = j.y * sim.rows;
    /* Speed scales with the tank's length in the jet's direction. */
    const sp = ((j.speed || 0) * (Math.abs(j.dx) * sim.cols + Math.abs(j.dy) * sim.rows)) / 100;
    if (j.wobble) {
      /* A slow wobble keeps a jet from looking frozen. */
      const a = Math.sin(sim.t * j.wobble[0] + j.wobble[1]) * j.wobble[2];
      const c = Math.cos(a), sn = Math.sin(a);
      splat(sim, x, y, { vx: (j.dx * c - j.dy * sn) * sp, vy: (j.dx * sn + j.dy * c) * sp, radius: j.radius * s, color: j.color, dye: j.dye * dt * 60, blend: sp ? 1 : 0 });
    } else {
      splat(sim, x, y, { vx: j.dx * sp, vy: j.dy * sp, radius: j.radius * s, color: j.color, dye: j.dye * dt * 60, blend: sp ? 1 : 0 });
    }
  }
}

/* Vorticity confinement: find where the fluid spins and spin
   it a bit harder, so small swirls don't blur away. */
export function addSwirl(sim, dt) {
  const eps = sim.params.swirl;
  if (!eps) { return; }
  const { cols, rows, u, v, cell, curl, fx, fy } = sim;
  const W = cols + 1;
  curl.fill(0);
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const c = j * cols + i;
      if (cell[c] !== FLUID) { continue; }
      /* Centre speeds of the four neighbours, from the faces. */
      const vr = 0.5 * (v[c + 1] + v[c + 1 + cols]);
      const vl = 0.5 * (v[c - 1] + v[c - 1 + cols]);
      const ud = 0.5 * (u[(j + 1) * W + i] + u[(j + 1) * W + i + 1]);
      const uu = 0.5 * (u[(j - 1) * W + i] + u[(j - 1) * W + i + 1]);
      curl[c] = 0.5 * ((vr - vl) - (ud - uu));
    }
  }
  fx.fill(0);
  fy.fill(0);
  for (let j = 2; j < rows - 2; j++) {
    for (let i = 2; i < cols - 2; i++) {
      const c = j * cols + i;
      if (cell[c] !== FLUID) { continue; }
      const nx = 0.5 * (Math.abs(curl[c + 1]) - Math.abs(curl[c - 1]));
      const ny = 0.5 * (Math.abs(curl[c + cols]) - Math.abs(curl[c - cols]));
      const len = Math.hypot(nx, ny) + 1e-5;
      fx[c] = eps * (ny / len) * curl[c];
      fy[c] = -eps * (nx / len) * curl[c];
    }
  }
  const { uMask, vMask } = sim;
  for (let j = 0; j < rows; j++) {
    for (let i = 1; i < cols; i++) {
      const k = j * W + i;
      if (uMask[k]) { u[k] += dt * 0.5 * (fx[j * cols + i - 1] + fx[j * cols + i]); }
    }
  }
  for (let j = 1; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (vMask[k]) { v[k] += dt * 0.5 * (fy[k - cols] + fy[k]); }
    }
  }
}

/* Dye is warm: it floats up (smoke). */
function addBuoyancy(sim, dt) {
  const k = sim.params.buoyancy;
  if (!k) { return; }
  const { cols, rows, v, vMask, r, g, b } = sim;
  const s = k * dt / 3;
  for (let j = 1; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const f = j * cols + i;
      if (!vMask[f]) { continue; }
      const up = r[f] + g[f] + b[f] + r[f - cols] + g[f - cols] + b[f - cols];
      v[f] -= s * 0.5 * up;
    }
  }
}

/* ============================================================
   3. DIFFUSION (viscosity), implicit so it never blows up
   ============================================================ */
export function diffuse(sim, dt, sweeps = 6) {
  const a = sim.params.viscosity * dt;
  if (a <= 0) { return; }
  const { cols, rows, u, v, u0, v0, uMask, vMask } = sim;
  const W = cols + 1;
  u0.set(u);
  v0.set(v);
  const d = 1 / (1 + 4 * a);
  for (let s = 0; s < sweeps; s++) {
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols; i++) {
        const k = j * W + i;
        if (uMask[k]) { u[k] = (u0[k] + a * (u[k - 1] + u[k + 1] + u[k - W] + u[k + W])) * d; }
      }
    }
    for (let j = 1; j < rows; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i;
        if (vMask[k]) { v[k] = (v0[k] + a * (v[k - 1] + v[k + 1] + v[k - cols] + v[k + cols])) * d; }
      }
    }
  }
}

/* ============================================================
   4. PROJECTION
   Find a pressure p so that pushing the fluid down its slope
   leaves every cell with exactly as much flowing in as out.
   Gauss-Seidel with over-relaxation, warm-started from the
   last step's pressure.
   ============================================================ */
export function divergence(sim, c) {
  const { cols, u, v } = sim;
  const i = c % cols, j = (c - i) / cols;
  return u[j * (cols + 1) + i + 1] - u[j * (cols + 1) + i] + v[c + cols] - v[c];
}

export function project(sim, iterations = sim.params.iterations, omega = 1.8) {
  enforceBoundaries(sim);
  const { cols, rows, u, v, p, div, cell, uMask, vMask, wl, wr, wu, wd, invK } = sim;
  const W = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = j * cols + i;
      div[c] = cell[c] === FLUID ? u[j * W + i + 1] - u[j * W + i] + v[c + cols] - v[c] : 0;
      if (cell[c] !== FLUID) { p[c] = 0; }
    }
  }

  /* Branch-free sweep: walls have weight 0, and non-fluid cells
     (invK = 0) are pulled to pressure 0. */
  const end = (rows - 1) * cols - 1;
  /* Red-black order: first every "red" cell of a chessboard, then
     every "black" one. Each half only reads the other half, so
     the sweep doesn't wait on the cell it just wrote (faster). */
  for (let it = 0; it < iterations; it++) {
    for (let colour = 0; colour < 2; colour++) {
      for (let j = 1; j < rows - 1; j++) {
        const row = j * cols;
        for (let c = row + 1 + ((j + colour) & 1), e = row + cols - 1; c < e; c += 2) {
          const s = p[c - 1] * wl[c] + p[c + 1] * wr[c] + p[c - cols] * wu[c] + p[c + cols] * wd[c];
          p[c] += omega * ((s - div[c]) * invK[c] - p[c]);
        }
      }
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 1; i < cols; i++) {
      const k = j * W + i;
      if (uMask[k]) { u[k] -= p[j * cols + i] - p[j * cols + i - 1]; }
    }
  }
  for (let j = 1; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (vMask[k]) { v[k] -= p[k] - p[k - cols]; }
    }
  }
  enforceBoundaries(sim);
}

/* ============================================================
   5. ADVECTION (semi-Lagrangian: look back along the flow)
   ============================================================ */
const tmp = [0, 0];

export function advectVelocity(sim, dt) {
  /* Swap, then read the OLD field (u0, v0) while writing the new one. */
  [sim.u, sim.u0] = [sim.u0, sim.u];
  [sim.v, sim.v0] = [sim.v0, sim.v];
  const { cols, rows, u, v, u0, v0, uMask, vMask } = sim;
  const W = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 1; i < cols; i++) {
      const k = j * W + i;
      if (!uMask[k]) { continue; }
      const x = i, y = j + 0.5;
      backtrace(u0, v0, cols, rows, x, y, u0[k], sv(v0, cols, rows, x, y), dt, tmp);
      u[k] = su(u0, cols, rows, tmp[0], tmp[1]);
    }
  }
  for (let j = 1; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (!vMask[k]) { continue; }
      const x = i + 0.5, y = j;
      backtrace(u0, v0, cols, rows, x, y, su(u0, cols, rows, x, y), v0[k], dt, tmp);
      v[k] = sv(v0, cols, rows, tmp[0], tmp[1]);
    }
  }
  enforceBoundaries(sim);
}

export function advectDye(sim, dt) {
  const { cols, rows, cell } = sim;
  /* Swap: read from the *0 arrays, write into the live ones. */
  [sim.r, sim.r0] = [sim.r0, sim.r];
  [sim.g, sim.g0] = [sim.g0, sim.g];
  [sim.b, sim.b0] = [sim.b0, sim.b];
  const { r, g, b, r0, g0, b0, u, v } = sim;
  const keep = sim.params.fade > 0 ? Math.exp(-sim.params.fade * dt) : 1;
  const maxI = cols - 1, maxJ = rows - 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = j * cols + i;
      if (cell[c] !== FLUID) { r[c] = 0; g[c] = 0; b[c] = 0; continue; }
      const x = i + 0.5, y = j + 0.5;
      backtrace(u, v, cols, rows, x, y, su(u, cols, rows, x, y), sv(v, cols, rows, x, y), dt, tmp);
      /* Inline bilinear, shared by all three colours. */
      let gx = tmp[0] - 0.5, gy = tmp[1] - 0.5;
      if (gx < 0) { gx = 0; } else if (gx > maxI) { gx = maxI; }
      if (gy < 0) { gy = 0; } else if (gy > maxJ) { gy = maxJ; }
      let ii = gx | 0, jj = gy | 0;
      if (ii >= maxI) { ii = maxI - 1; }
      if (jj >= maxJ) { jj = maxJ - 1; }
      const fx = gx - ii, fy = gy - jj;
      const k = jj * cols + ii;
      /* Corners inside a wall don't count (walls hold no dye),
         so dye isn't lost just by flowing past one. */
      let w00 = cell[k] === FLUID ? (1 - fx) * (1 - fy) : 0;
      let w10 = cell[k + 1] === FLUID ? fx * (1 - fy) : 0;
      let w01 = cell[k + cols] === FLUID ? (1 - fx) * fy : 0;
      let w11 = cell[k + cols + 1] === FLUID ? fx * fy : 0;
      const sum = w00 + w10 + w01 + w11;
      if (sum < 1e-6) { r[c] = 0; g[c] = 0; b[c] = 0; continue; }
      const nrm = keep / sum;
      w00 *= nrm; w10 *= nrm; w01 *= nrm; w11 *= nrm;
      r[c] = r0[k] * w00 + r0[k + 1] * w10 + r0[k + cols] * w01 + r0[k + cols + 1] * w11;
      g[c] = g0[k] * w00 + g0[k + 1] * w10 + g0[k + cols] * w01 + g0[k + cols + 1] * w11;
      b[c] = b0[k] * w00 + b0[k + 1] * w10 + b0[k + cols] * w01 + b0[k + cols + 1] * w11;
    }
  }
  /* Looking back and blending isn't perfectly fair: in a swirl it
     leaks a tiny bit of dye (about 1% a second). Put exactly that
     back, spread in proportion to the dye already there, so only
     the fade (and an exit) can take dye away. */
  if (!sim.open) {
    conserve(r0, r, keep, cell);
    conserve(g0, g, keep, cell);
    conserve(b0, b, keep, cell);
  }
}

function conserve(before, after, keep, cell) {
  let want = 0, got = 0;
  for (let c = 0; c < cell.length; c++) {
    if (cell[c] === FLUID) { want += before[c]; got += after[c]; }
  }
  want *= keep;
  if (got <= 1e-9 || want <= 1e-9) { return; }
  const k = want / got;
  if (Math.abs(k - 1) < 1e-7 || k > 1.05 || k < 0.95) { return; }
  for (let c = 0; c < after.length; c++) { after[c] *= k; }
}

/* ============================================================
   ONE WHOLE STEP
   ============================================================ */
export function step(sim, dt = STEP) {
  enforceBoundaries(sim);
  applySources(sim, dt);
  addSwirl(sim, dt);
  addBuoyancy(sim, dt);
  diffuse(sim, dt);
  project(sim);
  advectDye(sim, dt);
  advectVelocity(sim, dt);
  sim.t += dt;
}

/* ============================================================
   WALLS
   ============================================================ */

/* Paint (solid = true) or rub out walls in a round brush along
   a line. The outer ring is never changed. Returns cells changed. */
export function paintWalls(sim, x0, y0, x1, y1, radius, solid) {
  const { cols, rows, cell } = sim;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / Math.max(0.5, radius * 0.5)));
  let changed = 0;
  const want = solid ? SOLID : FLUID;
  for (let s = 0; s <= n; s++) {
    const cx = x0 + ((x1 - x0) * s) / n, cy = y0 + ((y1 - y0) * s) / n;
    const reach = Math.ceil(radius);
    for (let j = Math.max(1, Math.floor(cy) - reach); j <= Math.min(rows - 2, Math.floor(cy) + reach); j++) {
      for (let i = Math.max(1, Math.floor(cx) - reach); i <= Math.min(cols - 2, Math.floor(cx) + reach); i++) {
        const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
        if (dx * dx + dy * dy > radius * radius) { continue; }
        const c = j * cols + i;
        if (cell[c] === want) { continue; }
        cell[c] = want;
        sim.r[c] = 0; sim.g[c] = 0; sim.b[c] = 0; sim.p[c] = 0;
        changed++;
      }
    }
  }
  if (changed) { sim.dirty = true; enforceBoundaries(sim); }
  return changed;
}

/* A round wall (the "ball"), centre and radius in cells. */
export function addBall(sim, cx, cy, radius) {
  return paintWalls(sim, cx, cy, cx, cy, radius, true);
}

/* Inner wall cells (the outer ring doesn't count). */
export function wallCount(sim) {
  const { cols, rows, cell } = sim;
  let n = 0;
  for (let j = 1; j < rows - 1; j++) { for (let i = 1; i < cols - 1; i++) { if (cell[j * cols + i] === SOLID) { n++; } } }
  return n;
}

/* ============================================================
   CLEARING, PRESETS, RESIZING
   ============================================================ */

/* Still water, no dye. Walls, jets and wind stay. */
export function clearInk(sim) {
  for (const a of [sim.u, sim.v, sim.r, sim.g, sim.b, sim.p, sim.r0, sim.g0, sim.b0]) { a.fill(0); }
}

/* Everything gone: an empty tank with walls round the edge. */
export function clearAll(sim) {
  clearInk(sim);
  sim.cell.fill(FLUID);
  sim.sources = [];
  sim.inflow = 0;
  sim.open = false;
  sim.params.buoyancy = 0;
  setEdges(sim);
  enforceBoundaries(sim);
}

export const COLORS = {
  pink: [1, 0.18, 0.47],
  cyan: [0.21, 0.84, 0.96],
  amber: [1, 0.79, 0.24],
  green: [0.24, 0.96, 0.63],
  violet: [0.61, 0.42, 1],
  white: [0.93, 0.93, 0.96]
};

/* Speeds in the presets are "cells per second on a 100-cell tank"
   and grow with the tank, so phones and desktops look alike. */
export function applyPreset(sim, name) {
  clearAll(sim);
  const { cols, rows } = sim;
  const s = Math.min(cols, rows) / 100;
  if (name === "jets") {
    sim.sources = [
      { x: 0.1, y: 0.5, dx: 1, dy: 0, speed: 50, radius: 2.6, color: COLORS.pink, dye: 0.35, wobble: [1.3, 0, 0.18] },
      { x: 0.9, y: 0.5, dx: -1, dy: 0, speed: 50, radius: 2.6, color: COLORS.cyan, dye: 0.35, wobble: [1.1, 2, 0.18] }
    ];
  } else if (name === "smoke") {
    sim.params.buoyancy = 18 / s;
    sim.sources = [
      { x: 0.5, y: 0.9, dx: 0, dy: -1, speed: 16, radius: 3, color: COLORS.amber, dye: 0.1, wobble: [0.9, 0, 0.35] }
    ];
  } else if (name === "wind") {
    sim.open = true;
    setEdges(sim);
    sim.inflow = 26 * s;
    addBall(sim, cols * 0.24, rows * 0.5 + 0.3, Math.max(3, Math.min(cols, rows) * 0.09));
    /* Dye streaks pouring in from the left. */
    const palette = [COLORS.pink, COLORS.cyan, COLORS.amber];
    const lanes = 7;
    for (let k = 0; k < lanes; k++) {
      sim.sources.push({ x: 2.5 / cols, y: (k + 0.5) / lanes, dx: 1, dy: 0, speed: 0, radius: 1.3, color: palette[k % 3], dye: 0.14 });
    }
  }
  enforceBoundaries(sim);
  return sim;
}

/* A new tank of a different size with the same walls, dye and
   settings (nearest cell), and still water. */
export function resample(from, cols, rows) {
  const to = createFluid(cols, rows, { ...from.params });
  to.sources = from.sources;
  to.open = from.open;
  to.inflow = from.inflow * (Math.min(cols, rows) / Math.min(from.cols, from.rows));
  to.t = from.t;
  if (from.params.buoyancy) { to.params.buoyancy = from.params.buoyancy * (Math.min(from.cols, from.rows) / Math.min(cols, rows)); }
  setEdges(to);
  for (let j = 1; j < rows - 1; j++) {
    const fj = Math.min(from.rows - 2, Math.max(1, Math.floor(((j - 1 + 0.5) / (rows - 2)) * (from.rows - 2)) + 1));
    for (let i = 1; i < cols - 1; i++) {
      const fi = Math.min(from.cols - 2, Math.max(1, Math.floor(((i - 1 + 0.5) / (cols - 2)) * (from.cols - 2)) + 1));
      const a = fj * from.cols + fi, c = j * cols + i;
      to.cell[c] = from.cell[a] === SOLID ? SOLID : FLUID;
      to.r[c] = from.r[a]; to.g[c] = from.g[a]; to.b[c] = from.b[a];
    }
  }
  to.dirty = true;
  enforceBoundaries(to);
  return to;
}

/* ============================================================
   MEASURES (for the HUD and the tests)
   ============================================================ */
export function totalDye(sim) {
  let s = 0;
  const { r, g, b } = sim;
  for (let c = 0; c < r.length; c++) { s += r[c] + g[c] + b[c]; }
  return s;
}

/* Biggest squeeze/stretch left in any fluid cell. */
export function maxDivergence(sim) {
  let m = 0;
  for (let c = 0; c < sim.cell.length; c++) {
    if (sim.cell[c] !== FLUID) { continue; }
    const d = Math.abs(divergence(sim, c));
    if (d > m) { m = d; }
  }
  return m;
}

/* Average speed of the fluid, cells per second. */
export function meanSpeed(sim) {
  const { cols, rows, cell } = sim;
  let s = 0, n = 0;
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      if (cell[j * cols + i] !== FLUID) { continue; }
      const x = i + 0.5, y = j + 0.5;
      s += Math.hypot(sampleU(sim, x, y), sampleV(sim, x, y));
      n++;
    }
  }
  return n ? s / n : 0;
}

/* Hue (0..1) to an RGB dye colour, for rainbow mode. */
export function hueColor(h) {
  h = ((h % 1) + 1) % 1;
  const k = (n) => (n + h * 6) % 6;
  const f = (n) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
}
