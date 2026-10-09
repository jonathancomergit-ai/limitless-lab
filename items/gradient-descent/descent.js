/* ============================================================
   Gradient Descent Hill - the maths, unit tested (no DOM)

   1. HILLS       four landscapes: height f(x, y) and its exact
                  slope (gradient), worked out by hand
   2. OPTIMISERS  plain gradient descent, momentum and Adam:
                  the same three you'd find in PyTorch
   3. CONTOURS    marching squares, for the height lines

   Coordinates are maths-style: y points UP. main.js flips it.
   ============================================================ */

/* ============================================================
   1. HILLS
   box = [xmin, xmax, ymin, ymax] (always square)
   start = where the first ball drops; lrExp = log10 of a
   learning rate that works well for all three racers there.
   ============================================================ */
export const HILLS = {
  /* A stretched bowl: 4x steeper across (y) than along (x). */
  bowl: {
    name: "Bowl",
    f: (x, y) => 0.5 * x * x + 2 * y * y,
    grad: (x, y) => [x, 4 * y],
    box: [-3, 3, -3, 3],
    start: [-2.6, 2.1],
    lrExp: -1,
    min: [0, 0]
  },

  /* Rosenbrock's banana valley, (a - x)^2 + b (y - x^2)^2 with
     a = 1, b = 10. Easy to find the valley, slow to walk along it.
     (The textbook b = 100 needs a learning rate 10x smaller.) */
  valley: {
    name: "Long valley",
    f: (x, y) => (1 - x) ** 2 + 10 * (y - x * x) ** 2,
    grad: (x, y) => [-2 * (1 - x) - 40 * x * (y - x * x), 20 * (y - x * x)],
    box: [-2, 2, -1, 3],
    start: [-1.7, 2.6],
    lrExp: -2.3,
    min: [1, 1]
  },

  /* A gentle bowl with ripples on top: lots of little dips to get
     stuck in. The real bottom is at the centre. */
  bumpy: {
    name: "Bumpy",
    f: (x, y) => 0.12 * (x * x + y * y) - Math.cos(2 * x) * Math.cos(2 * y) + 1,
    grad: (x, y) => [
      0.24 * x + 2 * Math.sin(2 * x) * Math.cos(2 * y),
      0.24 * y + 2 * Math.cos(2 * x) * Math.sin(2 * y)
    ],
    box: [-4, 4, -4, 4],
    start: [-3.5, 3.2],
    lrExp: -1.3,
    min: [0, 0]
  },

  /* A saddle (horse saddle / mountain pass) at the centre: downhill
     along y, uphill along x. Two real bottoms at y = +-sqrt(5). */
  saddle: {
    name: "Saddle",
    f: (x, y) => 0.5 * x * x - 0.5 * y * y + 0.05 * y ** 4 + 1.25,
    grad: (x, y) => [x, -y + 0.2 * y ** 3],
    box: [-3, 3, -3, 3],
    start: [-2.7, 0.001],
    lrExp: -1,
    min: [0, Math.sqrt(5)],
    alsoMin: [[0, -Math.sqrt(5)]]
  }
};

export const HILL_IDS = Object.keys(HILLS);

/* ============================================================
   2. OPTIMISERS
   Every racer is a ball with a position and a little memory.
   step() moves it once, using only the slope where it stands.
   ============================================================ */
export const OPTIMISERS = [
  { id: "gd", name: "Plain GD" },
  { id: "momentum", name: "Momentum" },
  { id: "adam", name: "Adam" }
];

export const MOMENTUM = 0.9;                       // how much speed it keeps
export const ADAM = { b1: 0.9, b2: 0.999, eps: 1e-8 };

export function createBall(kind, x, y) {
  return {
    kind,
    x, y,
    vx: 0, vy: 0,          // momentum: velocity
    mx: 0, my: 0,          // Adam: running average of the slope
    sx: 0, sy: 0,          // Adam: running average of slope squared
    t: 0,                  // steps taken
    status: "rolling"      // "rolling" | "settled" | "blew up"
  };
}

/* How far from the box counts as "flew off to infinity". */
function blownUp(b, hill) {
  const [x0, x1, y0, y1] = hill.box;
  const span = Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return !Number.isFinite(b.x) || !Number.isFinite(b.y) ||
    Math.abs(b.x - cx) > 40 * span || Math.abs(b.y - cy) > 40 * span;
}

/* One step. Returns the same ball, moved. */
export function step(b, hill, lr) {
  if (b.status !== "rolling") { return b; }
  const [gx, gy] = hill.grad(b.x, b.y);
  let dx, dy;

  if (b.kind === "gd") {
    /* x <- x - lr * slope */
    dx = -lr * gx;
    dy = -lr * gy;
  } else if (b.kind === "momentum") {
    /* v <- 0.9 v + slope;  x <- x - lr * v  (a heavy ball) */
    b.vx = MOMENTUM * b.vx + gx;
    b.vy = MOMENTUM * b.vy + gy;
    dx = -lr * b.vx;
    dy = -lr * b.vy;
  } else {
    /* Adam: average slope / sqrt(average slope^2), with the
       start-up bias taken out. Each step is about lr long. */
    const { b1, b2, eps } = ADAM;
    const t = b.t + 1;
    b.mx = b1 * b.mx + (1 - b1) * gx;
    b.my = b1 * b.my + (1 - b1) * gy;
    b.sx = b2 * b.sx + (1 - b2) * gx * gx;
    b.sy = b2 * b.sy + (1 - b2) * gy * gy;
    const c1 = 1 - b1 ** t, c2 = 1 - b2 ** t;
    dx = (-lr * (b.mx / c1)) / (Math.sqrt(b.sx / c2) + eps);
    dy = (-lr * (b.my / c1)) / (Math.sqrt(b.sy / c2) + eps);
  }

  b.x += dx;
  b.y += dy;
  b.t += 1;

  if (blownUp(b, hill)) {
    b.status = "blew up";
  } else if (Math.hypot(gx, gy) < 1e-4 && Math.hypot(dx, dy) < 1e-6) {
    b.status = "settled";
  }
  return b;
}

/* Run a ball for n steps (handy for tests). */
export function run(b, hill, lr, n) {
  for (let i = 0; i < n && b.status === "rolling"; i++) { step(b, hill, lr); }
  return b;
}

/* Learning rate from the slider's log10 value. */
export const lrFromExp = (e) => 10 ** e;

/* Slope check by finite differences (used by the tests). */
export function numericGrad(f, x, y, h = 1e-5) {
  return [
    (f(x + h, y) - f(x - h, y)) / (2 * h),
    (f(x, y + h) - f(x, y - h)) / (2 * h)
  ];
}

/* ============================================================
   3. CONTOURS: marching squares
   values: a (nx+1) x (ny+1) grid, row by row (index j*(nx+1)+i).
   Returns line segments [x1, y1, x2, y2, ...] in grid units,
   where (0, 0) is the first value and (nx, ny) the last.
   ============================================================ */
export function contourSegments(values, nx, ny, level) {
  const out = [];
  const w = nx + 1;
  /* Where along an edge from a to b the level is crossed (0..1). */
  const cut = (a, b) => (a === b ? 0.5 : (level - a) / (b - a));

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = values[j * w + i];             // (i,   j)
      const b = values[j * w + i + 1];         // (i+1, j)
      const c = values[(j + 1) * w + i + 1];   // (i+1, j+1)
      const d = values[(j + 1) * w + i];       // (i,   j+1)
      const code = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (code === 0 || code === 15) { continue; }

      /* The crossing point on each of the four edges. */
      const B = () => [i + cut(a, b), j];           // bottom: a-b
      const R = () => [i + 1, j + cut(b, c)];       // right:  b-c
      const T = () => [i + cut(d, c), j + 1];       // top:    d-c
      const L = () => [i, j + cut(a, d)];           // left:   a-d
      const seg = (p, q) => out.push(p[0], p[1], q[0], q[1]);

      switch (code) {
        case 1: case 14: seg(L(), B()); break;
        case 2: case 13: seg(B(), R()); break;
        case 3: case 12: seg(L(), R()); break;
        case 4: case 11: seg(R(), T()); break;
        case 6: case 9:  seg(B(), T()); break;
        case 7: case 8:  seg(L(), T()); break;
        case 5: {   // a and c high: decide by the middle
          const mid = (a + b + c + d) / 4;
          if (mid > level) { seg(L(), T()); seg(B(), R()); } else { seg(L(), B()); seg(R(), T()); }
          break;
        }
        case 10: {  // b and d high
          const mid = (a + b + c + d) / 4;
          if (mid > level) { seg(L(), B()); seg(R(), T()); } else { seg(L(), T()); seg(B(), R()); }
          break;
        }
      }
    }
  }
  return out;
}
