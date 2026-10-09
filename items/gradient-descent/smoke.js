/* ============================================================
   Gradient Descent Hill - smoke test

   1. Drop the balls on the hillside: a tap on phone, a click
      on desktop. The race must restart from there.
   2. Let it run: the step counter goes up and every ball's
      loss (height) goes DOWN from where it was dropped.
   3. Desktop: keyboard too. Arrows + Enter on the map drop the
      balls somewhere new; ] raises the learning rate.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { steps: s.steps, startLoss: s.startLoss, balls: s.balls, lr: s.lr, running: s.running };
  });

  /* Drop high up on the hillside, near the top-right corner. */
  const box = await page.locator("#stage").boundingBox();
  const x = box.x + box.width * 0.85, y = box.y + box.height * 0.15;
  if (isMobile) { await page.touchscreen.tap(x, y); } else { await page.mouse.click(x, y); }

  await expect.poll(async () => (await item()).running).toBe(true);
  const start = await item();
  expect(start.balls.length).toBe(3);
  expect(start.startLoss).toBeGreaterThan(1);

  /* It rolls downhill. */
  await expect.poll(async () => (await item()).steps, { timeout: 5000 }).toBeGreaterThan(20);
  const later = await item();
  for (const b of later.balls) {
    expect(b.loss, `${b.kind} went downhill`).toBeLessThan(later.startLoss);
  }
  await expect(page.locator("#steps")).not.toHaveText("0");

  if (!isMobile) {
    /* Keyboard: a new drop from the cursor, then a bigger learning rate. */
    const before = (await item()).startLoss;
    await page.locator("#stage").focus();
    for (let i = 0; i < 6; i++) { await page.keyboard.press("ArrowLeft"); }
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await item()).startLoss).not.toBe(before);
    const lr = (await item()).lr;
    await page.keyboard.press("BracketRight");
    await expect.poll(async () => (await item()).lr).toBeGreaterThan(lr);
  }
}
