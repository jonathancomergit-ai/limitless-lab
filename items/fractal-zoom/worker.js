/* ============================================================
   Fractal Zoom - tile worker

   Runs off the main thread, so the page never freezes. Gets
   one tile job at a time, works out the smooth escape values
   (mandel.js), colours them, and sends back RGBA pixels.

   Messages in:
     { type: "palette", lut: Uint32Array, inside: number }
     { type: "tile", id, gen, view, canvasW, canvasH, x, y, w, h, step, maxIter, juliaC }
   Message out:
     { id, gen, x, y, w, h, step, pixels: ArrayBuffer }
   ============================================================ */

import { renderTile, colourIndex } from "./mandel.js";

let lut = new Uint32Array([0xffffffff]);
let inside = 0xff000000;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "palette") {
    lut = m.lut;
    inside = m.inside;
    return;
  }
  if (m.type !== "tile") { return; }
  const values = renderTile(m);
  const px = new Uint32Array(m.w * m.h);
  const n = lut.length;
  for (let i = 0; i < values.length; i++) {
    const k = colourIndex(values[i], n);
    px[i] = k < 0 ? inside : lut[k];
  }
  self.postMessage({ id: m.id, gen: m.gen, x: m.x, y: m.y, w: m.w, h: m.h, step: m.step, pixels: px.buffer }, [px.buffer]);
};
