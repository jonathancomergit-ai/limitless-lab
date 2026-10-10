# Teach a Robot

Watch a little robot learn by trial and error until it can balance a pole or escape a maze all by itself. That's reinforcement learning. For students, teachers and curious nerds.

| | |
|---|---|
| Slug | `teach-a-robot` (= the folder name) |
| Wing | Lab |
| Save | scene, the maze (walls + pits), and per scene: learning rate, discount, exploration, fade on/off, speed |
| Added | 2026-10-10 |

## How to use

| Do this | Phone | Keyboard |
|---|---|---|
| Train fast / stop | Train | T |
| Watch real time / stop | Watch | W |
| Pause / go on | Train or Watch | P |
| Forget everything (this scene) | Reset | R |
| Wall, pit, empty | Tap a square (drag to paint) | Focus the maze, arrows, then Enter |
| Poke the pole | Tap beside it, or the Poke buttons | Focus the stage, Left / Right |
| Scene | Maze / Cart-pole | 1 / 2 |
| Speed | Slider | [ and ] |
| Learning rate, discount, exploration | Sliders | Tab to them, arrows |

## Reduced motion

Starts paused, with Train ready. Nothing moves until you press Train or Watch.

## Smoke test

Stops it and resets the maze brain, adds a wall (tap on phone, keyboard cursor + Enter on desktop), presses Train (tap / T key), then checks runs went past 80 and the average reward of the last 20 runs beat the first 20 by 40+. Then flips to Cart-pole (tap / 2 key) and checks it trains and improves there too.

## Notes

| File | What's in it |
|---|---|
| `rl.js` | Q-learning, the maze rules, the cart-pole equations and binning. No DOM. |
| `tests/unit/teach-a-robot.test.js` | Shortest path on small mazes, the Q update by hand, one cart-pole step by hand, cart-pole learns to 1500+ steps, same seed = same run. |

- **Q-learning**: `Q(s, a) += alpha (r + gamma max Q(s', a') - Q(s, a))`, epsilon-greedy, ties broken at random. The table starts at 0.
- **Maze**: 8 x 8. Rewards: +20 goal, -20 pit (both end the run), -1 per move (bumping a wall too). A run gives up after 192 moves.
- **Cart-pole**: Barto, Sutton & Anderson (1983), the same equations and constants as OpenAI Gym, Euler at a fixed 0.02 s. Fails past 12 degrees or 2.4 m. Rewards: +1 per step, -100 for falling. A run stops at 2500 steps (50 s).
- **Bins**: cart position 6, cart speed 4, pole angle 6, pole spin 6 = 864 boxes.
- **Exploration fade**: x0.98 per run in the maze, x0.998 on the cart. Changing the maze or the exploration slider starts the fade again.
- Defaults: maze alpha 0.5, gamma 0.95, 1 run a frame (solves it in about 2 s). Cart alpha 0.2, gamma 0.99, 10 runs a frame (50 s balances after about 1,000 to 2,500 runs).
- With exploration at 0 the cart gets stuck: the table starts at 0 and every step pays +1, so the first thing it tries always looks best.
- Train runs whole practice runs inside an 8 ms budget per frame. The robot on screen is then a live test of its best guesses (no exploring, no learning). In Watch the robot on screen is the practice run itself.
- The pole is drawn 1.6x its real length so it's easy to see.
