/* ============================================================
   Light & Lenses - the optics, unit tested

   - Snell's law angles match known values
   - total internal reflection past the critical angle
   - a mirror reflects at equal angles
   - prisms split colours, lenses focus, blocks shift rays
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refract, reflect, criticalAngle, indexOf, traceRay, traceAll, focalLength, shapeOf, hitTest,
  scene, wavelengthRGB, sourceRays, SCENES, PIECES, WHITE
} from "../../items/light-lenses/optics.js";

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);
/* A ray coming down onto a flat surface whose normal is +y. */
const incoming = (a) => ({ x: Math.sin(rad(a)), y: -Math.cos(rad(a)) });
const UP = { x: 0, y: 1 };

test("Snell's law angles match known values", () => {
  /* air -> glass (1.5) at 30° gives 19.47°; air -> water (1.333) at 45° gives 32.0° */
  near(deg(refract(incoming(30), UP, 1, 1.5).angleOut), 19.471, 0.01);
  near(deg(refract(incoming(45), UP, 1, 1.333).angleOut), 32.03, 0.02);
  near(deg(refract(incoming(60), UP, 1, 1.5).angleOut), 35.264, 0.01);
  /* Head on: no bend. */
  const r = refract(incoming(0), UP, 1, 1.5);
  near(r.dir.x, 0, 1e-12);
  near(r.dir.y, -1, 1e-12);
  /* The new direction really obeys n1 sin a1 = n2 sin a2. */
  for (const a of [10, 25, 40, 70]) {
    const out = refract(incoming(a), UP, 1, 1.5);
    near(Math.sin(rad(a)), 1.5 * Math.abs(out.dir.x), 1e-12, `at ${a}°`);
    near(Math.hypot(out.dir.x, out.dir.y), 1, 1e-12);
  }
});

test("total internal reflection past the critical angle", () => {
  const crit = deg(criticalAngle(1.5));
  near(crit, 41.81, 0.01);
  /* glass -> air, just under: it gets out, bent to nearly 90° */
  const under = refract(incoming(crit - 0.5), UP, 1.5, 1);
  assert.equal(under.tir, false);
  assert.ok(deg(under.angleOut) > 80);
  /* just over: trapped */
  const over = refract(incoming(crit + 0.5), UP, 1.5, 1);
  assert.equal(over.tir, true);
  assert.ok(over.dir.y > 0, "bounced back up");
  /* air -> glass never does it */
  assert.equal(refract(incoming(89), UP, 1, 1.5).tir, false);
});

test("TIR shows up inside the glass block", () => {
  const s = scene("fibre", 1376, 600);
  const all = traceAll(s.source, s.pieces);
  assert.ok(all[0].hits.some((h) => h.kind === "tir"), JSON.stringify(all[0].hits.map((h) => h.kind)));
});

test("a mirror reflects at equal angles", () => {
  for (const a of [0, 15, 33, 60, 85]) {
    const d = incoming(a);
    const out = reflect(d, UP);
    near(out.x, d.x, 1e-12);
    near(out.y, -d.y, 1e-12);
  }
  /* Through the tracer: a flat mirror turned 45° sends a ray off at 90°. */
  const mirror = { type: "mirror", x: 100, y: 0, angle: rad(45), size: 1 };
  const r = traceRay({ x: 0, y: 0 }, { x: 1, y: 0 }, 650, [mirror]);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].kind, "reflect");
  near(r.hits[0].angleIn, 45, 1e-9);
  near(r.hits[0].angleOut, 45, 1e-9);
  const [a, b] = r.points.slice(-2);
  near(Math.abs(b.x - a.x), 0, 1e-6, "goes straight up or down");
});

test("glass bends violet more than red, so a prism splits white light", () => {
  assert.ok(indexOf(410) > indexOf(660));
  const prism = { type: "prism", x: 200, y: 0, angle: 0, size: 1 };
  const exit = (nm) => {
    const r = traceRay({ x: 0, y: 20 }, { x: 1, y: -0.25 }, nm, [prism]);
    const [a, b] = r.points.slice(-2);
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const turn = WHITE.map(exit);
  /* Every colour leaves at a different angle, in rainbow order. */
  for (let k = 1; k < turn.length; k++) { assert.ok(turn[k] !== turn[k - 1]); }
  const spread = Math.abs(deg(turn[0] - turn[turn.length - 1]));
  assert.ok(spread > 0.8, `spread only ${spread}°`);
  const s = scene("rainbow", 1376, 600);
  for (const ray of traceAll(s.source, s.pieces)) { assert.equal(ray.hits.length, 2, "white light should go in and out of the prism"); }
});

test("a convex lens focuses, a concave lens spreads; the numbers match the lensmaker's equation", () => {
  const n = indexOf(560);
  /* Thick-lens lensmaker for R = 150, t = 30. */
  const R = 150, t = 30;
  const f = 1 / ((n - 1) * (2 / R - ((n - 1) * t) / (n * R * R)));
  const bfl = f * (1 - ((n - 1) * t) / (n * R));          // from the back face
  near(focalLength("convex"), bfl + t / 2, 1.5, "convex");
  assert.ok(focalLength("concave") < 0);
  near(focalLength("curved"), shapeOf({ type: "curved" }).radius / 2, 1e-9);
  /* Parallel rays at different heights all cross the axis close together. */
  const lens = { type: "convex", x: 0, y: 0, angle: 0, size: 1 };
  const cross = [5, 15, 25].map((h) => {
    const r = traceRay({ x: -500, y: h }, { x: 1, y: 0 }, 560, [lens], { bounds: 10 });
    const [a, b] = r.points.slice(-2);
    return a.x + ((0 - a.y) * (b.x - a.x)) / (b.y - a.y);
  });
  assert.ok(Math.max(...cross) - Math.min(...cross) < 12, `focus spread ${cross}`);
});

test("a glass block shifts a ray sideways but keeps its direction", () => {
  const block = { type: "block", x: 0, y: 0, angle: 0, size: 1 };
  const d = { x: Math.cos(rad(-30)), y: Math.sin(rad(-30)) };
  const r = traceRay({ x: -120, y: 100 }, d, 560, [block]);
  assert.equal(r.hits.length, 2);
  const [a, b] = r.points.slice(-2);
  const out = Math.atan2(b.y - a.y, b.x - a.x);
  near(out, rad(-30), 1e-9);
});

test("every piece has a closed outline, and picking works", () => {
  for (const type of PIECES) {
    const s = shapeOf({ type, size: 1 });
    assert.ok(s.surfaces.length >= 1, type);
    const p = { type, x: 50, y: 60, angle: 0.3, size: 1 };
    assert.ok(hitTest(p, 50, 60), `${type} centre`);
    assert.ok(!hitTest(p, 400, 60), `${type} far away`);
  }
  assert.ok(hitTest({ type: "source", x: 0, y: 0, angle: 0 }, 10, 5));
});

test("sources: laser = 1 ray, white = 7 colours, lamp = a wide beam", () => {
  const src = { x: 0, y: 0, angle: 0 };
  assert.equal(sourceRays({ ...src, type: "laser" }).length, 1);
  assert.equal(sourceRays({ ...src, type: "white" }).length, WHITE.length);
  const lamp = sourceRays({ ...src, type: "lamp" });
  assert.ok(lamp.length >= 5);
  assert.ok(new Set(lamp.map((r) => r.origin.y)).size === lamp.length);
});

test("every scene traces without getting stuck, at both shapes of screen", () => {
  for (const name of SCENES) {
    for (const [w, h] of [[1376, 600], [600, 862]]) {
      const s = scene(name, w, h);
      const all = traceAll(s.source, s.pieces);
      assert.ok(all.every((r) => r.points.length >= 2));
      assert.ok(all.some((r) => r.hits.length > 0), `${name} ${w}x${h}: light misses everything`);
    }
  }
});

test("wavelength colours: violet is blue-ish, red is red", () => {
  const [r1, , b1] = wavelengthRGB(420);
  const [r2, g2, b2] = wavelengthRGB(650);
  assert.ok(b1 > r1);
  assert.ok(r2 > g2 && r2 > b2);
});
