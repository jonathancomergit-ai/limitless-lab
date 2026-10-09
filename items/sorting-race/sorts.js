/* ============================================================
   Sorting Race - the algorithms (no DOM, unit tested)

   Each sort is a GENERATOR: it sorts the array in place and
   pauses after every basic move, telling us what it just did:
     { op: "compare", i, j }       looked at a[i] and a[j]
     { op: "swap", i, j }          swapped a[i] and a[j]
     { op: "write", i }            wrote a new value into a[i]
                                   (merge sort copies, it doesn't swap)
   So the page can play a sort one move at a time, and count.
   ============================================================ */

export const ALGOS = ["bubble", "insertion", "selection", "merge", "quick", "heap"];
export const ALGO_NAMES = {
  bubble: "Bubble sort", insertion: "Insertion sort", selection: "Selection sort",
  merge: "Merge sort", quick: "Quick sort", heap: "Heap sort"
};

function* swap(a, i, j) {
  [a[i], a[j]] = [a[j], a[i]];
  yield { op: "swap", i, j };
}

export function* bubble(a) {
  const n = a.length;
  for (let end = n - 1; end > 0; end--) {
    let swapped = false;
    for (let j = 0; j < end; j++) {
      yield { op: "compare", i: j, j: j + 1 };
      if (a[j] > a[j + 1]) { yield* swap(a, j, j + 1); swapped = true; }
    }
    if (!swapped) { return; }        // a pass with no swaps: sorted
  }
}

export function* insertion(a) {
  for (let i = 1; i < a.length; i++) {
    for (let j = i; j > 0; j--) {
      yield { op: "compare", i: j - 1, j };
      if (a[j - 1] <= a[j]) { break; }
      yield* swap(a, j - 1, j);
    }
  }
}

export function* selection(a) {
  const n = a.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) {
      yield { op: "compare", i: min, j };
      if (a[j] < a[min]) { min = j; }
    }
    if (min !== i) { yield* swap(a, i, min); }
  }
}

export function* merge(a) {
  const tmp = a.slice();
  function* sort(lo, hi) {             // sorts a[lo, hi)
    if (hi - lo < 2) { return; }
    const mid = (lo + hi) >> 1;
    yield* sort(lo, mid);
    yield* sort(mid, hi);
    for (let k = lo; k < hi; k++) { tmp[k] = a[k]; }
    let i = lo, j = mid;
    for (let k = lo; k < hi; k++) {
      if (i < mid && j < hi) {
        yield { op: "compare", i, j };
        if (tmp[i] <= tmp[j]) { a[k] = tmp[i++]; } else { a[k] = tmp[j++]; }
      } else if (i < mid) { a[k] = tmp[i++]; } else { a[k] = tmp[j++]; }
      yield { op: "write", i: k };
    }
  }
  yield* sort(0, a.length);
}

/* Quick sort, Lomuto style, with the MIDDLE value as the pivot
   (so already-sorted input isn't its worst case). */
export function* quick(a) {
  function* sort(lo, hi) {             // sorts a[lo..hi]
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (mid !== hi) { yield* swap(a, mid, hi); }
      let store = lo;
      for (let i = lo; i < hi; i++) {
        yield { op: "compare", i, j: hi };
        if (a[i] < a[hi]) {
          if (i !== store) { yield* swap(a, i, store); }
          store++;
        }
      }
      if (store !== hi) { yield* swap(a, store, hi); }
      /* Recurse into the smaller side, loop on the bigger one. */
      if (store - lo < hi - store) { yield* sort(lo, store - 1); lo = store + 1; }
      else { yield* sort(store + 1, hi); hi = store - 1; }
    }
  }
  yield* sort(0, a.length - 1);
}

export function* heap(a) {
  const n = a.length;
  function* down(start, end) {         // sift a[start] down within a[0..end)
    let root = start;
    for (;;) {
      let child = 2 * root + 1;
      if (child >= end) { return; }
      if (child + 1 < end) {
        yield { op: "compare", i: child, j: child + 1 };
        if (a[child] < a[child + 1]) { child++; }
      }
      yield { op: "compare", i: root, j: child };
      if (a[root] >= a[child]) { return; }
      yield* swap(a, root, child);
      root = child;
    }
  }
  for (let s = (n >> 1) - 1; s >= 0; s--) { yield* down(s, n); }
  for (let end = n - 1; end > 0; end--) {
    yield* swap(a, 0, end);
    yield* down(0, end);
  }
}

const GENS = { bubble, insertion, selection, merge, quick, heap };

/* A lane: one algorithm working on its own copy of the bars. */
export function createLane(algo, values) {
  if (!GENS[algo]) { throw new Error(`Unknown sort: ${algo}`); }
  const a = values.slice();
  return { algo, a, gen: GENS[algo](a), compares: 0, swaps: 0, moves: 0, done: false, last: null, finishedAt: null };
}

/* One move. Returns the move ({op, i, j}) or null when sorted. */
export function tick(lane) {
  if (lane.done) { return null; }
  const r = lane.gen.next();
  if (r.done) { lane.done = true; lane.last = null; return null; }
  const m = r.value;
  if (m.op === "compare") { lane.compares++; } else { lane.swaps++; }
  lane.moves++;
  lane.last = m;
  return m;
}

/* Run a whole sort; handy for tests. */
export function sortWith(algo, values) {
  const lane = createLane(algo, values);
  while (tick(lane)) { /* keep going */ }
  return lane;
}

export const isSorted = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);

/* ---- starting orders (seeded) ----------------------------- */
export const ORDERS = ["random", "nearly", "reversed", "few"];
export const ORDER_NAMES = { random: "Random", nearly: "Nearly sorted", reversed: "Reversed", few: "Few unique" };

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function rnd() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* n bars with heights 1..n, in the chosen order. */
export function makeBars(n, order = "random", seed = 1) {
  const rnd = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i + 1);
  if (order === "reversed") { return a.reverse(); }
  if (order === "nearly") {
    /* Sorted, then a few neighbours swapped. */
    for (let k = 0; k < Math.max(1, Math.round(n / 12)); k++) {
      const i = Math.floor(rnd() * (n - 1));
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
    }
    return a;
  }
  if (order === "few") {
    const levels = 4;
    return shuffle(a.map((v) => Math.ceil((Math.ceil((v / n) * levels) / levels) * n)), rnd);
  }
  return shuffle(a, rnd);
}
