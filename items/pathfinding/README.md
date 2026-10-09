# Pathfinding Race

Draw walls and watch A*, Dijkstra and breadth-first search race to the goal. It's how game characters find their way.

| | |
|---|---|
| Slug | `pathfinding` (= the folder name) |
| Wing | Lab |
| Save | the grid (walls + mud), start, goal, preset, tool, view, speed |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Draw walls / mud | Pick a tool, drag (start on a wall to rub it out) | 1 / 2 / 3 pick, arrows move, Space paints (on the grid) |
| Move start / goal | Drag S or G | S or G at the cursor |
| Race | Race! button | R |
| Clear walls | Button | X |
| All 4 / one at a time | Buttons | Tab, Enter |
| Presets, speed | Buttons, slider | Tab |

## Reduced motion

- Nothing moves until you press Race!.
- The race replays at 20 steps/s by default (not 80).

## Smoke test

- Loads the Empty preset at top speed, switches to one big view.
- Drags a wall (touch on phone, mouse on desktop). Wall count goes up.
- Presses Race!: every algorithm finds a path, A* and Dijkstra have the same cost, and the table shows A*'s path length.
- Desktop: `1`, arrows, Space paints a wall; `R` races again.

## Notes

| File | What's in it |
|---|---|
| `search.js` | A*, Dijkstra, BFS and greedy (one function), a binary heap, presets, maze maker, save format. No DOM. |
| `tests/unit/pathfinding.test.js` | Paths found / none when walled off, A* = Dijkstra cost (with and without mud), greedy trap, maze, save. |

- 4 moves (no diagonals). Open = cost 1, **mud = cost 5**, walls block.
- A* uses Manhattan distance. It never overestimates, so A* is always as cheap as Dijkstra.
- BFS counts cells, not cost, so it wades through mud.
- Greedy keeps the first route it finds to each cell, so its path can be worse.
- Each algorithm runs to the end at once. The page replays its steps at the same rate for all four, so it's a fair race.
- "Steps" = cells taken off the to-do list (stale copies included). "Explored" = different cells looked at.
- Trap preset: a cup facing the start, and the goal inside mud with a dry lane from the far side.
- Grid: square cells 18-30 px, at least 20 × 12. A resize resamples the grid.
