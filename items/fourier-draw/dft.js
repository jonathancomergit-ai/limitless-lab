/* ============================================================
   Fourier Draw - the maths (pure, no DOM)

   Any closed drawing can be rebuilt from spinning circles.

   1. resample   walk along the drawing and drop N points an
                 equal distance apart.
   2. dft        treat each point as a complex number x + iy and
                 run the discrete Fourier transform. Each result
                 is one circle: how fast it spins (freq), how big
                 it is (amp) and where it starts (phase).
   3. tip        add the circles up, tip to tip, at time t.
                 Using all of them lands exactly on the drawing.

   Points are [x, y] pairs.
   ============================================================ */

/* ---- 1. even spacing -------------------------------------- */

/* N points evenly spaced along the path, treated as a closed
   loop (the pen jumps back to the start at the end). */
export function resample(path, n) {
  if (path.length === 0) { return []; }
  if (path.length === 1) { return Array.from({ length: n }, () => [path[0][0], path[0][1]]); }
  const pts = [...path, path[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) { return Array.from({ length: n }, () => [path[0][0], path[0][1]]); }
  const out = [];
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (seg < pts.length - 1 && cum[seg] < d) { seg++; }
    const a = pts[seg - 1], b = pts[seg];
    const len = cum[seg] - cum[seg - 1];
    const f = len > 0 ? (d - cum[seg - 1]) / len : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/* Length of a path (open), handy for ignoring tiny taps. */
export function pathLength(path) {
  let s = 0;
  for (let i = 1; i < path.length; i++) { s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); }
  return s;
}

/* ---- 2. the transform ------------------------------------- */

/* X_k = (1/N) * sum over n of z_n * e^(-2 pi i k n / N), for
   k = -N/2 .. N/2 - 1 (negative k = circles spinning backwards).
   Sorted biggest circle first. The k = 0 term is the centre. */
export function dft(points) {
  const N = points.length;
  const out = [];
  const lo = -Math.floor(N / 2);
  for (let k = lo; k < lo + N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = (-2 * Math.PI * k * n) / N;
      const c = Math.cos(a), s = Math.sin(a);
      const [x, y] = points[n];
      re += x * c - y * s;
      im += x * s + y * c;
    }
    re /= N;
    im /= N;
    out.push({ freq: k, re, im, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
  }
  out.sort((p, q) => q.amp - p.amp || Math.abs(p.freq) - Math.abs(q.freq));
  return out;
}

/* ---- 3. back again ---------------------------------------- */

/* Where the chain of the first `count` circles ends at time t
   (t = 0..1 is one full trip round the drawing). Also returns
   every joint if `joints` is an array to fill. */
export function tip(coeffs, t, count = coeffs.length, joints = null) {
  let x = 0, y = 0;
  if (joints) { joints.length = 0; joints.push([0, 0]); }
  const m = Math.min(count, coeffs.length);
  for (let i = 0; i < m; i++) {
    const c = coeffs[i];
    const a = 2 * Math.PI * c.freq * t + c.phase;
    x += c.amp * Math.cos(a);
    y += c.amp * Math.sin(a);
    if (joints) { joints.push([x, y]); }
  }
  return [x, y];
}

/* The inverse DFT: rebuild all N points from the circles. */
export function idft(coeffs, N = coeffs.length) {
  return Array.from({ length: N }, (_, n) => tip(coeffs, n / N));
}
