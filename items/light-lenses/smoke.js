/* ============================================================
   Light & Lenses - smoke test

   1. Load the Lenses scene: a lamp beam and two lenses.
   2. Drag the convex lens (finger on phone, mouse on desktop):
      it moves and the ray paths change.
   3. Tap it: the readout names it and shows the angles.
   4. Desktop: keyboard too. N picks pieces, E turns one: the
      rays change again.
   ============================================================ */

export default async function smoke({ page, expect, isMobile }) {
  await expect(page.locator("#stage[data-ready]")).toHaveCount(1);
  const item = () => page.evaluate(() => {
    const s = window.__item;
    return { pieces: s.pieces, rays: s.rayChecksum, selected: s.selected, moves: s.moves, hits: s.hits };
  });

  await page.locator("[data-scene='focus']").click();
  await expect.poll(async () => (await item()).pieces.length).toBe(2);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const before = await item();
  expect(before.hits).toBeGreaterThan(0);

  const at = await page.evaluate(() => window.__item.screenOf(0));
  const to = { x: at.x + 30, y: at.y + 40 };
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [p] });
    await touch("touchStart", at);
    for (let k = 1; k <= 6; k++) { await touch("touchMove", { x: at.x + (30 * k) / 6, y: at.y + (40 * k) / 6 }); }
    await touch("touchEnd", to);
  } else {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  }

  await expect.poll(async () => (await item()).rays).not.toBe(before.rays);
  const after = await item();
  expect(after.selected).toBe(1);
  expect(after.pieces[0].x).not.toBe(before.pieces[0].x);
  await expect(page.locator("#sel-name")).toContainText("Convex lens");
  await expect(page.locator("#sel-angles")).toContainText("°");

  if (!isMobile) {
    await page.locator("#stage").focus();
    await page.keyboard.press("n");                 // -> concave lens
    await expect.poll(async () => (await item()).selected).toBe(2);
    const r0 = (await item()).rays;
    await page.keyboard.press("e");
    await page.keyboard.press("e");
    await expect.poll(async () => (await item()).rays).not.toBe(r0);
  }
}
