/* ============================================================
   Teach a Robot - the learning, unit tested

   - Q-learning on a small maze finds the shortest path
   - it learns to go round a pit, not through it
   - one Q update matches the rule worked by hand
   - one cart-pole step matches values worked by hand
   - cart-pole binning and learning: it balances far longer
   - the same seed gives exactly the same run
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rng, createQ, qUpdate, exploreAt, parseMaze, defaultMaze, mazeMove, mazeEpisode,
  greedyRoute, shortestPath, cartStep, cartFailed, cartBin, cartEpisode, CART, CART_STATES,
  WALL, PIT
} from "../../items/teach-a-robot/rl.js";

function train(m, episodes, seed = 1) {
  const Q = createQ(m.w * m.h, 4);
  const rand = rng(seed);
  for (let e = 0; e < episodes; e++) {
    mazeEpisode(m, Q, { alpha: 0.5, gamma: 0.95, eps: exploreAt(1, e, { rate: 0.98 }) }, rand);
  }
  return Q;
}

/* ---- the maze -------------------------------------------- */

test("parseMaze reads walls, pits, start and goal", () => {
  const m = parseMaze(["S#", "OG"]);
  assert.equal(m.w, 2);
  assert.equal(m.h, 2);
  assert.deepEqual(m.cells, [0, WALL, PIT, 0]);
  assert.equal(m.start, 0);
  assert.equal(m.goal, 3);
});

test("moves: walls and edges bump back, pits and the goal end the run", () => {
  const m = parseMaze(["S#.", "O.G"]);
  assert.deepEqual(mazeMove(m, 0, 0), { s2: 0, r: -1, done: false, what: "bump" });   // edge
  assert.equal(mazeMove(m, 0, 1).what, "bump");                                         // wall
  assert.deepEqual(mazeMove(m, 0, 2), { s2: 3, r: -20, done: true, what: "pit" });
  assert.deepEqual(mazeMove(m, 4, 1), { s2: 5, r: 20, done: true, what: "goal" });
  assert.deepEqual(mazeMove(m, 4, 0), { s2: 4, r: -1, done: false, what: "bump" });  // wall above
});

test("Q-learning on a small maze finds the shortest path", () => {
  const m = parseMaze([
    "S...",
    ".##.",
    "...#",
    "#..G"
  ]);
  assert.equal(shortestPath(m), 6);
  for (const seed of [1, 2, 3]) {
    const route = greedyRoute(m, train(m, 300, seed));
    assert.equal(route[route.length - 1], m.goal, `seed ${seed}: reaches the goal`);
    assert.equal(route.length - 1, 6, `seed ${seed}: in the fewest moves`);
  }
});

test("it learns to go round a pit, not through it", () => {
  const m = parseMaze([
    "S.O.G",
    "....."
  ]);
  const route = greedyRoute(m, train(m, 300));
  assert.equal(route[route.length - 1], m.goal);
  assert.ok(!route.includes(2), "never steps in the pit");
  assert.equal(route.length - 1, shortestPath(m));
});

test("the default maze is solvable and gets solved in a few hundred runs", () => {
  const m = defaultMaze();
  assert.equal(shortestPath(m), 14);
  const route = greedyRoute(m, train(m, 300));
  assert.equal(route.length - 1, 14);
});

test("one Q update follows the rule: Q += alpha (r + gamma max Q' - Q)", () => {
  const Q = createQ(2, 2);
  Q.q.set([1, 0, 4, 2]);
  const err = qUpdate(Q, 0, 0, -1, 1, false, 0.5, 0.9);
  /* target = -1 + 0.9 * 4 = 2.6; error = 2.6 - 1 = 1.6; Q = 1 + 0.8 = 1.8 */
  assert.ok(Math.abs(err - 1.6) < 1e-12);
  assert.ok(Math.abs(Q.q[0] - 1.8) < 1e-12);
  /* At the end of a run there's no future: target = r. */
  qUpdate(Q, 0, 1, 10, 1, true, 0.5, 0.9);
  assert.equal(Q.q[1], 5);
});

test("exploration fades with the decay on, stays put with it off", () => {
  assert.equal(exploreAt(0.8, 0, { rate: 0.9 }), 0.8);
  assert.ok(Math.abs(exploreAt(0.8, 2, { rate: 0.9 }) - 0.648) < 1e-12);
  assert.equal(exploreAt(0.8, 50, { decay: false }), 0.8);
  assert.equal(exploreAt(0.5, 1000, { rate: 0.5, floor: 0.05 }), 0.05);
});

/* ---- cart-pole ------------------------------------------- */

test("one cart-pole step matches values worked by hand", () => {
  /* Upright and still, push right (10 N):
     temp   = 10 / 1.1                                = 9.090909...
     thAcc  = (0 - 9.0909) / (0.5 (4/3 - 0.1 / 1.1)) = -14.634146...
     xAcc   = 9.0909 - 0.05 (-14.6341) / 1.1          = 9.756098...
     Euler, tau = 0.02: positions don't move yet, speeds do. */
  const [x, xDot, th, thDot] = cartStep([0, 0, 0, 0], 1);
  assert.equal(x, 0);
  assert.equal(th, 0);
  assert.ok(Math.abs(xDot - 0.19512195) < 1e-7, `xDot ${xDot}`);
  assert.ok(Math.abs(thDot - -0.29268293) < 1e-7, `thDot ${thDot}`);

  /* Leaning 0.1 rad right, spinning 0.5 rad/s, rolling 1 m/s, push left:
     sin 0.1 = 0.0998334, cos 0.1 = 0.9950042
     temp   = (-10 + 0.05 x 0.25 x 0.0998334) / 1.1             = -9.0897746
     thAcc  = (9.8 x 0.0998334 + 0.9950042 x 9.0897746)
              / (0.5 (4/3 - 0.1 x 0.9900334 / 1.1))              = 16.122395
     xAcc   = -9.0897746 - 0.05 x 16.122395 x 0.9950042 / 1.1   = -9.8189376 */
  const got = cartStep([0.5, 1, 0.1, 0.5], 0);
  const want = [0.5 + 0.02 * 1, 1 + 0.02 * -9.8189376, 0.1 + 0.02 * 0.5, 0.5 + 0.02 * 16.122395];
  got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-6, `part ${i}: ${v} vs ${want[i]}`));
});

test("cart-pole fails past 12 degrees or off the track", () => {
  assert.equal(cartFailed([0, 0, 0.2, 0]), false);
  assert.equal(cartFailed([0, 0, 0.21, 0]), true);
  assert.equal(cartFailed([2.41, 0, 0, 0]), true);
  assert.equal(cartFailed([-2.3, 0, -0.1, 0]), false);
});

test("cart-pole bins cover every box exactly once", () => {
  assert.equal(CART_STATES, 864);
  const seen = new Set();
  const r = rng(5);
  for (let k = 0; k < 20000; k++) {
    const b = cartBin([(r() - 0.5) * 5, (r() - 0.5) * 3, (r() - 0.5) * 0.42, (r() - 0.5) * 4]);
    assert.ok(Number.isInteger(b) && b >= 0 && b < CART_STATES);
    seen.add(b);
  }
  assert.ok(seen.size > 800, `reached ${seen.size} boxes`);
});

test("cart-pole Q-learning goes from wobbling to long balances", () => {
  const Q = createQ(CART_STATES, 2);
  const rand = rng(1);
  const steps = [];
  for (let e = 0; e < 3000; e++) {
    steps.push(cartEpisode(Q, { alpha: 0.2, gamma: 0.99, eps: exploreAt(1, e, { rate: 0.998 }) }, rand).steps);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(steps.slice(0, 100)) < 150, "starts out falling fast");
  assert.ok(avg(steps.slice(-200)) > 1500, `ends up balancing: ${avg(steps.slice(-200))} steps`);
  assert.ok(steps.slice(-200).includes(CART.maxSteps), "some runs go the full 50 seconds");
});

test("the same seed gives exactly the same run", () => {
  const a = train(defaultMaze(), 50, 9), b = train(defaultMaze(), 50, 9);
  assert.deepEqual([...a.q], [...b.q]);
});
