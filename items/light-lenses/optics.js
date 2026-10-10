/* ============================================================
   Light & Lenses - the optics (no DOM, unit tested)

   Rays are straight lines until they hit a surface. Then:
     mirror  -> reflect (angle in = angle out)
     glass   -> refract with Snell's law: n1 sin(a1) = n2 sin(a2)
                ... or, if that has no answer (going from glass
                to air too steeply), TOTAL INTERNAL REFLECTION.

   Glass bends violet light more than red light (its refractive
   index n depends on the wavelength). That's why a prism makes
   a rainbow. We use Cauchy's formula: n = A + B / λ²  (λ in µm).

   Pieces live in "world" units. Each piece has a centre (x, y),
   a rotation `angle` (radians) and a list of surfaces in its
   own local frame, where a lens's axis runs along local x.
   ============================================================ */

export const GLASS = Object.freeze({ A: 1.5, B: 0.008 });   // a dense-ish glass
export const WHITE = [410, 450, 490, 530, 570, 610, 660];   // nm, violet to red
export const LAMP_NM = 560;                                  // the lamp's beam
export const MAX_BOUNCES = 60;
const EPS = 1e-6;

export const PIECES = ["convex", "concave", "mirror", "curved", "prism", "block"];
export const PIECE_NAMES = {
  convex: "Convex lens", concave: "Concave lens", mirror: "Flat mirror",
  curved: "Curved mirror", prism: "Prism", block: "Glass block", source: "Light"
};
export const SOURCES = ["laser", "white", "lamp"];
export const SOURCE_NAMES = { laser: "Red laser", white: "White laser", lamp: "Lamp (wide beam)" };

/* Refractive index of our glass at a wavelength in nm. */
export function indexOf(nm, glass = GLASS) {
  const um = nm / 1000;
  return glass.A + glass.B / (um * um);
}

/* ---- vector bits ------------------------------------------ */
const dot = (a, b) => a.x * b.x + a.y * b.y;
const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const rad = (d) => (d * Math.PI) / 180;
const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/* Mirror reflection of direction d about a surface normal n. */
export function reflect(d, n) {
  const k = 2 * dot(d, n);
  return { x: d.x - k * n.x, y: d.y - k * n.y };
}

/* Snell's law. d = incoming direction (unit), n = surface normal
   (unit, either side), n1 -> n2 the indices. Returns the new
   direction, the angles in and out (radians, from the normal),
   and whether it was totally internally reflected. */
export function refract(d, n, n1, n2) {
  let N = n;
  let cosi = -dot(d, N);
  if (cosi < 0) { N = { x: -n.x, y: -n.y }; cosi = -cosi; }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  const angleIn = Math.acos(Math.min(1, cosi));
  if (k < 0) {
    return { dir: reflect(d, N), angleIn, angleOut: angleIn, tir: true };
  }
  const dir = norm({ x: eta * d.x + (eta * cosi - Math.sqrt(k)) * N.x, y: eta * d.y + (eta * cosi - Math.sqrt(k)) * N.y });
  return { dir, angleIn, angleOut: Math.asin(Math.min(1, eta * Math.sin(angleIn))), tir: false };
}

/* The angle beyond which light can't leave the glass. */
export function criticalAngle(n1, n2 = 1) { return Math.asin(n2 / n1); }

/* ============================================================
   PIECE SHAPES (local frame)
   A surface is a segment { type: "seg", a, b } or an arc
   { type: "arc", c, r, side, ymax, out }:
     the arc is the part of the circle (centre c, radius r) with
     |y| <= ymax and (x - c.x) * side > 0;
     out = +1 if the outward normal points away from c, -1 if in.
   `kind` says what the piece does: "glass" or "mirror".
   ============================================================ */
export function shapeOf(p) {
  const s = p.size ?? 1;
  switch (p.type) {
    case "convex": {
      const H = 120 * s, R = 150 * s, t = 30 * s;
      const a = R - t / 2;
      const ex = -a + Math.sqrt(R * R - (H / 2) ** 2);       // edge x of the right face
      return {
        kind: "glass", height: H,
        surfaces: [
          { type: "arc", c: { x: -a, y: 0 }, r: R, side: 1, ymax: H / 2, out: 1 },
          { type: "arc", c: { x: a, y: 0 }, r: R, side: -1, ymax: H / 2, out: 1 },
          { type: "seg", a: { x: -ex, y: -H / 2 }, b: { x: ex, y: -H / 2 } },
          { type: "seg", a: { x: -ex, y: H / 2 }, b: { x: ex, y: H / 2 } }
        ]
      };
    }
    case "concave": {
      const H = 120 * s, R = 130 * s, t = 10 * s;
      const a = R + t / 2;
      const ex = a - Math.sqrt(R * R - (H / 2) ** 2);        // edge x (half thickness at the rim)
      return {
        kind: "glass", height: H,
        surfaces: [
          { type: "arc", c: { x: -a, y: 0 }, r: R, side: 1, ymax: H / 2, out: -1 },
          { type: "arc", c: { x: a, y: 0 }, r: R, side: -1, ymax: H / 2, out: -1 },
          { type: "seg", a: { x: -ex, y: -H / 2 }, b: { x: ex, y: -H / 2 } },
          { type: "seg", a: { x: -ex, y: H / 2 }, b: { x: ex, y: H / 2 } }
        ]
      };
    }
    case "mirror": {
      const H = 130 * s;
      return { kind: "mirror", height: H, surfaces: [{ type: "seg", a: { x: 0, y: -H / 2 }, b: { x: 0, y: H / 2 } }] };
    }
    case "curved": {
      /* Concave towards local -x: its focus is at (-R/2, 0). */
      const H = 130 * s, R = 220 * s;
      return { kind: "mirror", height: H, radius: R, surfaces: [{ type: "arc", c: { x: -R, y: 0 }, r: R, side: 1, ymax: H / 2, out: 1 }] };
    }
    case "prism": {
      const L = 130 * s, h = (L * Math.sqrt(3)) / 2;
      const A = { x: 0, y: (-2 * h) / 3 }, B = { x: L / 2, y: h / 3 }, C = { x: -L / 2, y: h / 3 };
      return { kind: "glass", height: h, surfaces: [{ type: "seg", a: A, b: B }, { type: "seg", a: B, b: C }, { type: "seg", a: C, b: A }] };
    }
    case "block": {
      const W = 150 * s, H = 70 * s;
      const P = [{ x: -W / 2, y: -H / 2 }, { x: W / 2, y: -H / 2 }, { x: W / 2, y: H / 2 }, { x: -W / 2, y: H / 2 }];
      return { kind: "glass", height: H, surfaces: P.map((a, k) => ({ type: "seg", a, b: P[(k + 1) % 4] })) };
    }
    default:
      return { kind: "none", height: 0, surfaces: [] };
  }
}

/* Nearest hit of a ray (local frame) on one surface, t > EPS. */
function hitSurface(o, d, s) {
  if (s.type === "seg") {
    const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) { return null; }
    const wx = s.a.x - o.x, wy = s.a.y - o.y;
    const t = (wx * ey - wy * ex) / den;
    const u = (wx * d.y - wy * d.x) / den;
    if (t <= EPS || u < 0 || u > 1) { return null; }
    /* Outward normal: away from the piece centre (shapes are convex). */
    let n = norm({ x: ey, y: -ex });
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    if (dot(n, mid) < 0) { n = { x: -n.x, y: -n.y }; }
    return { t, n };
  }
  /* Arc: solve |o + t d - c|² = r². */
  const ox = o.x - s.c.x, oy = o.y - s.c.y;
  const b = ox * d.x + oy * d.y;
  const c = ox * ox + oy * oy - s.r * s.r;
  const disc = b * b - c;
  if (disc < 0) { return null; }
  const sq = Math.sqrt(disc);
  for (const t of [-b - sq, -b + sq]) {
    if (t <= EPS) { continue; }
    const px = o.x + t * d.x, py = o.y + t * d.y;
    if (Math.abs(py) > s.ymax + 1e-9 || (px - s.c.x) * s.side <= 0) { continue; }
    const n = { x: ((px - s.c.x) / s.r) * s.out, y: ((py - s.c.y) / s.r) * s.out };
    return { t, n };
  }
  return null;
}

/* ============================================================
   TRACING
   ============================================================ */

/* Trace one ray through every piece. Returns
     points   the path, as [{x, y}, ...]
     hits     [{ piece, x, y, kind, angleIn, angleOut }] in order
              (kind: "refract" | "reflect" | "tir"; angles in degrees) */
export function traceRay(origin, dir, nm, pieces, { bounds = 4000, maxBounces = MAX_BOUNCES } = {}) {
  const shapes = pieces.map((p) => ({ p, shape: shapeOf(p) }));
  let o = { ...origin };
  let d = norm(dir);
  const points = [{ ...o }];
  const hits = [];
  const n = indexOf(nm);
  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    let best = null;
    for (let k = 0; k < shapes.length; k++) {
      const { p, shape } = shapes[k];
      if (!shape.surfaces.length) { continue; }
      /* Into the piece's frame. */
      const lo = rot({ x: o.x - p.x, y: o.y - p.y }, -p.angle);
      const ld = rot(d, -p.angle);
      for (const s of shape.surfaces) {
        const h = hitSurface(lo, ld, s);
        if (h && (!best || h.t < best.t)) { best = { t: h.t, n: rot(h.n, p.angle), k, kind: shape.kind }; }
      }
    }
    if (!best) {
      const far = { x: o.x + d.x * bounds, y: o.y + d.y * bounds };
      points.push(far);
      return { points, hits, escaped: true };
    }
    o = { x: o.x + d.x * best.t, y: o.y + d.y * best.t };
    points.push({ ...o });
    const deg = (r) => (r * 180) / Math.PI;
    if (best.kind === "mirror") {
      const a = Math.acos(Math.min(1, Math.abs(dot(d, best.n))));
      d = norm(reflect(d, best.n));
      hits.push({ piece: best.k, x: o.x, y: o.y, kind: "reflect", angleIn: deg(a), angleOut: deg(a) });
    } else {
      const entering = dot(d, best.n) < 0;
      const r = refract(d, best.n, entering ? 1 : n, entering ? n : 1);
      d = r.dir;
      hits.push({ piece: best.k, x: o.x, y: o.y, kind: r.tir ? "tir" : "refract", angleIn: deg(r.angleIn), angleOut: deg(r.angleOut), entering });
    }
  }
  return { points, hits, escaped: false };
}

/* The rays a source sends out: [{ origin, dir, nm, color }].
   color is null for a spectral colour (draw it from nm). */
export function sourceRays(src) {
  const d = { x: Math.cos(src.angle), y: Math.sin(src.angle) };
  const nose = { x: src.x + d.x * 28, y: src.y + d.y * 28 };
  if (src.type === "white") { return WHITE.map((nm) => ({ origin: nose, dir: d, nm, color: null })); }
  if (src.type === "lamp") {
    const side = { x: -d.y, y: d.x };
    const rays = [];
    for (let k = -4; k <= 4; k++) {
      const off = k * 7;
      rays.push({ origin: { x: nose.x + side.x * off, y: nose.y + side.y * off }, dir: d, nm: LAMP_NM, color: "lamp" });
    }
    return rays;
  }
  return [{ origin: nose, dir: d, nm: 650, color: null }];
}

/* Trace everything a source sends out. */
export function traceAll(src, pieces, opts) {
  return sourceRays(src).map((r) => ({ ...r, ...traceRay(r.origin, r.dir, r.nm, pieces, opts) }));
}

/* Focal length of a lens or curved mirror, measured by tracing
   a thin ray parallel to the axis and seeing where it crosses
   it. Positive = real focus (converging), negative = virtual.
   Measured from the piece's centre, along its axis. */
export function focalLength(type, nm = LAMP_NM, size = 1) {
  if (type === "curved") { return shapeOf({ type, size }).radius / 2; }
  if (type !== "convex" && type !== "concave") { return null; }
  const piece = { type, size, x: 0, y: 0, angle: 0 };
  const h = 1.5 * size;
  const r = traceRay({ x: -1000, y: h }, { x: 1, y: 0 }, nm, [piece], { bounds: 10 });
  const pts = r.points;
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const dy = b.y - a.y;
  if (Math.abs(dy) < 1e-12) { return Infinity; }
  return a.x + ((0 - a.y) * (b.x - a.x)) / dy;
}

/* Is a world point inside (or very near) a piece? For picking. */
export function hitTest(p, x, y, slop = 14) {
  const l = rot({ x: x - p.x, y: y - p.y }, -p.angle);
  const s = p.size ?? 1;
  if (p.type === "source") { return Math.abs(l.x) <= 30 + slop && Math.abs(l.y) <= 16 + slop; }
  const shape = shapeOf(p);
  const H = shape.height;
  const W = { convex: 32, concave: 46, mirror: 6, curved: 46, prism: 130, block: 150 }[p.type] * s;
  return Math.abs(l.x) <= W / 2 + slop && Math.abs(l.y) <= (p.type === "prism" ? (2 * H) / 3 : H / 2) + slop;
}

/* Wavelength (nm) -> an RGB colour, roughly as the eye sees it. */
export function wavelengthRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  const f = nm < 420 ? 0.35 + (0.65 * (nm - 380)) / 40 : nm > 680 ? 0.35 + (0.65 * (750 - nm)) / 70 : 1;
  return [r, g, b].map((v) => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8)));
}

/* ---- scenes ----------------------------------------------- */
export const SCENES = ["rainbow", "focus", "fibre", "mirrors"];
export const SCENE_NAMES = { rainbow: "Prism rainbow", focus: "Lenses", fibre: "Trapped light", mirrors: "Mirrors" };

/* A starting layout for a world of size w x h. */
export function scene(name, w, h) {
  const tall = h > w * 1.1;
  const P = (type, fx, fy, deg = 0) => ({ type, x: fx * w, y: fy * h, angle: (deg * Math.PI) / 180, size: 1 });
  switch (name) {
    case "focus":
      return tall
        ? { source: { ...P("source", 0.5, 0.06, 90), type: "lamp" }, pieces: [P("convex", 0.5, 0.3, 90), P("concave", 0.5, 0.72, 90)] }
        : { source: { ...P("source", 0.06, 0.5, 0), type: "lamp" }, pieces: [P("convex", 0.3, 0.5), P("concave", 0.72, 0.5)] };
    case "fibre": {
      /* A laser goes in through the END of a glass block, steeply.
         Inside, it hits the long sides past the critical angle and
         bounces along: total internal reflection, like a fibre. */
      const block = { ...P("block", 0.55, 0.5, tall ? 70 : 12), size: 1.7 };
      const W = 150 * block.size, H = 70 * block.size;
      const entry = { x: -W / 2, y: H * 0.3 };                       // local: low on the end face
      const inDir = rot({ x: 1, y: -0.0 }, (-55 * Math.PI) / 180);  // 55° from the face normal
      const back = Math.min(150, 0.45 * Math.min(w, h));
      const local = { x: entry.x - inDir.x * back, y: entry.y - inDir.y * back };
      const at = rot(local, block.angle);
      const dir = rot(inDir, block.angle);
      return { source: { type: "laser", x: block.x + at.x - dir.x * 28, y: block.y + at.y - dir.y * 28, angle: Math.atan2(dir.y, dir.x), size: 1 }, pieces: [block] };
    }
    case "mirrors": {
      /* Aim: laser -> flat mirror -> curved mirror, which focuses it. */
      const S = tall ? { x: 0.15 * w, y: 0.1 * h } : { x: 0.07 * w, y: 0.25 * h };
      const M = tall ? { x: 0.7 * w, y: 0.35 * h } : { x: 0.55 * w, y: 0.3 * h };
      const Cm = tall ? { x: 0.35 * w, y: 0.78 * h } : { x: 0.3 * w, y: 0.75 * h };
      const din = norm({ x: M.x - S.x, y: M.y - S.y });
      const dout = norm({ x: Cm.x - M.x, y: Cm.y - M.y });
      const normal = norm({ x: dout.x - din.x, y: dout.y - din.y });
      return {
        source: { type: "laser", x: S.x, y: S.y, angle: Math.atan2(din.y, din.x), size: 1 },
        pieces: [
          { type: "mirror", x: M.x, y: M.y, angle: Math.atan2(normal.y, normal.x), size: 1 },
          /* Tilted off the beam, so the bounce goes somewhere new. */
          { type: "curved", x: Cm.x, y: Cm.y, angle: Math.atan2(dout.y, dout.x) + (tall ? -0.5 : 0.5), size: 1 }
        ]
      };
    }
    default: {
      /* White laser aimed at the middle of the prism's left face. */
      const prism = P("prism", tall ? 0.42 : 0.45, tall ? 0.4 : 0.42, 0);
      const L = 130, hh = (L * Math.sqrt(3)) / 2;
      const face = { x: prism.x - L / 4, y: prism.y - hh / 6 };
      const dir = { x: Math.cos(rad(-14)), y: Math.sin(rad(-14)) };
      const back = Math.max(60, Math.min(320, 0.33 * w, face.x - 70));
      return {
        source: { type: "white", x: face.x - dir.x * (back + 28), y: face.y - dir.y * (back + 28), angle: Math.atan2(dir.y, dir.x), size: 1 },
        pieces: [prism]
      };
    }
  }
}

/* ---- a new screen shape ------------------------------------ */
/* A direction after stretching x by sx and y by sy: the arrow
   still points at the same (stretched) spot. */
export function stretchAngle(angle, sx, sy) {
  return Math.atan2(Math.sin(angle) * sy, Math.cos(angle) * sx);
}

/* Is this layout still scene `name`, untouched, for a w x h world
   (to the 2 decimals a save keeps)? Then it can be rebuilt for a
   new screen shape, which keeps every aim exact. */
export function isScene(name, w, h, source, pieces) {
  const s = scene(name, w, h);
  const same = (a, b) => a.type === b.type && Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02 && Math.abs(a.angle - b.angle) < 0.02;
  return same(s.source, source) && s.pieces.length === pieces.length && s.pieces.every((p, k) => same(p, pieces[k]));
}
