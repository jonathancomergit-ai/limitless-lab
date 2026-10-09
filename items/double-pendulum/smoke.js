/* ============================================================
   Double Pendulum Chaos - smoke test

   1. Drag the lower bob to a new start (touch on phone, mouse
      on desktop) and check the start angles changed.
   2. Let it run: time must move on.
   3. The first two pendulums' angles must differ (they start
      0.001 degree apart and the gap only grows).
   4. Desktop: an arrow key on the stage nudges the start.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { t: s.t, angles: s.angles, start: s.start, running: s.running };
  });

  /* Where is the lower bob on screen right now? Pause first so it holds still. */
  if ((await item()).running) { await page.locator("#play").click(); }
  const box = await page.locator("#stage").boundingBox();
  const before = await item();
  const [ox, oy] = await page.evaluate(() => window.__item.bob);
  const bx = box.x + ox, by = box.y + oy;
  const scale = Math.min(box.width, box.height) / 4;
  const to = [box.x + box.width / 2 + scale * 1.4, box.y + box.height / 2 + scale * 0.2];

  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }]
    });
    await touch("touchStart", bx, by);
    for (let i = 1; i <= 8; i++) { await touch("touchMove", bx + ((to[0] - bx) * i) / 8, by + ((to[1] - by) * i) / 8); }
    await touch("touchEnd", ...to);
  } else {
    await page.mouse.move(bx, by);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 8 });
    await page.mouse.up();
  }
  /* If the two bobs overlap, the drag may pick up the top one instead:
     either way, the start must have moved. */
  await expect.poll(async () => JSON.stringify((await item()).start)).not.toBe(JSON.stringify(before.start));
  expect((await item()).t).toBe(0);

  /* Run it. */
  await page.locator("#play").click();
  await expect.poll(async () => (await item()).running).toBe(true);
  await expect.poll(async () => (await item()).t, { timeout: 5000 }).toBeGreaterThan(1);
  const { angles } = await item();
  expect(Math.abs(angles[0] - angles[1])).toBeGreaterThan(0);

  if (!isMobile) {
    const s = (await item()).start[0];
    await page.locator("#stage").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await item()).start[0]).toBe(s + 5);
  }
}
