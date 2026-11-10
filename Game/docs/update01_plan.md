# Update plan: camera, walls, patrol, aggro, coin, login preview, health, damage numbers, blacksmith, inventory

This document is `docs/update01_plan.md`.

Status: **final, revised for the new art in `assets/README.md`.** Every mockup in `docs/mockups/` is approved. That includes the aggro glow behind the head, and the town picture where the blacksmith is the same height as the player and the player stands on the courtyard ground inside the walls. The play view uses `maps/world-ground.jpg` plus the overlays, so a character inside town is behind the near wall. No game code has been written for this update. Implementation starts after the server reset, when told to go.

This plan changes the rules in `docs/game_reqts.md` only where it says so below. Everything else in that document stays as it is. Map numbers are image pixels on `assets/maps/world-map-wide.jpg` (1280×720), x to the right, y down.

## Visual contract and testing

- The mockup page `docs/mockups/index.html` is the contract for how the new screens look. Approval pictures of that page are `docs/mockups/screenshots/approval-*.png`. The character select preview, the health bar, the zoomed view, the monster head glow, the coin and pet, the white and red damage numbers, the blacksmith and his thought bubble, the shop, and the inventory must match the approved shots.
- Google Chrome extension testing stays deferred until login to that extension works.
- Playwright is the test runner for this update. It drives the real local page in the Chrome already installed on this machine. It does not download Playwright's pinned Chrome for Testing. Launch is `chromium.launch({ channel: 'chrome', chromiumSandbox: true })`, which is the fix Playwright published on 3 Nov 2026: use stable Chrome, and turn the sandbox on. Before the update is handed back, Playwright saves one screenshot for each requested scenario under `docs/mockups/screenshots/`. The scenarios are: woman select, man select, zoomed town, health bar, a wall stop and a gate pass, patrol in the green while town is idle, aggro glow, coin drop with the pet, white damage on a monster, red damage on the player, the blacksmith and his thought bubble, the shop, and the inventory.
- The approval shots taken of the mockups are not a substitute for those later screenshots of the running game. They are the picture the implementation has to match.

## What changes

### 1. Camera

- The canvas no longer shows the whole map.
- The camera uses the local player's current zone (`place`). Each zone has its own box: the bounding box of its ring in `src/rules/regions.ts`.
- The view is 75 percent of that box's width and 75 percent of its height. It is centered on the player and clamped so it never goes past the map edge.

| Zone | Ring bounding box (x0, y0 – x1, y1) | Box size | View size (75%) |
| --- | --- | --- | --- |
| Town | 0, 130 – 650, 720 | 650 × 590 | 487.5 × 442.5 |
| Cemetery | 0, 0 – 556, 256 | 556 × 256 | 417 × 192 |
| Green | 380, 115 – 1280, 720 | 900 × 605 | 675 × 453.75 |
| Grey | 432, 0 – 1280, 530 | 848 × 530 | 636 × 397.5 |

- The picture fills the canvas. It is not stretched, and there are no dark side bars.
- The 75 percent box above is the target. Where that box is squarer than the 1280×720 canvas, the view widens until the canvas is full, still centered on the player and clamped to the map. In town that shows about 75 percent of the town's height and a bit more than 75 percent of its width. The player still cannot see the whole map, and walking reveals the rest of the zone.
- Sprites, coins, glows and damage numbers are drawn in map coordinates and go through the same camera.
- Clicks go back through the same camera. A canvas pixel, divided by the scale, plus the view's top-left corner, gives the map pixel. That map pixel goes to the existing click handling.
- When `place` changes, the camera switches to the new zone's box on the next frame.
- The other 25 percent of the zone stays off screen until the player walks toward it.
- The camera crops one stack. It does not draw `maps/world-map-wide.jpg` as the play picture. That file has the houses and walls painted in, so a sprite would sit on top of them. Coordinates in this plan were measured on that same 1280×720 frame. `maps/world-ground.jpg` is the same frame with the town buildings and the walls removed.

Draw order, from `assets/README.md`. The three overlays are 1280×720 and share the ground's origin. Empty pixels are transparent.

1. `maps/world-ground.jpg`
2. `overlays/town-behind.png` — houses and the far side of the town
3. Avatars, the blacksmith, pets, monsters, and coins, sorted by feet. A higher foot draws first. A lower foot draws in front.
4. `overlays/town-wall-near.png` — the near town wall and its gate. Draw this after anyone whose feet are inside the town. A character whose feet are south of the gate is drawn after this overlay, so they stand in front of that wall.
5. `overlays/cemetery-wall.png`, split the same way. Feet on the north side of the cemetery wall line draw before the overlay. Feet on the south side draw after it. The gap in the picture is the road gate.

Inside the square the character is in front of the houses and behind the near wall. That is the approved town picture: feet on the courtyard, not on the wall stones.

`houses/forge.png`, `houses/cottage.png`, and `houses/tall.png` are not placed on this map. The town buildings are already in `town-behind.png`. The blacksmith is the stand still at the painted forge.

These pictures have no collision. The wall check in the next section is still what stops a step. The uneven top of `town-wall-near.png`, and the bit of yard fence in that file, are paint. They are not a new wall line. `world-ground.jpg` still has a few trees where the town was removed. `town-behind.png` covers them.

### 2. Walls

- Movement checks the wall lines on the server. Each step a character takes in a tick is a short line segment. If that segment crosses a solid wall segment, the character stops at the wall: at the crossing point, moved back 1 px toward where they started. Their walk target is then cleared. There is no path finding. To get through, the player walks to the gate.
- The `move` message carries only a target. The server's step function is the only code that sets `x, y`, so this check lives there (`ripenFig` / `applyPear` in `src/world/core.ts`). The client never decides whether a position is legal.
- **Town wall:** every edge of `pearTownWalls` is solid except the road gate (coordinates below).
- **Cemetery wall:** a new solid line in `regions.ts` (coordinates below), open only at its road gate.
- Green and grey have no walls.
- Monsters use the same wall check on every step: chase, patrol and return. A monster step that would cross a wall or leave the monster's zone ring is not taken, so the monster stays where it is that tick.

### 3. Monster patrol

- Every monster remembers the index of the spawn point it appeared on (`spawnIndex`). A monster that respawns on a different point takes that point's index.
- Its patrol is the straight line between spawn point `i` and spawn point `(i + 1) mod n` of its zone's list. It walks back and forth along that line.
  - Each monster gets a different line because the start points differ.
  - Two runs with the same ticks give the same positions. No `Math.random` is used.
  - All 24 lines (9 green, 7 grey, 8 cemetery) were checked against the zone rings and lie fully inside their zones. A test keeps that true and also checks that no line crosses a wall.
- Patrol speed is a new constant, `monsterPatrolSpeedPxPerSec: 40`, next to the chase speed (90) in `tables.ts`.
- While a monster has a target, it chases exactly as it does now.
- When aggro ends, it walks at patrol speed back to the end of its patrol line that it was heading toward, then carries on patrolling. If a step home stays blocked for 1 second (10 ticks), the monster is put back on its own spawn point. This stops a monster from getting stuck against a wall corner.
- A monster never leaves its zone.
- Monsters are not computed when nobody is there to see them.
  - No connected player in the world: the room does not tick, patrol, chase, bite, or broadcast. An empty room costs nothing.
  - A player still on the login screen has not joined the world, so the monsters stay frozen.
  - When at least one player is in the world, only monsters in a zone that contains a connected player are stepped. The other zones stay exactly where they were. A player standing in town does not make the wolves, bears, or skeletons walk.
  - A monster that is chasing a connected player keeps being stepped until that chase ends, so a fight does not freeze at the edge of the view.
  - Monsters in the player's zone still walk when they are just outside the 75 percent camera. Otherwise a wolf that paced off the edge of the view would never come back. "On screen" here means a player is in that section, not a per-pixel visibility test.
- Patrol steps do not cause a storage write on their own. The monster list is still saved on the same events as today.
- The walk is stills, not a film strip. While a monster is moving it swaps `walk-1`, `walk-2`, `walk-3`, then `walk-2` again, about 320 ms a frame. `wolf/walk-1.png` is the same picture as `wolf/step.png`. Facing stays to the right. The sprite flips when the path goes left. Idle is `stand.png`. A wolf attack holds `bite`. A bear attack holds `swipe` or `charge`. A skeleton attack holds `strike` or `thrust`. An attack still holds for about 420 ms. The player's attack is still `attack-1` then `attack-2`.
- Frames in one folder are not the same pixel size. Scale that character's stills to one height and anchor the feet. The skeleton stills are much taller than the wolf and the bear, so a skeleton is not scaled down to a wolf.
- Existing tests that put a player next to a spawn point and attack will need to read the monster's current position from the snapshot, because the monster will have moved.

### 4. Aggro glow and attack rate

- The monster snapshot gains `aggro: boolean`, which is true while the monster has a target.
  - Wolves and bears only get a target from a hit, so for them this means "has been hit and still has a target".
  - A skeleton gets one by being near a player, with no hit needed.
- While `aggro` is true, the client draws a red glow behind the monster's head. The head art stays on top, so the face is readable and the red shows around the head as its background. The glow is not painted over the sprite. This glow is separate from the duel glow on players.
- The single `monsterSwingSeconds: 2` is removed. Each monster row gains `attackGapSeconds`:

| Monster | Attacks per second | `attackGapSeconds` |
| --- | --- | --- |
| Wolf | 1 | 1.00 |
| Bear | 1.25 | 0.80 |
| Skeleton | 4/3 | 0.75 |

- The player's 0.45 s gap stays.
- **The first bite may land on the same tick the monster is already in reach.** A monster with no previous bite bites as soon as it starts a tick in reach. As today, it does not bite on a tick in which it moved.
- The room ticks every 100 ms, so a 0.75 s gap would always round up to 0.8 s. To keep the real rate, a bite moves the stored bite time forward by exactly the gap, not to "now".
  - The skeleton therefore bites at 0, 0.8, 1.5, 2.3, 3.0 s: five bites in 3 seconds, which averages 0.75 s.
  - If a bite is a full tick or more late (for example after chasing), the stored time resets to now, so no extra bites are saved up.
  - Wolf (1.0 s) and bear (0.8 s) land exactly on ticks.

### 5. Coin picture

- During implementation, one coin still is generated and saved as `Game/assets/items/coin.png`, on the same magenta field as the other art so the existing magenta removal applies. It is not made in this planning step.
- The ground coin is drawn from that file. It is no longer cropped from the axolotl pickup still. The crop (`coinCrop`) stays only if something else still uses it.
- The coin appears at the corpse, which is the monster's position at the moment of the killing hit. `hurtBeet` already does this. With chase and patrol, that is where the monster actually was, not its spawn point.
- The owner's pet moves from the owner to that coin over the existing 4 second pickup. Then the coin leaves the ground and the purse gains one. Another player's pet still cannot take it. All of this already exists in `pets.ts` and `view.ts`. This update keeps it and pins it with a test.

### 6. Login preview

- A preview picture is added to the login form under the Woman/Man choice.
- On load, Woman is checked and the woman warrior stand still (`avatars/warrior-f/stand.png`) is shown. Choosing Man shows `avatars/warrior-m/stand.png`. Choosing Woman again switches back.
- The picture changes on the radio's change event, before the name is submitted.
- The magenta field is removed with the same function the game uses (`removeMagenta`).

### 7. Health

- `strike`, the XP costs, monster attack, and the level-up rule all stay unchanged. On level-up, current health gains the base HP that was added, then clamps to the new maximum.
- Only the base HP column changes (arithmetic below):

| Level | Old base HP | New base HP |
| --- | --- | --- |
| 1 | 24 | 70 |
| 2 | 32 | 80 |
| 3 | 40 | 92 |
| 4 | 52 | 106 |
| 5 | 64 | 122 |
| 6 | 80 | 140 |

- Armor amounts (+12, +24, +40) and prices stay. They are now a smaller share of maximum health. That is accepted unless the human wants to change it.

### 8. Numbers on screen

- **Health readout:** the local player's current and maximum health are always shown during play, in screen space at the top-left. It is a bar that fills with the current share of maximum, plus the numbers (for example `54 / 70`). The values come from `character.hp` and `character.maxHp` in each welcome and snapshot message. The shape and colors are whatever the approved mockup shows.
- **Damage numbers:** the world snapshot gains `hits`, the damage dealt since the last broadcast. Each hit has:
  - `id`: a serial, so a client draws each hit once
  - `targetKind`: `'monster'` or `'player'`
  - `targetId`
  - `amount`
  - `x`, `y`: where the target stood when hit, so a number still shows on a monster that died from that hit
- The room collects hits from all three sources:
  - player attacks on monsters
  - monster bites on players
  - duel hits on players
- The broadcast for that tick sends the same `hits` list to every socket, then clears it. A welcome message carries an empty list.
- The client draws a white number on a monster and a red number on a player. The number floats up and fades over about 1 second. Only that animation timing is decided on the client. The amount always comes from the server.
- Every connected player gets the list, so a nearby player sees the same numbers. A number outside a player's view is simply off screen for them.

### 9. Blacksmith, shop, and inventory

- The blacksmith stand (`avatars/blacksmith/stand.png`) is drawn at the town forge. He is part of the town view and is sorted with the other avatars. His drawn height matches the player sprite. He stands on the ground in front of the forge. The near wall overlay then covers his feet if they are inside the town, so he is not painted on top of the wall.
- The player stands on walkable ground. In town that is the courtyard. The approved picture is `docs/mockups/screenshots/approval-town-smith.png`. That shot was composed on `world-map-wide.jpg` before the overlays existed. The running game keeps that placement and uses the overlay order above, so the player is in front of the houses and behind the near wall.
- A thought bubble sits by his head and reads "Armor and weapons". Clicking that bubble opens the shop. The stock, prices, and rules stay the ones in `docs/game_reqts.md`: one sword and one armor, a purchase replaces the worn piece, there is no refund, and a purse that cannot cover the price changes nothing. A row the player cannot afford is shown as unavailable.
- A Bag button on the play view opens the inventory. The inventory shows the coin count, the worn sword, the worn armor, and the player's level, health, strike, and experience. Empty slots show that nothing is worn.
- The pictures for this are `town-smith`, `shop-buy`, and `inventory` on the mockup page. The shop example purse is 48 coins, so the great sword (70) and plate (64) are the rows that cannot be bought. The inventory example is a level 2 character wearing the short sword and leather: health 54 / 92, strike 7, experience 4 / 15, coins 14.

## What stays

- Zones, zone rings, spawn points, monster counts (7), respawn (5 s), monster HP, attack, XP and coins.
- Player strike, the 0.45 s player gap, the XP ladder (10, 15, 20, 30, 40; total 115), and the level cap of 6.
- Shop items and prices. The forge is still the only shop. It now opens from the blacksmith's thought bubble. Fountain behaviour. Death and respawn in town.
- Duel rules and payout.
- Skeleton wake radius (120 px, cemetery only). The rule that wolves and bears aggro only after a hit. Aggro clearing when the target leaves the zone or dies.
- Coin ownership, one coin per 4 s pickup, other pets cannot take coins.
- Login rules, name rules, sessions and cookies, and what persists.
- The simulation still reads the same tables as play. Its printed numbers change because the tables change.

## HP arithmetic

Fight model, given: a level 1 character with no armor stands in reach and trades blows with wolves.

- Wolf: 20 HP, attack 5. Level 1 strike: 4.
- Hits to kill: 20 / 4 = **5**.
- Player hits land at 0, 0.45, 0.90, 1.35 and 1.80 s, so **1.8 s** from the first hit to the last.
- Wolf bites at the new gap of 1.0 s: at **0** and **1.0** s. The next bite would be at 2.0 s, but the wolf died at 1.8 s.
- Damage per wolf: 2 × 5 = **10**.
- Five wolves in a row with no fountain: 5 × 10 = **50**.

Requirement: at least a quarter of maximum health is left, so `H − 50 ≥ H / 4`, which gives `0.75 H ≥ 50`, so `H ≥ 66.7`. The smallest whole value is 67.

Proposal: **level 1 = 70.** After five wolves: 70 − 50 = **20** left, and a quarter of 70 is 17.5, so the test passes.

- The fifth kill gives 5 × 2 = 10 XP, which is exactly level 2. Health then rises by 80 − 70 = 10, to 30 / 80.
- Five wolves still pay 5 × 4 = 20 coins, which covers the short sword (18).

Ladder: **70, 80, 92, 106, 122, 140.**

- Each step is larger than the one before (+10, +12, +14, +16, +18), so the ladder is strictly increasing. No level is below the one before it, and level 2 (80) is above level 1 (70).

Bears can still force a fountain trip. This is accepted unless the human says otherwise.

- Level 2, no armor: strike 5, max 80. A bear has 45 HP, so it takes 9 hits, 8 × 0.45 = 3.6 s.
- The bear bites at 0, 0.8, 1.6, 2.4 and 3.2 s, so 5 bites × 9 = 45 damage per bear.
- Three bears are 135 damage, which is more than 80. Two bears (90) are already too many at level 2 with no armor.
- With chain (+24, max 104), two bears (90) can be done, three cannot.

## Gate coordinates (measured on the picture)

Measured by eye on zoomed crops of `world-map-wide.jpg`. A test checks each gate by walking straight through it.

### Town gate

- This is the south road gate, between the low tower west of the road and the square tower east of it.
- It lies on the existing `pearTownWalls` edge from (444, 574) to (400, 598).
- **Open segment: (444, 574) to (410, 593).** About 39 px wide. The road passes through around (425, 584).
- The rest of that edge, (410, 593) to (400, 598), stays solid. Every other edge of `pearTownWalls` is solid.

### Cemetery gate

- This is the road opening between the square tower at the east end of the south wall and the start of the east wall.
- **Open segment: (317, 229) to (365, 217).** About 49 px wide. The road passes through around (340, 222).

### Cemetery wall line (new, solid)

- West part, from the left map edge to the gate: (0, 145), (30, 190), (50, 210), (90, 235), (150, 250), (225, 245), (295, 235), (317, 229).
- East part, from the gate to where the wall ends in the pines: (365, 217), (400, 200), (450, 187), (500, 180), (530, 160), (542, 140), (542, 105).
- The painted wall stops at (542, 105). From there to the top edge is pine trees, not wall. The plan closes that stretch with a solid line along the existing cemetery ring edge: (542, 105), (548, 95), (520, 60), (470, 30), (432, 0). This keeps the road gate the only way into the cemetery.
- The wall line and the zone ring were traced separately. Near the left edge the wall sits up to about 15 px below the ring's edge, so a thin strip of town-zone grass lies inside the wall there. Skeletons do not wake on a player standing in that strip. This is left as it is.

## Slices

Each slice is small and ends with all existing tests passing (`npm test`). The check listed is the new or changed test that proves the slice.

### Routing by level

- L1 starts with Haiku 5.5. Grok 4.7 tests it. A failed check moves that same slice to L2, then to L3. It does not start over from a blank tree.
- L2 starts with Grok 4.7. Sonnet 5.5 tests it. A failed check moves that same slice to L3.
- L3 starts with Sonnet 5.5. Opus 5.5 tests it. An L3 slice does not pass through Haiku or Grok first.
- The author of a slice does not test it.
- A group that contains any L3 slice is integrated by Opus 5.5. Any other group is integrated by Sonnet 5.5.
- A slice is committed only after its check passes and the tester has read the diff.

1. **HP ladder.**
   - Level: L1 — a table, stored numbers and a document paragraph, with a check that is a direct assertion.
   - Files: `src/rules/tables.ts`, `test/unit/tables.test.ts`, `test/unit/logic.test.ts`, `test/unit/sim.test.ts`, `docs/game_reqts.md` (character table).
   - Check: a unit test plays the five-wolf model through the rule functions from a fresh level 1 character. It ends at 20 / 70 before the level-up, which is at least a quarter of maximum. It also asserts the base HP column is strictly increasing.

2. **Monster attack rates.**
   - Level: L3 — a 0.75 s gap must advance the stored bite time by exactly 0.75 s on a 100 ms tick, so the skeleton bites land at 0, 800, 1500, 2300 and 3000 ms, a tick schedule that must not snap to the tick.
   - Files: `src/rules/tables.ts` (add `attackGapSeconds` per row, remove `monsterSwingSeconds`), `src/world/combat.ts` (`stepAggro` bite timing), `src/sim/sim.ts`, `test/worker/aggro.test.ts`, `test/worker/skeleton.test.ts`, `test/integration/hunt.test.ts`, `docs/game_reqts.md` (monster section).
   - Check: a worker test on the stepped clock with a monster already in reach. A wolf bites at 0 and 1000 ms. A bear bites at 0, 800 and 1600 ms. A skeleton bites at 0, 800, 1500, 2300 and 3000 ms. The first bite is on the first tick.

3. **Wall data.**
   - Level: L2 — wall segments and one crossing function, proved by one unit test.
   - Files: `src/rules/regions.ts` (town gate segment, cemetery wall line, cemetery gate segment, one function that returns the first solid-wall crossing of a segment or null), `test/unit/regions.test.ts`.
   - Check: a unit test. A segment across the town wall away from the gate is blocked. A segment through (425, 584) is not. The same holds for the cemetery at (340, 222). Every spawn point is on its own zone's side of every wall.

4. **Walls stop players.**
   - Level: L2 — one collision rule, stopping a walk at a wall, proved by one worker test.
   - Files: `src/world/core.ts` (step function), `test/worker/move.test.ts`.
   - Check: a worker test. A player in the courtyard is sent to a point east of the town wall and ends next to the wall, still inside `pearTownWalls`. Sent out through the gate, they reach the target. The same is checked for the cemetery wall.

5. **Monster patrol.**
   - Level: L3 — patrol, idle zones and old tests that assumed monsters stand still must all agree across tables, monsters, combat and room.
   - Files: `src/rules/tables.ts` (patrol speed), `src/world/monsters.ts` (`spawnIndex` and leg direction, with stored monsters that lack them read back with defaults), `src/world/combat.ts` (patrol, return, wall and zone check on every monster step), `src/world/room.ts` (tick only for zones a connected player is in), `test/worker/monsters.test.ts`, plus the attack, hunt and skeleton tests that assumed monsters stand still.
   - Check: a test steps the room 10,000 ticks twice from the same start with a player in the green. The wolf positions match exactly, stay inside the green, and never cross a wall. With no player connected, the same number of ticks moves nothing. With a player only in town, the wolves, bears, and skeletons do not move.

6. **Aggro glow.**
   - Level: L2 — one aggro flag and its glow, proved by one worker test and one view test.
   - Files: `src/protocol.ts` (`aggro` on the monster snapshot), `src/world/core.ts` (snapshot), `src/client/view.ts` (head glow), `test/worker/aggro.test.ts`, `test/unit/view.test.ts`.
   - Check: a worker test. An unhit wolf has `aggro: false` and has `true` after a hit. A skeleton has `true` as soon as a player is within 120 px in the cemetery, with no hit. The view test draws the head glow only for `aggro: true`, and the glow is behind the head art.

7. **Camera and map layers.**
   - Level: L3 — camera scale, click mapping and draw order split by which side of a wall the feet are on must agree across camera, main and view.
   - Files: new `src/client/camera.ts` (pure functions: view box for a zone and player, map-to-canvas, canvas-to-map), `src/client/main.ts` and `src/client/view.ts` (draw `world-ground.jpg`, then `town-behind.png`, then sprites by feet, then `town-wall-near.png` and `cemetery-wall.png` split by which side of the wall the feet are on), `test/unit/camera.test.ts`, `test/unit/view.test.ts`.
   - Check: a unit test. For a player in each zone, the view covers at least 75 percent of that zone's box on one axis, fills the 1280×720 canvas with one scale, stays centered on the player, and clamps at the map edges. A canvas click converted back to the map lands within 1 px of the map point drawn there. A second test: a player inside town is drawn before `town-wall-near.png`, a player south of the town gate is drawn after it, a player north of the cemetery wall is drawn before `cemetery-wall.png`, and a player south of that wall is drawn after it.

8. **Health readout.**
   - Level: L1 — one screen string and bar, proved by a direct assertion. No geometry, tick schedule, or second socket.
   - Files: `src/client/main.ts`, `src/client/view.ts`, `test/unit/view.test.ts`.
   - Check: a unit test feeds a snapshot whose `character` has hp 54 and maxHp 70. The drawn output is the approved bar plus `54 / 70` in screen space, at the same place whatever the camera position.

9. **Damage numbers.**
   - Level: L2 — one hit list that the server collects and the client draws once, proved by one worker test.
   - Files: `src/protocol.ts` (`hits` on the world snapshot), `src/world/room.ts` and `src/world/combat.ts` (collect hits, clear after broadcast), `src/world/core.ts` (snapshot), `src/client/main.ts` and `src/client/view.ts` (white on monsters, red on players, draw each id once), `test/worker/attack.test.ts`.
   - Check: a worker test with two connected players. Player A hits a wolf, and both sockets' next snapshot holds one monster hit of 4 on that wolf. The wolf bites A, and both sockets get one player hit of 5 on A.

10. **Coin picture.**
   - Level: L2 — one coin sprite swapped in, proved by one view test and the existing pickup test.
    - Files: `assets/items/coin.png` (generated in this slice), `src/client/view.ts`, `src/client/sprites.ts`, `test/unit/view.test.ts`, `test/unit/sprites.test.ts`, `test/worker/pickup.test.ts`.
    - Check: a view test. The ground coin is drawn from `/items/coin.png` with no crop, at the spot where the wolf died. The existing pickup test still shows:
      - the pet goes from the owner to the coin over 4 s
      - the coin leaves the ground and the purse gains one
      - another player's pet cannot take it

11. **Login preview.**
   - Level: L1 — one screen image that swaps when the radio changes, proved by a direct assertion.
    - Files: `src/client/index.html`, `src/client/client.js`, `src/client/shell.generated.ts` (rebuilt with `npm run build:client`), `test/unit/login-ui.test.ts`.
    - Check: a unit test. On load the preview shows `warrior-f/stand.png`. Changing the radio to Man shows `warrior-m/stand.png` before any submit. Changing back shows the woman again.

12. **Rules document.**
   - Level: L1 — a document paragraph set, with a check that is a direct comparison of two sim runs.
    - Files: `docs/game_reqts.md` (camera, map layers, walls, patrol and walk stills, the idle-room rule, glow, coin picture, login preview, health readout, damage numbers, blacksmith bubble, shop, inventory).
    - Check: `npm run sim` run twice with the same seed prints the same output.

13. **Blacksmith, shop, and inventory.**
   - Level: L3 — blacksmith, thought bubble, shop and Bag inventory must agree across main, view and input, with click handling and sort order in town.
    - Files: `src/client/main.ts`, `src/client/view.ts`, `src/client/input.ts`, `test/unit/view.test.ts`. The existing forge purchase on the server stays the authority for price, replacement, and a refused purchase.
    - Check: a view test. The town frame includes the blacksmith and a thought bubble. Choosing the bubble opens the six-item shop. With 48 coins, the short sword, long sword, leather, and chain can be bought, and the great sword and plate cannot. The Bag control opens an inventory that shows coins, the worn sword, the worn armor, level, health, strike, and experience.

14. **Playwright screenshots of the running game.**
   - Level: L3 — it is the Playwright screenshot pass of the running game.
    - The Google Chrome extension pass stays deferred until login to that extension works.
    - Playwright opens `http://127.0.0.1:8787/` with the Chrome already installed on this machine and the sandbox on: `chromium.launch({ channel: 'chrome', chromiumSandbox: true })`. Do not run `npx playwright install`. That command downloads a pinned Chrome for Testing build that can miss Chrome security fixes and starts with the sandbox off. Save one screenshot per scenario listed under "Visual contract and testing". Those files are the hand-back record.
    - The unit and worker tests in slices 1–13 still run. The headless `scripts/e2e-two-client.mjs` script is not the sign-off.

Level summary:

- L1: slices 1, 8, 11, 12.
- L2: slices 3, 4, 6, 9, 10.
- L3: slices 2, 5, 7, 13, 14.

## Risks to watch

- An empty room and every zone with no player in it do no monster work. Patrol and bites run only in a section a connected player is standing in, plus a monster already chasing that player.
- The Google Chrome extension browser pass is deferred until login to that extension works. Playwright screenshots are the test record instead.
- The mockups are approved and this plan is final. Implementation starts after the server reset, when told to go. The approved shots stay the visual contract. The later Playwright shots of the running game are a separate test record.
- Closing the cemetery's pine edge to the grey ground (above) is a proposal, not something painted on the map. Without it, a player could walk into the cemetery from the grey field and skip the gate.
- `town-wall-near.png` includes a bit of the yard fence and an uneven top edge. That paint is not collision. The gate segments above stay the only openings.
