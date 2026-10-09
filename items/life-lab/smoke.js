/* ============================================================
   Life Lab - smoke test

   1. Pause, Clear: an empty board.
   2. Draw cells: drag on phone (touch), click on desktop.
      The population goes up.
   3. Press Step: the generation goes up by one.
   4. Desktop: keyboard too. Focus the board, Space flips a
      cell, N steps again.
   5. Play runs it on its own.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { gen: s.gen, pop: s.population, running: s.running };
  });

  if ((await item()).running) { await page.locator("#play").click(); }
  await expect.poll(async () => (await item()).running).toBe(false);
  await page.locator("#clear").click();
  await expect.poll(async () => (await item()).pop).toBe(0);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const box = await page.locator("#stage").boundingBox();
  const [cols, rows] = await page.evaluate(() => window.__item.grid);
  const cell = box.width / cols, cellH = box.height / rows;
  /* The middle of a cell near the centre, never a cell edge. */
  const cx = box.x + (Math.floor(cols / 2) + 0.5) * cell;
  const cy = box.y + (Math.floor(rows / 2) + 0.5) * cellH;

  if (isMobile) {
    /* Three taps in a row = a blinker. */
    for (const dx of [-1, 0, 1]) { await page.touchscreen.tap(cx + dx * cell, cy); }
  } else {
    await page.mouse.move(cx - cell, cy);
    await page.mouse.down();
    await page.mouse.move(cx + cell, cy, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await item()).pop).toBeGreaterThanOrEqual(3);

  const g0 = (await item()).gen;
  await page.locator("#step").click();
  await expect.poll(async () => (await item()).gen).toBe(g0 + 1);
  await expect(page.locator("#gen")).toHaveText(String(g0 + 1));

  if (!isMobile) {
    const p0 = (await item()).pop;
    await page.locator("#stage").focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect.poll(async () => (await item()).pop).toBe(p0 + 1);
    await page.keyboard.press("n");
    await expect.poll(async () => (await item()).gen).toBe(g0 + 2);
  }

  await page.locator("#play").click();
  await expect.poll(async () => (await item()).gen, { timeout: 5000 }).toBeGreaterThan(g0 + 4);
}
