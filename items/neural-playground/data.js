/* ============================================================
   Neural Net Playground - starter dot sets (pure, no DOM)

   Four classic puzzles, each harder than the last:

     blobs    two clouds: a straight line splits them
     circle   blue inside, red around: needs a curve
     xor      opposite corners match: needs two lines
     spiral   two arms wound together: needs a deep-ish net

   Each comes from a seeded generator, so a preset is the same
   dots every time. Points are [x, y, label], label 1 = blue.
   ============================================================ */

import { rng, gaussian } from "./net.js";

export const PRESETS = ["blobs", "circle", "xor", "spiral"];

const clamp = (v) => Math.max(-0.97, Math.min(0.97, v));
const round = (v) => Math.round(clamp(v) * 1000) / 1000;
const pt = (x, y, label) => [round(x), round(y), label];

export function makePreset(name, seed = 7) {
  const rand = rng(seed);
  const out = [];

  if (name === "blobs") {
    for (let i = 0; i < 36; i++) {
      out.push(pt(-0.42 + gaussian(rand) * 0.17, -0.3 + gaussian(rand) * 0.17, 0));
      out.push(pt(0.42 + gaussian(rand) * 0.17, 0.3 + gaussian(rand) * 0.17, 1));
    }
  } else if (name === "circle") {
    for (let i = 0; i < 40; i++) {
      const a1 = rand() * Math.PI * 2;
      const r1 = Math.sqrt(rand()) * 0.36;
      out.push(pt(Math.cos(a1) * r1, Math.sin(a1) * r1, 1));
      const a2 = rand() * Math.PI * 2;
      const r2 = 0.6 + rand() * 0.28;
      out.push(pt(Math.cos(a2) * r2, Math.sin(a2) * r2, 0));
    }
  } else if (name === "xor") {
    for (let i = 0; i < 80; i++) {
      const sx = rand() < 0.5 ? -1 : 1;
      const sy = rand() < 0.5 ? -1 : 1;
      const x = sx * (0.12 + rand() * 0.8);
      const y = sy * (0.12 + rand() * 0.8);
      out.push(pt(x, y, sx * sy > 0 ? 0 : 1));
    }
  } else if (name === "spiral") {
    const n = 50;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const r = 0.08 + t * 0.82;
      const a = t * Math.PI * 3.2;
      for (const [label, turn] of [[1, 0], [0, Math.PI]]) {
        out.push(pt(r * Math.cos(a + turn) + gaussian(rand) * 0.025,
                    r * Math.sin(a + turn) + gaussian(rand) * 0.025, label));
      }
    }
  } else {
    throw new Error(`Unknown preset: ${name}`);
  }
  return out;
}
