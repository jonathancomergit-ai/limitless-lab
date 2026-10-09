/* ============================================================
   Pathfinding Race - smoke test

   1. Empty grid, top speed.
   2. Draw a wall: drag with a finger on phone, the mouse on
      desktop. The wall count goes up.
   3. Press Race!: the A* row shows a path length, and every
      algorithm agrees there is a path.
   4. Desktop: keyboard too. Focus the grid, 1 = wall tool,
      Space paints a wall, R races again.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { walls: s.walls, phase: s.phase, races: s.races, results: s.results, grid: s.grid, start: s.start };
  });

  await page.locator("[data-preset='empty']").click();
  await page.locator("#speed").fill("9");
  await expect.poll(async () => (await item()).walls).toBe(0);

  /* Switch to one big view, so the drag lands on one grid. */
  await page.locator("[data-view='one']").click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const box = await page.locator("#stage").boundingBox();
  const x = box.x + box.width * 0.5;
  const y0 = box.y + box.height * 0.2, y1 = box.y + box.height * 0.45;
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, yy) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: yy }] });
    await touch("touchStart", y0);
    for (let k = 1; k <= 6; k++) { await touch("touchMove", y0 + ((y1 - y0) * k) / 6); }
    await touch("touchEnd", y1);
  } else {
    await page.mouse.move(x, y0);
    await page.mouse.down();
    await page.mouse.move(x, y1, { steps: 6 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await item()).walls).toBeGreaterThan(3);

  await page.locator("#run").click();
  await expect.poll(async () => (await item()).phase, { timeout: 8000 }).toBe("done");
  const r = (await item()).results;
  for (const a of ["astar", "dijkstra", "bfs", "greedy"]) { expect(r[a].found, a).toBe(true); }
  expect(r.astar.length).toBeGreaterThan(0);
  expect(r.astar.cost).toBe(r.dijkstra.cost);
  await expect(page.locator("#results tr").first().locator("td").nth(2)).toHaveText(String(r.astar.length));

  if (!isMobile) {
    const w0 = (await item()).walls;
    await page.locator("#stage").focus();
    await page.keyboard.press("1");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect.poll(async () => (await item()).walls).toBe(w0 + 1);
    const n = (await item()).races;
    await page.keyboard.press("r");
    await expect.poll(async () => (await item()).races).toBe(n + 1);
    await expect.poll(async () => (await item()).phase, { timeout: 8000 }).toBe("done");
  }
}
