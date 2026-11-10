# Plan 03: play-test fixes (draft for review, nothing built yet)

Requested by the user after playing the merged plan 02 build on 2026-11-10. Same rules as plan 02: Grok 4.7 implements, Claude Sonnet 5.5 reviews, tests and checks in real Chrome, one commit per slice, branch `update-03` cut from `main` (`cde3469`), no push, no deploy. Recovery tracker: `docs/plan03-status.md`.

## What the user said

1. Walking is not smooth. At the town entrance the avatar is blocked even where there is no wall; only the real wall pieces should block.
2. Enemies overlap too much; they should patrol different parts of their section. Every enemy visible on the player's screen must move or patrol, not only enemies in the player's own zone (bears on screen only move when the player gets close). Same when other players are in other areas.
3. Fighting: clicking an enemy should walk the avatar to it and attack. The click area is far too small; use the enemy's whole sprite as the click area.
4. Make the coin 40 percent smaller. Walking onto a coin picks it up; the pet picks it up if the player does not.

## Findings (read from the code, not guessed)

| # | Cause |
| --- | --- |
| 2a | `stepAggro` in `src/world/combat.ts` patrols a monster only when a player stands in that monster's zone (`watchedZones`). The camera shows parts of the next zone, so bears in the grey zone are visible from the green but frozen. Same for other players: only zones holding a player tick. |
| 2b | `patrolBeet` walks one straight line from the monster's own spawn point to the next spawn point of the zone. Neighbours share the same line, so they stack on top of each other. |
| 3 | `peelClick` in `src/client/input.ts` tests a circle of radius `height/2` around the monster's feet. The body is drawn above the feet, so clicking the body misses. Also, `attack` is only a swing: a far click does nothing, the player must walk next to the monster first. |
| 1a | Movement is a straight 120 px/s line. The first solid wall on the way stops the avatar dead (no sliding, no path). The south gate is only about 39 px wide on a diagonal (444,574 to 410,593) and sits next to a solid post, so a normal approach clips a wall end and stops. The cemetery gate (317,229 to 365,217) is 49 px wide. |
| 1b | Walking is stepped by the 100 ms server tick and snapshot, so on screen it can look steppy. To be measured in slice 1 before changing (client smoothing between snapshots is the likely fix). |
| 4 | The ground coin is drawn at 40 px (`COIN_SRC`). Only the owner's pet collects it (`stepPickups` in `src/world/pets.ts`). |

## Changes

### 1. Smooth walking and open gates
- Measure first: a script walks the avatar through both gates from many angles and records where it stops (the evidence goes in the tracker).
- Gates: walking toward a point on the other side of a gate routes through the gate's middle (a waypoint), and a step that clips a wall end slides along the wall instead of stopping. Only solid wall segments block. Wall data does not change except where the measurement proves a gap is too narrow.
- Smooth motion: the client interpolates the avatar (and monsters, other players) between snapshots at display rate, with no change to server speed (120 px/s).
- Tests: crossing tests for each gate from both sides at several angles; a unit test of the interpolation; a Chrome check that records positions per frame.

### 2. Patrol: spread out, and everything on screen moves
- **Watched zones:** a zone ticks and patrols when a player is in it or the zone's area is within the player's view (view box plus a margin). The rule lives in one place (rules) and is used by the server tick. Other players in other zones keep their zones alive the same way.
- **Own patch per monster:** each monster gets a home patch around its spawn point and patrols between 3 points inside that patch (a loop), at the patrol speed. Patches are sized from the zone's spawn spacing so they do not overlap; a test checks that no two patches in a zone intersect and that each patch lies inside its zone and clear of walls.
- **Existing storage:** monsters stored before this change read back with the nearest patch (same approach as the earlier patrol migration), no world reset.
- **Check the user asked for:** a test places a player in the green and asserts every monster whose zone is visible from there changes position over N ticks; a second test does the same with two players in different zones; and a Chrome script confirms on screen that the bears move while the player stands in the green.

### 3. Click an enemy: walk there and fight
- **Click area:** the whole drawn sprite rectangle (width from the image proportions, height from the sprite table, standing on the feet point), slightly padded. One shared function for drawing and hit testing so they cannot drift. A pointer over an enemy shows a hand cursor and a soft outline.
- **Engage:** clicking an enemy sets an attack target. The avatar walks to just inside melee reach (48 px) and keeps swinging on its attack clock until the enemy dies, the player clicks ground (cancels), or the enemy leaves the zone. Server-side: the `attack` message sets the target; the tick walks and swings; no client trickery. Wall rules still apply.
- Tests: far click walks and swings, ground click cancels, target dies, target in another zone refused, existing swing-clock rules unchanged.

### 4. Smaller coin, walk-on pickup
- Coin drawn at 24 px (40 percent smaller than 40). The gold "+N" stays readable.
- **Owner walks on it:** when the owner is within the coin's pickup distance (24 px, one place in `tables.ts`), the coin is picked up at once and credited in full. Otherwise the pet picks it up as now (2.25 s).
- Tests: walk-on credit, pet fallback still works, a coin is credited exactly once.

## Slices

| Slice | What | Check |
| --- | --- | --- |
| 0 | Branch `update-03`; measurement script for gates and walking (evidence only) | numbers in the tracker |
| 1 | Gate routing and wall sliding | unit tests + Chrome walk through both gates |
| 2 | Client interpolation (smooth walking) | unit test + Chrome frame positions |
| 3 | Watched zones by view (everything on screen patrols) | unit + two-player tests + Chrome |
| 4 | Own patrol patch per monster, no overlap | unit tests + Chrome screenshot |
| 5 | Sprite-rectangle click area, cursor, outline | unit tests + Chrome |
| 6 | Click to chase and fight (server attack target) | unit + worker tests + Chrome kill |
| 7 | Coin 24 px and walk-on pickup | unit + worker tests + Chrome |
| 8 | Full suite, screenshots, tracker, merge to `main` after the user's OK | all green |

## Assumptions to confirm (change any of them)

- Coin: 24 px; walk-on pickup distance 24 px; the owner's pickup is instant.
- "On screen" means the player's view plus a margin of about 150 px, so monsters just outside the edge are already moving when they walk in.
- Patrol patches use about 70 px radius or less, scaled down in crowded zones; the wolves, bears and skeletons keep their current speeds.
- Not in this plan: the shared account bag and seven-day coin expiry from the manager notes (still undecided, see `docs/plan02-status.md`).
