/* ============================================================
   Ripple Tank - smoke test

   1. Pause, so only our actions change the water.
   2. Tap the water (touch on phone, mouse on desktop): the
      drop count goes up and the wave grid changes.
   3. Play: time moves on and the water keeps changing.
   4. Desktop: keyboard too. 2 = Wall tool, Space = pen down,
      arrows draw: the wall count goes up. 1 + Space = a drop.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { t: s.t, checksum: s.checksum, drops: s.drops, walls: s.walls, tool: s.tool, running: s.running };
  });

  if ((await item()).running) { await page.locator("#play").click(); }
  await expect.poll(async () => (await item()).running).toBe(false);

  /* Clicking Play may have scrolled the page: bring the tank back. */
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const before = await item();
  const box = await page.locator("#stage").boundingBox();
  const x = box.x + box.width * 0.7, y = box.y + box.height * 0.4;
  if (isMobile) { await page.touchscreen.tap(x, y); } else { await page.mouse.click(x, y); }

  await expect.poll(async () => (await item()).drops).toBe(before.drops + 1);
  expect((await item()).checksum).not.toBe(before.checksum);

  /* Run it: time advances and the waves move. */
  const mid = await item();
  await page.locator("#play").click();
  await expect.poll(async () => (await item()).t, { timeout: 5000 }).toBeGreaterThan(mid.t + 60);
  expect((await item()).checksum).not.toBe(mid.checksum);

  if (!isMobile) {
    const w0 = (await item()).walls;
    await page.locator("#stage").focus();
    await page.keyboard.press("2");
    await expect.poll(async () => (await item()).tool).toBe("wall");
    await page.keyboard.press("Space");
    for (let i = 0; i < 6; i++) { await page.keyboard.press("ArrowDown"); }
    await page.keyboard.press("Space");
    await expect.poll(async () => (await item()).walls).toBeGreaterThan(w0);

    await page.keyboard.press("1");
    const d0 = (await item()).drops;
    await page.keyboard.press("Space");
    await expect.poll(async () => (await item()).drops).toBe(d0 + 1);
  }
}
