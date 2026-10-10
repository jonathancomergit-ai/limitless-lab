/* ============================================================
   Fluid Sim - smoke test

   1. Pause and Clear all: an empty, still tank (no dye, no speed).
   2. Drag across the tank (two fingers at once on the phone,
      the mouse on desktop): dye and speed both go up.
      Phone: two streams were counted.
   3. Play: time moves on and the ink is still there.
   4. Desktop: keyboard too. Arrows stir (more pushes), 2 + Space
      + arrows + Space draws a wall, V shows the arrows.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { t: s.t, dye: s.dye, speed: s.speed, stirs: s.stirs, streams: s.streams, walls: s.walls, tool: s.tool, running: s.running };
  });

  /* 1. Paused, empty tank. */
  if ((await item()).running) { await page.locator("#play").click(); }
  await expect.poll(async () => (await item()).running).toBe(false);
  await page.locator("#clear-all").click();
  await expect.poll(async () => (await item()).dye).toBe(0);
  expect((await item()).speed).toBe(0);

  /* 2. Stir. Clicking may have scrolled the page: bring the tank back. */
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const box = await page.locator("#stage").boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];

  if (isMobile) {
    /* Playwright has no touch-drag helper: send real touch events, two fingers. */
    const cdp = await page.context().newCDPSession(page);
    const fingers = (k) => [
      { x: at(0.2 + 0.06 * k, 0.3)[0], y: at(0.2, 0.3)[1], id: 1 },
      { x: at(0.8 - 0.06 * k, 0.7)[0], y: at(0.8, 0.7)[1], id: 2 }
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(0) });
    for (let k = 1; k <= 8; k++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(k) });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(...at(0.2, 0.5));
    await page.mouse.down();
    await page.mouse.move(...at(0.8, 0.45), { steps: 10 });
    await page.mouse.up();
  }

  await expect.poll(async () => (await item()).dye).toBeGreaterThan(1);
  expect((await item()).speed).toBeGreaterThan(0.05);
  if (isMobile) { expect((await item()).streams).toBeGreaterThanOrEqual(2); }

  /* 3. Run it: time moves on, the ink is still there. */
  const mid = await item();
  await page.locator("#play").click();
  await expect.poll(async () => (await item()).t, { timeout: 5000 }).toBeGreaterThan(mid.t + 0.3);
  expect((await item()).dye).toBeGreaterThan(0.5);

  if (!isMobile) {
    /* 4. Keyboard. */
    const s0 = (await item()).stirs;
    await page.locator("#stage").focus();
    for (let i = 0; i < 4; i++) { await page.keyboard.press("ArrowRight"); }
    await expect.poll(async () => (await item()).stirs).toBeGreaterThanOrEqual(s0 + 4);

    await page.keyboard.press("2");
    await expect.poll(async () => (await item()).tool).toBe("wall");
    await page.keyboard.press("Space");
    for (let i = 0; i < 5; i++) { await page.keyboard.press("ArrowDown"); }
    await page.keyboard.press("Space");
    await expect.poll(async () => (await item()).walls).toBeGreaterThan(0);

    await page.keyboard.press("v");
    await expect(page.locator("#arrows")).toHaveAttribute("aria-pressed", "true");
  }
}
