/* ============================================================
   Fractal Zoom - smoke test

   1. Wait for the first sharp picture.
   2. Zoom in: double-tap on phone, the + key on desktop.
   3. Check the zoom level went up and a NEW sharp picture was
      rendered (by the workers) for the new view.
   4. Desktop: an arrow key pans, and J opens a Julia set.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { zoom: s.zoom, renders: s.renders, drawing: s.drawing, view: s.view, mode: s.mode };
  });

  await expect.poll(async () => (await item()).renders, { timeout: 8000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await item()).drawing, { timeout: 8000 }).toBe(false);
  const before = await item();

  if (isMobile) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const box = await page.locator("#stage").boundingBox();
    const x = box.x + box.width * 0.4, y = box.y + box.height * 0.45;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(60);
    await page.touchscreen.tap(x, y);
  } else {
    await page.locator("#stage").focus();
    await page.keyboard.press("Equal");
  }

  await expect.poll(async () => (await item()).zoom, { timeout: 5000 }).toBeGreaterThan(before.zoom * 1.9);
  await expect.poll(async () => (await item()).renders, { timeout: 8000 }).toBeGreaterThan(before.renders);
  await expect.poll(async () => (await item()).drawing, { timeout: 8000 }).toBe(false);
  await expect(page.locator("#zoom")).not.toHaveText("×1.0");

  if (!isMobile) {
    const v = (await item()).view;
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await item()).view.cx).toBeGreaterThan(v.cx);
    await page.keyboard.press("KeyJ");
    await expect.poll(async () => (await item()).mode).toBe("julia");
    const r = (await item()).renders;
    await expect.poll(async () => (await item()).renders, { timeout: 8000 }).toBeGreaterThan(r);
  }
}
