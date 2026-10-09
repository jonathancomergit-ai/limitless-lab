/* ============================================================
   Gravity Sandbox - smoke test

   1. Throw a body: a real touch drag on phone, a mouse drag on
      desktop, out in empty space. The body count goes up.
   2. Time moves on.
   3. Desktop: Enter on space throws another into orbit, and
      the minus key zooms out.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { t: s.t, count: s.count, zoom: s.zoom, running: s.running };
  });

  if (!(await item()).running) { await page.locator("#play").click(); }
  const before = await item();
  const box = await page.locator("#stage").boundingBox();
  /* Top-left corner area: empty space on every preset. */
  const from = [box.x + box.width * 0.12, box.y + box.height * 0.15];
  const to = [from[0] + 50, from[1] + 30];

  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }]
    });
    await touch("touchStart", ...from);
    for (let i = 1; i <= 6; i++) { await touch("touchMove", from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6); }
    await touch("touchEnd", ...to);
  } else {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    await page.mouse.up();
  }

  await expect.poll(async () => (await item()).count).toBe(before.count + 1);
  await expect.poll(async () => (await item()).t, { timeout: 5000 }).toBeGreaterThan(before.t + 0.5);
  await expect(page.locator("#bodies")).toHaveText(String(before.count + 1));

  if (!isMobile) {
    const n = (await item()).count;
    await page.locator("#stage").focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await item()).count).toBe(n + 1);
    const z = (await item()).zoom;
    await page.keyboard.press("-");
    await expect.poll(async () => (await item()).zoom).toBeLessThan(z);
  }
}
