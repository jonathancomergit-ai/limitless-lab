# Sorting Race

Bubble, insertion, merge and quick sort race on the same bars, with sound. See why some code is way faster.

| | |
|---|---|
| Slug | `sorting-race` (= the folder name) |
| Wing | Lab |
| Save | the four lane picks, lane count, starting order, bars, speed, sound on/off |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Race / Pause | Race! button | R |
| New bars | New bars | N |
| Sound on / off | Sound button | M |
| Number of lanes | 2 / 3 / 4 | 2 / 3 / 4 |
| Pick each lane's sort | Menus (6 sorts) | Tab, arrows |
| Starting order | Random, Nearly sorted, Reversed, Few unique | Tab, Enter |
| Bars, speed | Sliders | Tab + arrows |

- Each lane shows compares and swaps live. The score list under the stage shows the same numbers, plus places.
- Bars being compared turn amber; bars being swapped turn pink. Finished lanes turn cyan.

## Reduced motion

- No flashing colours on the bars. A small static mark under the two bars being looked at instead.
- Default speed is 30 moves/s (not 120).

## Smoke test

- Checks 4 lanes with zero counts.
- Starts the race (tap on phone, `R` on desktop). Every lane's compare count goes up.
- Top speed: every lane finishes, someone is 1st, the button says "Race again".
- Desktop: `2` drops to two lanes.

## Notes

| File | What's in it |
|---|---|
| `sorts.js` | Six sorts as step generators (compare / swap / write), lanes, starting orders. No DOM. |
| `tests/unit/sorting-race.test.js` | Every sort on random, sorted, reversed, duplicates, sizes 0-40; moves are real; known counts; fast vs slow. |

- **Fair race:** every lane makes the same number of moves per second. A move = 1 compare or 1 swap/write.
- Merge sort copies instead of swapping, so its second number is **writes**.
- Quick sort: Lomuto partition with the **middle** value as pivot, so sorted input isn't its worst case.
- Sound: Web Audio oscillators made in the browser. Nothing is downloaded. Off by default. Pitch = 180 + 900 × (bar height). At most one blip per lane every 45 ms.
- Browsers only allow sound after a tap, so a saved "sound on" waits for your first press.
