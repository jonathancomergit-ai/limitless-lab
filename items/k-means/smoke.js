/* ============================================================
   k-Means Clustering - smoke test

   1. Load the 5 blobs set: 200 dots, step count 0.
   2. Tap the field (touch on phone, mouse on desktop): one more dot.
   3. Press Step: one move (an assign).
   4. Press Play: the step count keeps going up until it settles.
   5. Desktop: keyboard too. + makes k bigger, S steps.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { steps: s.steps, points: s.points, done: s.done, k: s.k, playing: s.playing, elbow: s.elbow };
  });

  await page.locator("[data-preset='blobs5']").click();
  await expect.poll(async () => (await item()).points).toBe(200);
  expect((await item()).steps).toBe(0);
  await expect.poll(async () => (await item()).elbow.length).toBe(8);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const box = await page.locator("#stage").boundingBox();
  const x = box.x + box.width * 0.5, y = box.y + box.height * 0.1;
  if (isMobile) { await page.touchscreen.tap(x, y); } else { await page.mouse.click(x, y); }
  await expect.poll(async () => (await item()).points).toBe(201);

  await page.locator("#step").click();
  await expect.poll(async () => (await item()).steps).toBe(1);
  await expect(page.locator("#phase")).toHaveText("Next: move");

  await page.locator("#play").click();
  await expect.poll(async () => (await item()).steps, { timeout: 5000 }).toBeGreaterThan(2);

  if (!isMobile) {
    await page.locator("#play").click();          // pause
    const k0 = (await item()).k;
    await page.locator("#stage").focus();
    await page.keyboard.press("Equal");
    await expect.poll(async () => (await item()).k).toBe(k0 + 1);
    expect((await item()).steps).toBe(0);
    await page.keyboard.press("s");
    await expect.poll(async () => (await item()).steps).toBe(1);
  }
}
