/* ============================================================
   Neural Net Playground - the network (pure maths, no DOM)

   A tiny multi-layer perceptron, written out by hand:

     inputs (x, y) -> 1 to 3 hidden layers -> 1 output

   - Hidden layers use tanh, ReLU or sigmoid.
   - The output is a sigmoid: the chance a point is "blue".
   - Loss is binary cross-entropy (the usual one for yes/no).
   - Gradients come from backpropagation (the chain rule,
     run backwards through the layers).
   - Weights are updated with Adam.
   - Everything random comes from a seeded generator, so the
     same seed always gives the same network and the same run.

   Points are arrays: [x, y, label], x and y in -1..1,
   label 0 = red, 1 = blue.
   ============================================================ */

/* ---- seeded randomness ----------------------------------- */

/* mulberry32: a small, fast, good-enough 32-bit generator. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A normal (bell-curve) number, from two uniform ones. */
export function gaussian(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---- activations ------------------------------------------
   df takes the activation's OUTPUT a, not its input: that's
   all backprop has to hand, and all three only need a. */
export const ACTIVATIONS = {
  tanh:    { f: Math.tanh,                        df: (a) => 1 - a * a },
  relu:    { f: (z) => (z > 0 ? z : 0),           df: (a) => (a > 0 ? 1 : 0) },
  sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)),    df: (a) => a * (1 - a) }
};

export function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

/* Cross-entropy for one point, worked out from the logit z so it
   never takes log(0): max(z,0) - z*y + log(1 + e^-|z|). */
export function bce(z, y) {
  return Math.max(z, 0) - z * y + Math.log1p(Math.exp(-Math.abs(z)));
}

/* ---- the network ----------------------------------------- */

export function createNet({ hidden = [4, 4], activation = "tanh", seed = 1, inputs = 2 } = {}) {
  if (!ACTIVATIONS[activation]) { throw new Error(`Unknown activation: ${activation}`); }
  const rand = rng(seed);
  const sizes = [inputs, ...hidden, 1];
  const layers = [];
  for (let l = 1; l < sizes.length; l++) {
    const nIn = sizes[l - 1];
    const nOut = sizes[l];
    const isOutput = l === sizes.length - 1;
    /* He init for ReLU, Xavier-ish otherwise: keeps the signal a
       sensible size as it passes through each layer. */
    const scale = !isOutput && activation === "relu" ? Math.sqrt(2 / nIn) : Math.sqrt(1 / nIn);
    const W = new Float64Array(nOut * nIn);
    for (let k = 0; k < W.length; k++) { W[k] = gaussian(rand) * scale; }
    const b = new Float64Array(nOut).fill(!isOutput && activation === "relu" ? 0.1 : 0);
    layers.push({ nIn, nOut, W, b });
  }
  return { sizes, activation, seed, layers };
}

/* Scratch space for one forward pass: acts[0] is the input,
   acts[l] the output of layer l, acts[last][0] the logit. */
export function allocActs(net) {
  return net.sizes.map((n) => new Float64Array(n));
}

export function forward(net, x, y, acts = allocActs(net)) {
  const act = ACTIVATIONS[net.activation].f;
  const L = net.layers.length;
  acts[0][0] = x;
  acts[0][1] = y;
  for (let l = 0; l < L; l++) {
    const { nIn, nOut, W, b } = net.layers[l];
    const a = acts[l];
    const z = acts[l + 1];
    const last = l === L - 1;
    for (let o = 0; o < nOut; o++) {
      let s = b[o];
      const row = o * nIn;
      for (let i = 0; i < nIn; i++) { s += W[row + i] * a[i]; }
      z[o] = last ? s : act(s);
    }
  }
  return acts;
}

/* Chance that (x, y) is blue. */
export function predict(net, x, y) {
  const acts = forward(net, x, y);
  return sigmoid(acts[acts.length - 1][0]);
}

/* Gradients, shaped like the weights. */
export function zeroGrads(net) {
  return net.layers.map(({ W, b }) => ({ W: new Float64Array(W.length), b: new Float64Array(b.length) }));
}

/* Mean loss over the points, and its gradient for every weight. */
export function lossAndGrad(net, points, grads = zeroGrads(net)) {
  const df = ACTIVATIONS[net.activation].df;
  const L = net.layers.length;
  for (const g of grads) { g.W.fill(0); g.b.fill(0); }
  if (!points.length) { return { loss: 0, grads }; }

  const acts = allocActs(net);
  const deltas = net.layers.map((ly) => new Float64Array(ly.nOut));
  let loss = 0;

  for (const p of points) {
    forward(net, p[0], p[1], acts);
    const z = acts[L][0];
    const y = p[2];
    loss += bce(z, y);
    deltas[L - 1][0] = sigmoid(z) - y;          // dLoss/dLogit

    for (let l = L - 1; l >= 0; l--) {
      const { nIn, nOut, W } = net.layers[l];
      const a = acts[l];
      const d = deltas[l];
      const g = grads[l];
      for (let o = 0; o < nOut; o++) {
        g.b[o] += d[o];
        const row = o * nIn;
        for (let i = 0; i < nIn; i++) { g.W[row + i] += d[o] * a[i]; }
      }
      if (l > 0) {
        const back = deltas[l - 1];
        for (let i = 0; i < nIn; i++) {
          let s = 0;
          for (let o = 0; o < nOut; o++) { s += W[o * nIn + i] * d[o]; }
          back[i] = s * df(a[i]);
        }
      }
    }
  }

  const n = points.length;
  for (const g of grads) {
    for (let k = 0; k < g.W.length; k++) { g.W[k] /= n; }
    for (let k = 0; k < g.b.length; k++) { g.b[k] /= n; }
  }
  return { loss: loss / n, grads };
}

/* Mean loss only (no gradients). */
export function meanLoss(net, points) {
  if (!points.length) { return 0; }
  const acts = allocActs(net);
  const L = net.layers.length;
  let loss = 0;
  for (const p of points) { loss += bce(forward(net, p[0], p[1], acts)[L][0], p[2]); }
  return loss / points.length;
}

/* ---- Adam ------------------------------------------------- */

export function createAdam(net, { lr = 0.03, beta1 = 0.9, beta2 = 0.999, eps = 1e-8 } = {}) {
  const m = zeroGrads(net);
  const v = zeroGrads(net);
  const opt = {
    lr, t: 0,
    step(grads) {
      opt.t += 1;
      const c1 = 1 - beta1 ** opt.t;
      const c2 = 1 - beta2 ** opt.t;
      for (let l = 0; l < net.layers.length; l++) {
        for (const key of ["W", "b"]) {
          const w = net.layers[l][key];
          const g = grads[l][key];
          const mk = m[l][key];
          const vk = v[l][key];
          for (let k = 0; k < w.length; k++) {
            mk[k] = beta1 * mk[k] + (1 - beta1) * g[k];
            vk[k] = beta2 * vk[k] + (1 - beta2) * g[k] * g[k];
            w[k] -= opt.lr * (mk[k] / c1) / (Math.sqrt(vk[k] / c2) + eps);
          }
        }
      }
    }
  };
  return opt;
}

/* One full pass over the data (one "epoch"). Returns the loss
   measured just before the update. */
export function trainEpoch(net, opt, points, grads = zeroGrads(net)) {
  const { loss } = lossAndGrad(net, points, grads);
  if (points.length) { opt.step(grads); }
  return loss;
}

/* ---- pictures --------------------------------------------- */

/* Sample the network on an n x n grid over -1..1 (row 0 = top,
   y = +1). Cell centres, so a scaled-up image lines up exactly.
   Returns the output chance per cell, and, if asked, every
   hidden neuron's value per cell (for the little neuron maps). */
export function sampleGrid(net, n, { neurons = false } = {}) {
  const probs = new Float32Array(n * n);
  const acts = allocActs(net);
  const L = net.layers.length;
  const maps = neurons ? net.sizes.map((size) => Array.from({ length: size }, () => new Float32Array(n * n))) : null;
  for (let r = 0; r < n; r++) {
    const y = 1 - ((r + 0.5) * 2) / n;
    for (let c = 0; c < n; c++) {
      const x = -1 + ((c + 0.5) * 2) / n;
      forward(net, x, y, acts);
      const k = r * n + c;
      probs[k] = sigmoid(acts[L][0]);
      if (maps) {
        for (let l = 0; l < L; l++) {
          for (let j = 0; j < acts[l].length; j++) { maps[l][j][k] = acts[l][j]; }
        }
        maps[L][0][k] = probs[k];
      }
    }
  }
  return { n, probs, maps };
}

/* How many points the network gets right (chance > 0.5 = blue). */
export function accuracy(net, points) {
  if (!points.length) { return 0; }
  let right = 0;
  for (const p of points) { if ((predict(net, p[0], p[1]) > 0.5 ? 1 : 0) === p[2]) { right++; } }
  return right / points.length;
}
