/* ============================================================
   Predator & Prey - smoke test

   1. Pause. Tap the field (touch on phone, mouse on desktop):
      rabbits are dropped, the rabbit count goes up.
   2. Play: days pass and the populations change by themselves.
   3. Equations mode on: the maths run starts and keeps pace.
   4. A preset button sets the sliders.
   5. Desktop: keyboard too. F drops foxes, S changes speed.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { day: s.day, ...s.counts, running: s.running, drops: s.drops, eq: s.equations, settings: s.settings, speed: s.speed };
  });

  if ((await item()).running) { await page.locator("#play").click(); }
  await expect.poll(async () => (await item()).running).toBe(false);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  /* 1. Tap the field: rabbits appear. */
  const before = await item();
  const spot = await page.evaluate(() => window.__item.fieldPoint());
  if (isMobile) { await page.touchscreen.tap(spot.x, spot.y); } else { await page.mouse.click(spot.x, spot.y); }
  await expect.poll(async () => (await item()).drops).toBe(before.drops + 1);
  expect((await item()).rabbits).toBeGreaterThan(before.rabbits);

  /* 2. Play: time goes on and the numbers move by themselves. */
  const mid = await item();
  await page.locator("#play").click();
  await expect.poll(async () => (await item()).day, { timeout: 8000 }).toBeGreaterThan(mid.day + 20);
  const later = await item();
  expect(later.rabbits !== mid.rabbits || later.foxes !== mid.foxes).toBe(true);
  await expect(page.locator("#day")).not.toHaveText("0");

  /* 3. Equations mode: the Lotka-Volterra run starts and advances. */
  await page.locator("#equations").click();
  await expect(page.locator("#equations")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await item()).eq?.points ?? 0, { timeout: 6000 }).toBeGreaterThan(5);

  /* 4. A preset sets the sliders. */
  await page.locator("[data-preset='crash']").click();
  await expect.poll(async () => (await item()).settings.foxHunger).toBe(30);
  await expect(page.locator("#foxHunger")).toHaveValue("30");

  /* 5. Desktop: the keyboard does it too. */
  if (!isMobile) {
    const d0 = (await item()).drops;
    await page.locator("#stage").focus();
    await page.keyboard.press("f");
    await expect.poll(async () => (await item()).drops).toBe(d0 + 1);
    const s0 = (await item()).speed;
    await page.keyboard.press("s");
    await expect.poll(async () => (await item()).speed).not.toBe(s0);
  }
}
