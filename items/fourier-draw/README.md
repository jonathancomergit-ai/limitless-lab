# Fourier Draw

Draw any shape with your finger, then watch spinning circles redraw it. That's a Fourier series. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `fourier-draw` (= the folder name) |
| Wing | Lab |
| Save | the last drawing (or preset name), circles, speed, show-drawing |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Draw | Drag a finger | Drag the mouse, or pick a preset |
| Heart / Star / Music note | Preset buttons | 1 / 2 / 3 |
| Fewer / more circles | Circles slider | Left / Right on the stage (Shift = 16) |
| Slower / faster | Speed slider | Down / Up on the stage |
| Play / Pause | Pause button | P, or Space on the stage |

## Reduced motion

- Starts paused, with a Play button.
- Half speed.
- No fading trail: the whole trace stays still and solid.

## Smoke test

Draws a wobbly loop (real touch drag on phone, mouse drag on desktop), checks a new shape was made with more than 0 circles, checks time moves on (the trace is running). Desktop also checks the Left arrow removes a circle.

## Notes

| File | What's in it |
|---|---|
| `dft.js` | Resample to 256 even points, DFT, adding circles tip to tip, inverse DFT. No DOM. |
| `shapes.js` | Heart, star and music-note paths. |
| `tests/unit/fourier-draw.test.js` | DFT then inverse gives back the input; sorting; resampling. |

- Points are complex numbers x + iy. Circle k spins k times per trip; negative k spins backwards.
- Circles are sorted biggest first, so the slider always keeps the most important ones.
- "Match" = 1 − (RMS error ÷ RMS size of the drawing).
- A plain O(N²) DFT is plenty for 256 points (runs once per drawing).
