/* ============================================================
   Fourier Draw - smoke test

   1. Draw a loop on the stage: a real touch drag on the phone,
      a mouse drag on desktop.
   2. Check a new shape was made, with more than 0 circles.
   3. Check the trace is running (time moves on).
   4. Desktop: the arrow keys change the circle count.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { circles: s.circles, t: s.t, drawn: s.drawn, running: s.running };
  });
  const before = await item();

  const box = await page.locator("#stage").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) * 0.3;
  const loop = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [cx + r * Math.cos(a) * (1 + 0.3 * Math.sin(3 * a)), cy + r * Math.sin(a)];
  });

  if (isMobile) {
    /* Playwright has no touch-drag helper, so send real touch events. */
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, [x, y]) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }]
    });
    await touch("touchStart", loop[0]);
    for (const p of loop.slice(1)) { await touch("touchMove", p); }
    await touch("touchEnd", loop[loop.length - 1]);
  } else {
    await page.mouse.move(...loop[0]);
    await page.mouse.down();
    for (const p of loop.slice(1)) { await page.mouse.move(...p, { steps: 2 }); }
    await page.mouse.up();
  }

  await expect.poll(async () => (await item()).drawn).toBe(before.drawn + 1);
  expect((await item()).circles).toBeGreaterThan(0);

  if (!(await item()).running) { await page.locator("#play").click(); }
  const t0 = (await item()).t;
  await expect.poll(async () => (await item()).t).toBeGreaterThan(t0 + 0.005);

  if (!isMobile) {
    const n = (await item()).circles;
    await page.locator("#stage").focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await item()).circles).toBe(n - 1);
    await expect(page.locator("#circles-out")).toHaveText(String(n - 1));
  }
}
