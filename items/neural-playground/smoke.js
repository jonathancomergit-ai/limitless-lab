/* ============================================================
   Neural Net Playground - smoke test

   1. Reset the weights, so the loss starts high.
   2. Add a dot (tap on phone, keyboard cursor on desktop).
   3. Make sure it's playing.
   4. Check the dot count went up and the loss went down.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { epoch: s.epoch, loss: s.loss, dots: s.dots, running: s.running };
  });

  /* Start from a fresh, untrained network. */
  if (await page.evaluate(() => window.__item.running)) { await page.locator("#play").click(); }
  await page.locator("#reset").click();
  const before = await item();
  expect(before.epoch).toBe(0);

  /* Add a blue dot near the top-left corner. */
  await page.locator("#pick-blue").click();
  if (isMobile) {
    const box = await page.locator("#stage").boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.12, box.y + box.height * 0.12);
  } else {
    await page.locator("#stage").focus();
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Shift+ArrowLeft"); }
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Shift+ArrowUp"); }
    await page.keyboard.press("Enter");
  }
  await expect.poll(async () => (await item()).dots).toBe(before.dots + 1);
  const start = (await item()).loss;

  /* Play: by tap on phone, by the P key on desktop. */
  if (isMobile) { await page.locator("#play").tap(); } else { await page.keyboard.press("p"); }
  await expect.poll(async () => (await item()).running).toBe(true);
  await expect.poll(async () => (await item()).epoch, { timeout: 5000 }).toBeGreaterThan(30);
  await expect.poll(async () => (await item()).loss, { timeout: 5000 }).toBeLessThan(start * 0.7);
  await expect(page.locator("#play")).toHaveText("Pause");
}
