/* ============================================================
   Boids Flocking - smoke test

   1. Let it run: time moves on and the birds actually fly.
   2. Change a slider (cohesion to 0): a tap at the left end of
      the slider on phone, Home on desktop. The setting applies.
   3. Tap / click the sky: a predator appears.
   4. Desktop: V shows one bird's view, C clears the predator.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { t: s.t, travelled: s.travelled, params: s.params, predators: s.predators, count: s.count, running: s.running };
  });

  /* 1. It runs, and the birds move. */
  if (!(await item()).running) { await page.locator("#play").click(); }
  const start = await item();
  expect(start.count).toBeGreaterThanOrEqual(50);
  await expect.poll(async () => (await item()).t, { timeout: 5000 }).toBeGreaterThan(start.t + 0.5);
  expect((await item()).travelled).toBeGreaterThan(start.travelled + 10);

  /* 2. A slider. */
  const slider = page.locator("#cohesion");
  if (isMobile) {
    await slider.scrollIntoViewIfNeeded();
    const b = await slider.boundingBox();
    await page.touchscreen.tap(b.x + 1, b.y + b.height / 2);
  } else {
    await slider.focus();
    await page.keyboard.press("Home");
  }
  await expect.poll(async () => (await item()).params.cohesion).toBe(0);
  await expect(page.locator("#cohesion-out")).toHaveText("0.0");
  const t1 = (await item()).t;
  await expect.poll(async () => (await item()).t).toBeGreaterThan(t1);

  /* 3. A predator. */
  const box = await page.locator("#stage").boundingBox();
  if (isMobile) {
    await page.locator("#stage").scrollIntoViewIfNeeded();
    const s = await page.locator("#stage").boundingBox();
    await page.touchscreen.tap(s.x + s.width / 2, s.y + s.height / 2);
  } else {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect.poll(async () => (await item()).predators).toBe(1);

  /* 4. Keyboard. */
  if (!isMobile) {
    await page.keyboard.press("v");
    await expect(page.locator("#vision-toggle")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("c");
    await expect.poll(async () => (await item()).predators).toBe(0);
  }
}
