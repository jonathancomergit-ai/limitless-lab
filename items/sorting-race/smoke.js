/* ============================================================
   Sorting Race - smoke test

   1. Four lanes, nothing moving yet: every counter is 0.
   2. Press Race! (a tap on phone, R on desktop): the compare
      counters go up in every lane.
   3. Top speed: the race finishes, every lane is sorted, and
      someone comes 1st.
   4. Desktop: 2 drops to two lanes.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => ({ lanes: window.__item.lanes, racing: window.__item.racing }));

  const start = await item();
  expect(start.lanes.length).toBe(4);
  expect(start.lanes.every((l) => l.compares === 0)).toBe(true);

  if (isMobile) {
    await page.locator("#run").tap();
  } else {
    await page.locator("#stage").focus();
    await page.keyboard.press("r");
  }
  await expect.poll(async () => (await item()).racing).toBe(true);
  await expect.poll(async () => Math.min(...(await item()).lanes.map((l) => l.compares))).toBeGreaterThan(0);
  await expect(page.locator("#scores li").first()).toContainText("compares");

  await page.locator("#speed").fill("8");
  await expect.poll(async () => (await item()).lanes.every((l) => l.done), { timeout: 8000 }).toBe(true);
  expect((await item()).lanes.some((l) => l.place === 1)).toBe(true);
  await expect(page.locator("#run")).toHaveText("Race again");

  if (!isMobile) {
    await page.locator("#stage").focus();
    await page.keyboard.press("2");
    await expect.poll(async () => (await item()).lanes.length).toBe(2);
  }
}
