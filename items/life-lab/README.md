# Life Lab

Draw some cells, hit play and watch patterns grow, crawl and explode. Then invent your own rules. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `life-lab` (= the folder name) |
| Wing | Lab |
| Save | the board (as RLE), generation, rule, speed, draw/erase |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Draw / erase cells | Tap or drag | Arrows move, Space flips a cell (on the board) |
| Draw or erase mode | Buttons | D / E |
| Play / Pause | Play button | P |
| One step | Step button | N |
| Random / Clear | Buttons | R / X |
| Speed | Slider | Tab + arrow keys |
| Patterns | Buttons | Tab, Enter |
| Rules | Tick the 0-8 boxes, or a rule preset | Tab, Space |

## Reduced motion

- Starts paused, with a Play button.
- Default speed is 3 generations a second (not 10).

## Smoke test

- Pauses and clears the board.
- Draws 3 cells: taps on phone, a mouse drag on desktop. Population goes up.
- Presses Step: generation goes up by 1.
- Desktop: arrows + Space flip a cell, N steps again.
- Presses Play: generations keep going.

## Notes

| File | What's in it |
|---|---|
| `life.js` | Step function (wrapping edges), rule parser, patterns, RLE read/write, resize. No DOM. |
| `tests/unit/life-lab.test.js` | Blinker, glider, wrapping, rule parser, HighLife, Seeds, pulsar period, gun, RLE, seeds, resize. |

- Rules use B/S notation: `B3/S23` = born with 3, survives with 2 or 3.
- Rule presets: Conway `B3/S23`, HighLife `B36/S23`, Seeds `B2/S`, Day & Night `B3678/S34678`.
- Cells are 7-11 px, so the 36-wide glider gun fits a 360 px phone. At most 14,000 cells.
- The board wraps (a torus). Resizing keeps the pattern centred and crops what doesn't fit.
- Saves use the standard Life RLE text (`bo$2bo$3o!` is a glider), so it's tiny.
