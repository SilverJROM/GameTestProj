# Plan 03 slice 0: before-evidence (measured 2026-11-10 on branch `update-03`, base `main` at the plan 02 merge)

Tools: `docs/plan03-tools/measure-gates.mjs`, `docs/plan03-tools/measure-patrol.mjs`. Pictures: `docs/mockups/screenshots/plan03-before-gate-south.png`, `plan03-before-gate-cemetery.png` (red = solid wall data, green = open gate data, drawn over the map).

| Problem | Measured result |
| --- | --- |
| Town entrance | In the picture the dirt road opens between the left tower and the right tower, about 50 map px wide. The open (green) data covers only the right part (about 39 px); the solid post fills the left part up to the left tower. A walk that aims at the left part of the real opening stops at the post. A straight walk through the green segment itself is never stopped (510 of 510 pass). So the stop happens at the left edge of the real opening and when the walk approaches at an angle, not in the middle. The wall also stops the avatar dead with no slide. |
| Cemetery gate | Data matches the picture (green gap between the two stone piers). 850 of 850 straight walks through it pass. Only the no-slide stop applies. |
| Bears frozen | Player in the green at (800,330), 12 s: 12 monsters on screen, 7 bears in the grey zone moved 0 px (all frozen); 5 wolves moved 60 px. Cause: patrol only runs in zones holding a player. |
| Overlap | Closest same-zone monsters: 15, 15, 59, 59, 67 px apart. Patrol lines run from each monster's spawn to the next spawn, so neighbours share lines. |
| Click area | Click test is a circle of radius height/2 around the feet. Sprite heights: wolf 34, bear 48, skeleton 58. A click on the body centre is exactly on the circle edge; a click on the head or upper body misses. |
| Coin | Ground coin drawn at 40 px. |

Smoothness (frame by frame) is measured in slice 2 once the interpolation is in, with the same script style.

## Slice 1 after-check (real Chrome, 6 walks)
All six walks reached their target within 1 px: inside to outside through the south gate from the right part and from the left part of the opening, a far routed walk, outside to inside, and town to cemetery road. Server tests: 367 pass. Observed for slice 2: sampled positions jump up to 24 px between 100 ms samples (12 px per tick, snapshots arrive in pairs), so on-screen motion is steppy.
