/* ============================================================
   sitemap.xml, from items.json

     npm run sitemap

   Lists the hub and every built item (not "soon" ones), so
   search engines can find them. Each item's lastmod is its
   "added" date; the hub's is the newest of those.

   Run it after adding an item. tests/unit/sitemap.test.js fails
   while sitemap.xml is out of date with items.json.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../site.config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITEMAP = path.join(ROOT, "sitemap.xml");

/* This wing's public address, e.g. https://jonjoe1001.dev/limitless-lab/ */
export const BASE = config.wings.find((w) => w.wing === config.wing).url;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildSitemap(items, base = BASE) {
  const built = items.filter((i) => !i.soon);
  const newest = built.map((i) => i.added).sort().pop();
  const url = (loc, lastmod) => [
    "  <url>",
    `    <loc>${esc(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${esc(lastmod)}</lastmod>`] : []),
    "  </url>"
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...url(base, newest),
    ...built.flatMap((i) => url(`${base}items/${i.slug}/`, i.added)),
    "</urlset>",
    ""
  ].join("\n");
}

export function readItems() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "items.json"), "utf8"));
}

/* Run directly (npm run sitemap): write the file. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(SITEMAP, buildSitemap(readItems()));
  console.log(`sitemap.xml: ${readItems().filter((i) => !i.soon).length} items + the hub`);
}
