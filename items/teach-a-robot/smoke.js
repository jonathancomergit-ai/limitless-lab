/* ============================================================
   Teach a Robot - smoke test

   1. Stop it and Reset the maze brain, so it starts knowing nothing.
   2. Add a wall (tap on phone, keyboard cursor on desktop).
   3. Press Train (tap on phone, T key on desktop).
   4. Check runs went up and the average reward got better.
   5. Flip to Cart-pole and check it trains there too.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return {
      scene: s.scene, mode: s.mode, running: s.running, episodes: s.episodes,
      firstAvg: s.firstAvg, recentAvg: s.recentAvg, walls: s.walls
    };
  });

  /* Start from a stopped, empty brain on the maze. */
  expect((await item()).scene).toBe("maze");
  if ((await item()).mode !== "off") { await page.locator(".tr-run .btn[aria-pressed='true']").click(); }
  await expect.poll(async () => (await item()).running).toBe(false);
  await page.locator("#reset").click();
  const before = await item();
  expect(before.episodes).toBe(0);

  /* Wall off the top-right square (a dead end, so the way stays open). */
  if (isMobile) {
    const box = await page.locator("#stage").boundingBox();
    const cell = await page.evaluate(() => {
      const st = document.getElementById("stage").getBoundingClientRect();
      const room = Math.min(st.width - 20, st.height - 46 - 10);
      const k = Math.floor(room / 8);
      return { x: Math.round((st.width - k * 8) / 2) + 7.5 * k, y: Math.round(46 + (st.height - 46 - 10 - k * 8) / 2) + 0.5 * k };
    });
    await page.touchscreen.tap(box.x + cell.x, box.y + cell.y);
  } else {
    await page.locator("#stage").focus();
    for (let i = 0; i < 7; i++) { await page.keyboard.press("ArrowRight"); }
    await page.keyboard.press("Enter");
  }
  await expect.poll(async () => (await item()).walls).toBe(before.walls + 1);

  /* Train. */
  if (isMobile) { await page.locator("#train").tap(); } else { await page.keyboard.press("t"); }
  await expect.poll(async () => (await item()).mode).toBe("train");
  await expect(page.locator("#train")).toHaveText("Stop");
  await expect.poll(async () => (await item()).episodes, { timeout: 8000 }).toBeGreaterThan(80);
  await expect.poll(async () => {
    const s = await item();
    return s.recentAvg - s.firstAvg;
  }, { timeout: 8000 }).toBeGreaterThan(40);

  /* Cart-pole learns too: runs go up and it balances longer. */
  if (isMobile) { await page.locator("[data-scene='cart']").tap(); } else { await page.keyboard.press("2"); }
  await expect.poll(async () => (await item()).scene).toBe("cart");
  await expect.poll(async () => (await item()).episodes, { timeout: 8000 }).toBeGreaterThan(200);
  await expect.poll(async () => {
    const s = await item();
    return s.recentAvg - s.firstAvg;
  }, { timeout: 10000 }).toBeGreaterThan(50);
}
