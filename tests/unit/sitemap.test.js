/* ============================================================
   sitemap.xml - unit tests

   - sitemap.xml matches items.json (run `npm run sitemap`
     after adding an item, or this fails)
   - the hub and every built item are listed; "soon" ones aren't
   ============================================================ */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildSitemap, readItems, SITEMAP, BASE } from "../../scripts/build-sitemap.js";

test("sitemap.xml is up to date with items.json (run `npm run sitemap`)", () => {
  assert.ok(fs.existsSync(SITEMAP), "sitemap.xml is missing: run `npm run sitemap`");
  const onDisk = fs.readFileSync(SITEMAP, "utf8").replace(/\r\n/g, "\n");
  assert.equal(onDisk, buildSitemap(readItems()), "sitemap.xml is out of date: run `npm run sitemap`");
});

test("lists the hub and built items, skips soon ones, dates from added", () => {
  const xml = buildSitemap([
    { slug: "alpha", added: "2026-01-02" },
    { slug: "beta", added: "2026-03-04" },
    { slug: "later", added: "2026-05-06", soon: true }
  ], "https://example.dev/wing/");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ["https://example.dev/wing/", "https://example.dev/wing/items/alpha/", "https://example.dev/wing/items/beta/"]);
  const mods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  assert.deepEqual(mods, ["2026-03-04", "2026-01-02", "2026-03-04"]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /);
});

test("the base address is this wing's public URL", () => {
  assert.match(BASE, /^https:\/\/[^/]+\/[a-z0-9-]+\/$/);
});
