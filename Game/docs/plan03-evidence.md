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

## Slice 2 after-check (real Chrome)
Draw calls were counted in the page during a 3.5 s walk: about 52 painted frames per second, gap between frames median 14.8 ms (p95 20.2, max 27.4). Before the change the page repainted only when a snapshot arrived (about 10 per second, positions jumping 12 to 24 px). Unit tests prove the per-frame step is even and never exceeds 1.25 x speed x dt. The six gate walks still pass with the new camera (clicks map correctly). Tests: 382 pass.

## Slices 3-4 after-check (real server, same measurement as before)
Player in the green at (800,330), 12 s: 11 monsters on screen, all 11 moved (before: 5 of 12; all 7 bears moved 0 px, now the 5 visible bears moved 17 to 22 px). Closest same-zone pair: 56 px (before 15 px). Tests: 397 pass.

## Slices 5-7 after-check (real Chrome + Opus validation of slice 6)
- Click area: from 69 px (wolf) and 106 px (bear) away, clicking the HEAD walked the avatar to the monster and killed it (1.1 s and 2.3 s). Opus: head, chest and legs clicks all engaged; a click 12 px outside the padded rectangle was a ground move; hover shows the hand cursor and a rounded outline (screenshots in the scratchpad `opus/` folder).
- Opus validation of slice 6: first verdict FAIL (a chase resumed after a reconnect, plus three low findings); all four fixed in `488ff98`; re-validation PASS (22/22 tests, reconnect scenario shows no resumed chase).
- Coin: pet pickup 2.28 s after the drop; walk-on pickup 0.48 s; purse 0 to 4 each time; no coin left on the ground. Coin drawn 24 px. Tests: 422 pass.

## Slices 9-10 after-check (real Chrome) and regression run
- Shared bag (two avatars of one account, two windows): avatar one bought a Short sword, avatar two saw it and wore it by drag, avatar one's Bag showed it greyed "WORN BY BORAN" and a click did nothing; after avatar two unequipped, avatar one could wear it. Screenshot: scratchpad `shared-bag-A.png`.
- Opus validation of slice 9: first pass FAIL (two quick equips from one avatar could leave a copy stuck as worn; 5 of 5 tries in Chrome). Fix: bag actions queued one at a time in the room; a regression test fails without the queue and passes with it.
- Coin expiry (real server, real Chrome): an avatar with lots of 9 coins (8 days old), 6 (2 days) and 4 (1 day) rejoined with 10 coins; the Bag said "Oldest 6 coins expire in 5 days." Tests: coin-expiry (5), migration 0005, coin-lots unit (6), plus 442 total passing.
- Regression run in real Chrome, `docs/plan03-tools/regression.mjs`: 15 of 15 pass (password rule, generic sign-in error, account creation, two avatars and no third, delete needs a second click and reverts, zoom slider and its remembered value, Bag open/Esc/Close, HUD data, three-dot bubble opens the shop, Esc closes it, reload keeps the session).
