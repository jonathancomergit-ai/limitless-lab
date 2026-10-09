# Fractal Zoom

Dive into the Mandelbrot set. Zoom forever into shapes that never repeat, then jump to matching Julia sets. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `fractal-zoom` (= the folder name) |
| Wing | Lab |
| Save | current view, Mandelbrot or Julia mode, Julia point, detail level, bookmarks |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Zoom in | Pinch out, or double-tap | `+` (or the mouse wheel) |
| Zoom out | Pinch in | `-` |
| Move around | Drag | Arrows on the stage (Shift = further) |
| Julia set | Julia mode, then tap a spot | `J` (uses the centre cross) |
| Back to Mandelbrot | Back button | `J` |
| Bookmark | Bookmark button | `B` |
| Start again | Reset | `0` |
| Detail | Slider | Tab + arrow keys |

## Reduced motion

- Nothing moves by itself, so the only change: zooms **jump** to the new view instead of gliding.

## Smoke test

- Waits for the first sharp picture from the workers.
- Zooms in: real double-tap on phone, the `+` key on desktop.
- Checks the zoom level went up (over ×1.9) and a new sharp picture was rendered.
- Desktop also checks an arrow pans and `J` opens a Julia set that renders.

## Notes

| File | What's in it |
|---|---|
| `mandel.js` | Escape-time maths, smooth value, Julia, view maths, tiles, colour index. No DOM. |
| `worker.js` | Module worker: renders and colours one tile at a time. |
| `tests/unit/fractal-zoom.test.js` | Inside / outside points, smooth value formula and continuity, Julia, zoom maths, tiles. |

- Smooth value: `nu = n + 1 - log2(ln|z|)` with escape radius 256.
- The main cardioid and period-2 bulb are skipped (known inside).
- Worker pool: up to 3 on phones, 6 on desktop. 128 px tiles, middle first.
- Two passes per view: blocky (1 sample per 8×8), then sharp. Old jobs are dropped when the view changes.
- While you pinch or drag, the last picture is stretched to fit; new renders start at most ~8 times a second.
- Iterations = detail × (1 + log10(zoom) / 2.5)^1.5, capped at 50,000.
- Plain 64-bit floats: the picture goes blocky past about 10^13×, and the page says so. Max zoom is 2×10^14.
- Phones render at up to 1.5× pixel density to keep it quick.
