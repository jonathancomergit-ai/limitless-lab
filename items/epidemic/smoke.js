/* ============================================================
   Epidemic Sim - smoke test

   1. Pause. Tap a healthy dot (touch on phone, mouse on
      desktop): the sick count goes up by one.
   2. Play: days pass and the sick count changes on its own.
   3. Compare: a dashed "last run" curve is kept, a new run starts.
   4. Desktop: keyboard too. I makes a random dot sick.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { day: s.day, sick: s.sick, running: s.running, taps: s.taps, ghost: s.ghost, total: s.counts.total };
  });

  if ((await item()).running) { await page.locator("#play").click(); }
  await expect.poll(async () => (await item()).running).toBe(false);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  const before = await item();
  const dot = await page.evaluate(() => window.__item.healthyDot());
  if (isMobile) { await page.touchscreen.tap(dot.x, dot.y); } else { await page.mouse.click(dot.x, dot.y); }
  await expect.poll(async () => (await item()).taps).toBe(before.taps + 1);
  expect((await item()).sick).toBe(before.sick + 1);

  /* Run it: days pass and the sick count moves by itself. */
  const mid = await item();
  await page.locator("#play").click();
  await expect.poll(async () => (await item()).day, { timeout: 6000 }).toBeGreaterThan(mid.day + 3);
  await expect.poll(async () => (await item()).sick, { timeout: 6000 }).not.toBe(mid.sick);
  await expect(page.locator("#sick")).not.toHaveText("0");

  await page.locator("#compare").click();
  await expect.poll(async () => (await item()).ghost).not.toBeNull();
  await expect(page.locator("#compare")).toHaveAttribute("aria-pressed", "true");

  if (!isMobile) {
    const t0 = (await item()).taps;
    await page.keyboard.press("i");
    await expect.poll(async () => (await item()).taps).toBe(t0 + 1);
  }
}
