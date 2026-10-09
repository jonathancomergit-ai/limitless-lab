/* ============================================================
   Neural Net Playground - the decision line (pure, no DOM)

   Marching squares: walk every little square of a grid of
   values and, where the 0.5 level passes through it, add a
   short line segment. Join them all up and you get the edge
   between "red" and "blue".

   values  n x n numbers, row 0 at the top
   returns [x1, y1, x2, y2, ...] in grid units (column, row)
   ============================================================ */

export function contour(values, n, level = 0.5) {
  const out = [];
  const v = (r, c) => values[r * n + c];
  /* Where along an edge from a to b the level is crossed (0..1). */
  const t = (a, b) => (a === b ? 0.5 : (level - a) / (b - a));

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const tl = v(r, c), tr = v(r, c + 1), br = v(r + 1, c + 1), bl = v(r + 1, c);
      const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (code === 0 || code === 15) { continue; }

      /* Crossing points on the four edges. */
      const top    = () => [c + t(tl, tr), r];
      const right  = () => [c + 1, r + t(tr, br)];
      const bottom = () => [c + t(bl, br), r + 1];
      const left   = () => [c, r + t(tl, bl)];
      const seg = (p, q) => out.push(p[0], p[1], q[0], q[1]);

      switch (code) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 6: case 9:  seg(top(), bottom()); break;
        case 7: case 8:  seg(left(), top()); break;
        case 5: case 10: {
          /* A saddle: the centre decides which corners join up. */
          const mid = (tl + tr + br + bl) / 4 > level;
          if ((code === 5) === mid) { seg(left(), top()); seg(bottom(), right()); }
          else { seg(left(), bottom()); seg(top(), right()); }
          break;
        }
      }
    }
  }
  return out;
}
