/* ============================================================
   Fractal Zoom - the maths, unit tested. No DOM.

   Mandelbrot set: start at z = 0 and repeat  z -> z² + c.
   If z stays small forever, c is IN the set (drawn dark).
   If |z| runs away, c is outside, and HOW FAST it runs away
   picks the colour.

   Julia set for a fixed c: same rule, but start z at the
   pixel instead of at 0.

   Smooth colouring: the escape count n jumps in whole steps,
   which draws ugly bands. The "smooth escape value"

     nu = n + 1 - log2( ln |z_n| )

   fills in the fraction between steps, so colours flow. It
   needs a big escape radius (we use 256) to be accurate.
   ============================================================ */

export const ESCAPE_RADIUS = 256;
const R2 = ESCAPE_RADIUS * ESCAPE_RADIUS;
export const INSIDE = -1;

/* Past this zoom, neighbouring pixels are closer together than
   64-bit numbers can tell apart (about 16 significant digits),
   so the picture turns blocky. */
export const PRECISION_LIMIT = 1e13;
export const MAX_ZOOM = 2e14;

/* The first view: the whole set, about 3.4 units wide. */
export const HOME = Object.freeze({ cx: -0.6, cy: 0, width: 3.4, height: 2.6 });
export const JULIA_HOME = Object.freeze({ cx: 0, cy: 0, width: 3.6, height: 2.6 });

/* The start view for a canvas of this shape: wide enough for the
   whole set AND tall enough, whichever needs more room. Zoom ×1. */
export function fitHome(home, w, h) {
  return { cx: home.cx, cy: home.cy, width: Math.max(home.width, (home.height * w) / Math.max(1, h)) };
}

/* Smooth escape value for the point c (Mandelbrot), or INSIDE. */
export function mandel(cx, cy, maxIter) {
  /* Skip the two biggest blobs (main cardioid, period-2 bulb):
     they're inside, and are the slowest points to iterate. */
  const xq = cx - 0.25, q = xq * xq + cy * cy;
  if (q * (q + xq) <= 0.25 * cy * cy) { return INSIDE; }
  if ((cx + 1) * (cx + 1) + cy * cy <= 0.0625) { return INSIDE; }
  return orbit(0, 0, cx, cy, maxIter);
}

/* Smooth escape value for the start z, with the constant c (Julia). */
export function julia(zx, zy, cx, cy, maxIter) {
  return orbit(zx, zy, cx, cy, maxIter);
}

function orbit(x, y, cx, cy, maxIter) {
  let x2 = x * x, y2 = y * y;
  for (let n = 0; n < maxIter; n++) {
    y = 2 * x * y + cy;
    x = x2 - y2 + cx;
    x2 = x * x;
    y2 = y * y;
    if (x2 + y2 > R2) {
      /* n + 1 steps taken. ln|z| = ln(|z|²) / 2. */
      return n + 2 - Math.log2(Math.log(x2 + y2) / 2);
    }
  }
  return INSIDE;
}

/* Plain whole-number escape count (for tests and comparison). */
export function escapeCount(cx, cy, maxIter, radius = 2) {
  let x = 0, y = 0;
  for (let n = 0; n < maxIter; n++) {
    const nx = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = nx;
    if (x * x + y * y > radius * radius) { return n + 1; }
  }
  return INSIDE;
}

/* ---- the view ----------------------------------------------
   A view is a centre (cx, cy) and a width in complex units.
   Zoom = how many times narrower than the first view.
   ------------------------------------------------------------ */
export function zoomOf(view, home = HOME) {
  return home.width / view.width;
}

/* Iterations rise with zoom: deeper spots need more steps
   before you can tell inside from outside. */
export function iterationsFor(zoom, base) {
  const depth = Math.max(0, Math.log10(Math.max(1, zoom)));
  return Math.min(50000, Math.round(base * (1 + depth / 2.5) ** 1.5));
}

/* Pixel (px, py) on a canvas w x h pixels -> complex point. */
export function toComplex(view, w, h, px, py) {
  const s = view.width / w;
  return [view.cx + (px - w / 2) * s, view.cy + (py - h / 2) * s];
}

/* Zoom by `factor` (>1 = in) keeping the point under (px, py) still. */
export function zoomAt(view, w, h, px, py, factor, home = HOME) {
  const [ax, ay] = toComplex(view, w, h, px, py);
  const minWidth = home.width / MAX_ZOOM;
  const maxWidth = home.width * 2;
  const width = Math.max(minWidth, Math.min(maxWidth, view.width / factor));
  const k = width / view.width;
  return { cx: ax + (view.cx - ax) * k, cy: ay + (view.cy - ay) * k, width };
}

/* Move the view by (dx, dy) pixels. */
export function panBy(view, w, dx, dy) {
  const s = view.width / w;
  return { cx: view.cx - dx * s, cy: view.cy - dy * s, width: view.width };
}

/* ---- tiles -------------------------------------------------
   Split a w x h canvas into square tiles, middle ones first
   (that's where people look).
   ------------------------------------------------------------ */
export function tiles(w, h, size = 128) {
  const out = [];
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      out.push({ x, y, w: Math.min(size, w - x), h: Math.min(size, h - y) });
    }
  }
  const mx = w / 2, my = h / 2;
  const d = (t) => (t.x + t.w / 2 - mx) ** 2 + (t.y + t.h / 2 - my) ** 2;
  return out.sort((a, b) => d(a) - d(b));
}

/* Work out one tile: a smooth value per pixel. `step` > 1 = a
   quick coarse pass that samples every step-th pixel and copies
   it into the block. Returns a Float32Array (w * h). */
export function renderTile({ view, canvasW, canvasH, x, y, w, h, step = 1, maxIter, juliaC = null }) {
  const out = new Float32Array(w * h);
  const s = view.width / canvasW;
  const left = view.cx - (canvasW / 2) * s;
  const top = view.cy - (canvasH / 2) * s;
  for (let j = 0; j < h; j += step) {
    const ci = top + (y + j + step / 2) * s;
    for (let i = 0; i < w; i += step) {
      const cr = left + (x + i + step / 2) * s;
      const v = juliaC ? julia(cr, ci, juliaC[0], juliaC[1], maxIter) : mandel(cr, ci, maxIter);
      for (let jj = j; jj < Math.min(h, j + step); jj++) {
        out.fill(v, jj * w + i, jj * w + Math.min(w, i + step));
      }
    }
  }
  return out;
}

/* ---- colour ------------------------------------------------
   Smooth value -> a place on a looping colour ramp. sqrt keeps
   the bands a similar width as values grow at deep zooms.
   ------------------------------------------------------------ */
export function colourIndex(nu, size) {
  if (nu < 0) { return -1; }
  /* Shifted so the far outside (nu near 1) starts dark. */
  const t = Math.sqrt(nu) * 0.32 - 0.45;
  const f = t - Math.floor(t);
  return Math.min(size - 1, Math.floor(f * size));
}

/* Is this zoom past what the numbers can show? */
export function pastPrecision(zoom) {
  return zoom >= PRECISION_LIMIT;
}

/* "×1.2 million" style label. */
export function zoomLabel(zoom) {
  if (zoom < 1000) { return `×${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}`; }
  const exp = Math.floor(Math.log10(zoom));
  const mant = zoom / 10 ** exp;
  return `×${mant.toFixed(1)}e${exp}`;
}

/* Sanity-check a view from a save or bookmark. */
export function validView(v) {
  return Boolean(v) && [v.cx, v.cy, v.width].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    Math.abs(v.cx) < 4 && Math.abs(v.cy) < 4 && v.width > 0 && v.width <= 50;
}
