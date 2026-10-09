/* ============================================================
   Fourier Draw - preset drawings (pure, no DOM)

   Each is a list of [x, y] points, y pointing DOWN like the
   screen, roughly inside -0.8..0.8. resample() evens them out.
   ============================================================ */

export const SHAPES = ["heart", "star", "note"];

function heart() {
  /* The classic heart curve. */
  const pts = [];
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x / 21, -y / 21 - 0.05]);
  }
  return pts;
}

function star() {
  /* Five points, ten corners. */
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.34 : 0.82;
    pts.push([r * Math.cos(a), r * Math.sin(a) + 0.06]);
  }
  return pts;
}

function note() {
  /* A quaver: an oval head, a stem, and a curly flag. */
  const pts = [];
  const hx = -0.22, hy = 0.5;
  /* Head, drawn from the top-right where the stem joins. */
  for (let i = 0; i <= 40; i++) {
    const t = -0.35 + (i / 40) * Math.PI * 2;
    const x = 0.24 * Math.cos(t), y = 0.16 * Math.sin(t);
    const r = -0.45;  // tilt
    pts.push([hx + x * Math.cos(r) - y * Math.sin(r), hy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  const sx = pts[0][0];
  /* Up the stem. */
  pts.push([sx, -0.75]);
  /* The flag: swoop out and down. */
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    pts.push([sx + 0.42 * Math.sin(t * Math.PI * 0.85), -0.75 + 0.75 * t + 0.08 * Math.sin(t * Math.PI)]);
  }
  /* Back along the inside of the flag to the stem. */
  for (let i = 1; i <= 20; i++) {
    const t = 1 - i / 20;
    pts.push([sx + 0.28 * Math.sin(t * Math.PI * 0.85), -0.62 + 0.55 * t]);
  }
  /* Down the stem back to the head. */
  pts.push([sx + 0.02, -0.6]);
  pts.push([sx + 0.02, pts[0][1] - 0.01]);
  return pts;
}

export function makeShape(name) {
  if (name === "heart") { return heart(); }
  if (name === "star") { return star(); }
  if (name === "note") { return note(); }
  throw new Error(`Unknown shape: ${name}`);
}
