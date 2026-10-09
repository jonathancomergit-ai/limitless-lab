# k-Means Clustering

Tap to drop dots and watch a computer sort them into groups by itself. Machine learning with no teacher.

| | |
|---|---|
| Slug | `k-means` (= the folder name) |
| Wing | Lab |
| Save | the dots (up to 1500), k, which set they came from |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Drop dots | Tap, or drag to spray | Arrows move, Space drops (on the field) |
| One move | Step | S |
| Run to the end | Play | P |
| New random start | New start | R |
| Fewer / more groups | k slider (2-8) | - / + |
| Load dots | 3 blobs, 5 blobs, Smiley, Uneven sizes | Tab, Enter |
| Clear | Clear | X |

- The field shows dots in group colours, **big diamond centres** with a dashed trail, and soft Voronoi regions (which centre is nearest).
- A line under the buttons says what the last move did.
- **Elbow chart:** the best settled spread for k = 1..8. The current k is highlighted.

## Reduced motion

- Nothing moves until you press Step or Play.
- Play is slower: 1.2 moves a second (not 3).

## Smoke test

- Loads 5 blobs (200 dots). The elbow chart fills in.
- Taps the field (touch / mouse): 201 dots.
- Step: step count 1, "Next: move".
- Play: the step count keeps rising.
- Desktop: `+` raises k (restarts at step 0), `S` steps.

## Notes

| File | What's in it |
|---|---|
| `kmeans.js` | Seeded k-means++ start, assign / move steps, spread, elbow, presets. No DOM. |
| `tests/unit/k-means.test.js` | 3 far blobs found (25 seeds), spread never rises, steps alternate, centres = means, seeding, odd cases, elbow, presets. |

- Dots live in a 1 × 1 square, so they fit any screen.
- **Spread** = sum of squared distances from each dot to its centre. Both moves can only lower it. That's why k-means always settles.
- It's settled when an assign changes nobody.
- A centre with no dots stays put.
- The elbow uses the best of 3 seeds for each k, so the curve is smooth.
- k-means can get stuck in a worse answer (try 5 blobs and press New start a few times). That's real, not a bug.
