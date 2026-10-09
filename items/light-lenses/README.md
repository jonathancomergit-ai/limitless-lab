# Light & Lenses

Drag lenses, mirrors and prisms around and watch light bend, focus and split into a rainbow.

| | |
|---|---|
| Slug | `light-lenses` (= the folder name) |
| Wing | Lab |
| Save | the layout: the light (type, place, angle) and up to 12 pieces |
| Added | 2026-10-09 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Pick a piece (or the light) | Tap it | N = next (on the bench) |
| Move it | Drag it | Arrows (Shift = faster) |
| Turn it | Drag its round handle, or Turn buttons | Q / E (Shift = finer) |
| Remove it | Remove button | Delete |
| Add a piece | Six add buttons | Tab, Enter |
| Change the light | Red laser / White laser / Lamp beam | L |
| Scenes | Rainbow, Lenses, Trapped light, Mirrors | Tab, Enter |

- Picking a piece shows: its name, focal length (lenses and the curved mirror), and **angle in / angle out** where the main ray first meets it. A dashed line marks the surface normal.
- White light also shows the violet and red exit angles.

## Reduced motion

- Nothing animates. The bench only redraws when you change something, so nothing needs to change.

## Smoke test

- Loads the Lenses scene.
- Drags the convex lens (touch on phone, mouse on desktop). The lens moves and the ray checksum changes.
- The readout names the lens and shows angles.
- Desktop: N picks the concave lens, E turns it, and the rays change again.

## Notes

| File | What's in it |
|---|---|
| `optics.js` | Snell's law, reflection, TIR, piece shapes (segments + exact arcs), ray tracing, focal length, scenes. No DOM. |
| `tests/unit/light-lenses.test.js` | Snell angles, critical angle, mirror angles, dispersion, lensmaker check, block shift, scenes. |

- Glass index: Cauchy's formula, n = 1.5 + 0.008 / λ² (λ in µm). n is about 1.548 for violet and 1.518 for red. The spread is a bit bigger than real crown glass, so the rainbow is easy to see.
- Lens faces are exact circle arcs, so you can see real spherical aberration. Outer rays focus a little short of F.
- Focal length is **measured** by tracing a thin ray parallel to the axis. A unit test checks it against the thick-lens lensmaker's equation.
- No partial reflections: at glass, a ray either refracts or totally reflects.
- The bench is about 600 "world units" across the short side of the screen. A resize stretches the layout to fit.
- There's no frame loop, because nothing moves on its own.
