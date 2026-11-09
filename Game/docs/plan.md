# Plan: persistent-economy multiplayer game

Authority: `docs/game_reqts.md` (rules), `docs/proj_A.md` (delivery bar). `docs/briefing_A.md` is retired and nothing from it is imported. This file and `docs/plan.json` carry the same content. Plan only: no product code, no wrangler files yet.

## Topology (locked)

- One TypeScript Cloudflare Worker, Wrangler 4. `wrangler dev` emulates the Worker, local D1, the Durable Object, and static assets. The same project deploys later.
- One D1 database: character, level, experience, health, coins, sword, armor, place.
- One Durable Object, **WorldRoom**: positions, the seven monsters per zone, aggro, ground coins, duels. It writes durable facts to D1 when they change.
- The page talks to WorldRoom over a WebSocket.
- Pictures are Worker static assets from `Game/assets`.
- Login is an HttpOnly signed cookie holding the character id. No third-party auth, no passwords.
- One rules module (`src/rules`) is imported by the Worker, WorldRoom, the client (read-only geometry and tables), and the Vitest sim. No second copy of any number.
- One HTML page and one client script, bundled by a Wrangler build command. No React, no second host.

Topology id: `worker-d1-worldroom-ws-assets`.

## Decisions this plan fixes (where game_reqts.md is silent)

- Room logic lives in a clock-injected core (`src/world/core.ts`) behind the WorldRoom adapter, so L3 plan checks run on a fake clock and group checks run against the real Durable Object.
- A monster's target is the first player to hit it; later hitters do not steal it. The killer is whoever lands the last hit. Monsters do not regain HP.
- Buying armor leaves current health as is (clamped to the new maximum); the fountain fills it.
- Pickup timing runs only while the owner is connected; ground coins and living monsters persist in Durable Object storage; purses persist in D1.
- Character facts, including x and y, are written to D1 on level/XP change, purchase, fountain, death, position or place change, duel end, and disconnect, coalesced per tick. A new character starts at the town spawn point from the region table.
- The forge and the fountain act only for a player in town. The server never reads a character id from a message.
- The client crops the ground coin from `avatars/axolotl/pickup.png`; sprite scale and magenta removal are client presentation (P4), not a rule.
- Static: the Worker serves `/` and `/client.js`; `Game/assets` is the assets directory (URLs like `/maps/world-map-wide.jpg`). The cottage, tall house, `map.jpg`, `world-map.jpg`, and `avatars/warrior/` are unused.
- Secrets: `SESSION_SECRET` in `.dev.vars` (gitignored), never in the repo.
- Integration test files under `test/integration/`, `scripts/e2e-two-client.mjs`, and the `e2e:two-client` npm script are written by the group integration step (G6 for the script) from the flow described in each group; plan checks never need them.

## Groups

### G1: Rules module, geometry, sprites, and reproducible sim

- plans: P1, P2, P3, P4, P5
- integration_level: sonnet
- integration_check: `npx vitest run test/unit/tables.test.ts test/unit/logic.test.ts test/unit/regions.test.ts test/unit/sprites.test.ts test/unit/sim.test.ts && npm run sim -- --seed 7 > /tmp/simA.txt && npm run sim -- --seed 7 > /tmp/simB.txt && diff /tmp/simA.txt /tmp/simB.txt`
- integration_pass: All five Vitest files pass, and two sim runs with the same seed print byte-identical health, experience, and coin lines.

### G2: Names, signed cookie, D1 character store, login and session

- plans: P6, P7, P8, P9
- integration_level: sonnet
- integration_check: `npx vitest run test/unit/cookie-names.test.ts test/worker/db.test.ts test/worker/login.test.ts test/worker/me.test.ts test/integration/auth-flow.test.ts`
- integration_pass: The five plan files pass, and the flow test (new name, cookie, /api/me, re-enter as ' BOB ', forged cookie refused, session A never reads or changes character B) passes against the Worker with local D1.

### G3: WorldRoom core: socket binding, walking, monsters standing, fountain, forge

- plans: P10, P11, P12, P13, P14
- integration_level: sonnet
- integration_check: `npx vitest run test/worker/ws-join.test.ts test/worker/move.test.ts test/worker/monsters.test.ts test/worker/fountain.test.ts test/worker/shop.test.ts test/integration/room-core.test.ts`
- integration_pass: The five plan files pass, and the flow test (two sockets join, one walks from town to the green and its x,y and place are saved and restored on a new socket, both see 7 monsters per zone, a purchase and a fountain click persist across a reconnect) passes against the real WorldRoom with local D1.

### G4: Hunt: attack, kill, aggro, death, skeleton proximity, coin pickup

- plans: P15, P16, P17, P18
- integration_level: opus
- integration_check: `npx vitest run test/worker/attack.test.ts test/worker/aggro.test.ts test/worker/skeleton.test.ts test/worker/pickup.test.ts test/integration/hunt.test.ts`
- integration_pass: The four plan files pass, and the hunt flow test passes with two real sockets: both hit one wolf, the killer's purse gains 4 coins one per 4 seconds while the other player's purse gains none, a hit wolf swings every 2 seconds, a skeleton aggros only near and inside the cemetery, a death returns the player to town at full health with level, experience, and gear kept.

### G5: Duels

- plans: P19, P20
- integration_level: opus
- integration_check: `npx vitest run test/worker/duel-request.test.ts test/worker/duel-fight.test.ts test/integration/duel.test.ts`
- integration_pass: The two plan files pass, and the duel flow test passes with two real sockets: request refused in town, decline changes nothing, accept shows the glow on both, a loser at 0 returns to town and the winner gains half the loser's coins rounded down, and walking into town mid-duel ends it with no coin movement.

### G6: Browser shell, login screen, world view, and the scripted two-client run

- plans: P21, P22
- integration_level: sonnet
- integration_check: `npm run e2e:two-client`
- integration_pass: The G6 integration step writes scripts/e2e-two-client.mjs and the e2e:two-client npm script. The script starts wrangler dev on a free port, runs two scripted clients over HTTP and WebSocket with no human, and exits 0 after checking: the page and client script and a map picture load, both log in, A walks and B sees it, A kills a wolf and collects coins by the 4 second rule, a reload (new socket, same cookie) restores the character, a forged cookie is refused, a duel is declined then accepted and settled, and wrangler dev is stopped. A human browser walkthrough may follow but is not a gate.

## Plans

## G1 plans

### P1: Rules tables and constants

- level: L1
- group: G1
- behavior: src/rules/tables.ts is the only home of the numbers: the level table (base HP, strike, XP to next, cap 6, 115 total), the six gear items with effect and price, the three monsters (zone, HP, attack, XP, coins, aggro kind, count 7), and the timing and distance constants (player attack gap 0.45s, monster swing 2s, respawn 5s, coin pickup 4s) plus four frozen numbers that every later plan reads from the rules module and never restates: room tick 100 ms, walk speed 120 px/s, monster chase speed 90 px/s, melee reach 48 px. The skeleton proximity radius is not set here; P3 measures it. Also creates the Vitest and TypeScript scaffolding.
- proves: Character numbers; Monsters; Shop; Coins and the axolotl
- files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/rules/tables.ts`, `src/rules/index.ts`, `test/unit/tables.test.ts`
- depends_on: none
- check: `npx vitest run test/unit/tables.test.ts`
- pass: Every value in the tables test equals the game_reqts.md tables, XP-to-next sums to 115, the tick is 100 ms, walk speed 120, chase speed 90, melee reach 48, no skeleton radius is exported from tables.ts, and the module has no imports.

### P2: Rule functions: XP, health, damage, death, purchase, duel payout

- level: L1
- group: G1
- behavior: src/rules/logic.ts holds pure functions over the tables: award XP (spend the bar, keep leftover, no level past 6), max health = base HP + armor HP, strike = base + sword, damage = strike with no armor reduction, clamp current health to max, death result (town, full max health, level/XP/gear kept), purchase (refuse and change nothing if the purse is short, replace the worn piece, no refund), duel payout = floor(loser coins / 2), and level-up health: when XP raises the level, maximum health becomes the new base HP plus worn armor HP, current health rises by the base HP gained, then clamps to the new maximum (unchanged when the level does not rise). P2 owns this function; P15 calls it.
- proves: Character numbers; Shop; Duels
- files: `src/rules/logic.ts`, `src/rules/index.ts`, `test/unit/logic.test.ts`
- depends_on: P1
- check: `npx vitest run test/unit/logic.test.ts`
- pass: Tests cover leftover XP, the level 6 cap, a 17-coin refusal of an 18-coin sword, armor not reducing damage, and payouts of 0, 1, 7 and 9 coins giving 0, 0, 3 and 4. Level-up health: a full-health level 1 to 2 character (base 24 to 32, gain 8) goes from 24/24 to 32/32 with no armor, 36/36 to 44/44 in leather +12, 48/48 to 56/56 in chain +24, and 64/64 to 72/72 in plate +40; a wounded one at 10 goes to 18; level 3 to 4 (gain 12) in plate takes 30 to 42 with maximum 92; a two-level jump adds both gains; a level that does not rise changes nothing.

### P3: Regions, fountain, forge, and skeleton radius measured on the 1280x720 map

- level: L1
- group: G1
- behavior: src/rules/regions.ts holds hit-areas measured by eye and by pixel probe on assets/maps/world-map-wide.jpg only: polygons for town, green, grey, and cemetery that partition the picture, a fountain hit-area and a forge hit-area inside town, the skeleton proximity radius in pixels, and spawn-point lists per zone, where the first town spawn point is the start point for new characters. Includes zoneAt(x,y), hitFountain, hitForge. docs/regions-measure.md records how each number was taken.
- proves: World; Monsters (skeleton aggro radius)
- files: `src/rules/regions.ts`, `src/rules/index.ts`, `scripts/check-map-size.mjs`, `docs/regions-measure.md`, `test/unit/regions.test.ts`
- depends_on: none
- check: `npx vitest run test/unit/regions.test.ts`
- pass: The test reads the JPEG header and sees 1280x720, every point on a grid belongs to exactly one zone, town is lower left, green lower right, grey upper right, cemetery upper left, and the fountain and forge areas lie inside town.

### P4: Sprite scale, magenta removal, and ground coin crop

- level: L1
- group: G1
- behavior: src/client/sprites.ts has pure functions: removeMagenta turns the magenta field of an RGBA buffer transparent, scaleFor gives one on-map height per sprite kind (player, axolotl, wolf, bear, skeleton, blacksmith) so every still draws at a consistent size, and coinCrop gives the rectangle of the coin inside axolotl/pickup.png so the client draws the ground coin from that still. No new art file and no game rule.
- proves: Art on hand (gaps: magenta, scale, ground coin)
- files: `src/client/sprites.ts`, `package.json`, `test/unit/sprites.test.ts`
- depends_on: none
- check: `npx vitest run test/unit/sprites.test.ts`
- pass: Using the real PNGs from assets/avatars, corner pixels are magenta before and fully transparent after removal, non-magenta body pixels are untouched, and scaled heights match the scale table.

### P5: Reproducible sim over the same rules module

- level: L1
- group: G1
- behavior: src/sim/sim.ts runs hunts (level, sword, armor, monster kind, kills) and duels (two builds) calling only src/rules, and prints health, experience, level, and coins. The sim is deterministic: it rolls no hit chance and no random damage. It steps the same strike and the same 0.45 second player gap and 2 second monster swing clocks as the room, using the tick from the rules module. The seed (a seeded PRNG) only chooses the order of actions. scripts/sim.ts is the CLI behind npm run sim with --seed. Strategies and starting conditions are arguments, not edits.
- proves: Delivery bar from proj_A (same numbers drive play and a reproducible simulation); Shop (hunt pacing)
- files: `src/sim/sim.ts`, `scripts/sim.ts`, `package.json`, `test/unit/sim.test.ts`
- depends_on: P2
- check: `npx vitest run test/unit/sim.test.ts`
- pass: Three scenarios run: hunt strategy one (unarmed level 1 character against wolves), hunt strategy two (a geared character, level and sword and armor given by arguments, against a bear), and one duel between two builds. Two runs of each with the same seed give identical output, five wolves take a level 1 character to level 2 with enough coins for the short sword, and a test that overrides a rules value (wolf coins) changes the sim output, proving there is no second copy.

## G2 plans

### P6: Name rules and signed cookie

- level: L1
- group: G2
- behavior: src/rules/names.ts: normalizeName trims and lowercases for comparison, and a blank or whitespace-only name is invalid. src/server/cookie.ts signs and verifies a character id with HMAC-SHA256 (WebCrypto, constant-time compare) and builds the Set-Cookie value: HttpOnly, SameSite=Lax, Path=/, Max-Age; Secure is added only when the request is HTTPS.
- proves: Login (names; session plays only as its character)
- files: `src/rules/names.ts`, `src/rules/index.ts`, `src/server/cookie.ts`, `test/unit/cookie-names.test.ts`
- depends_on: P1
- check: `npx vitest run test/unit/cookie-names.test.ts`
- pass: 'Bob' and ' bob ' share a key, '' and '   ' are invalid, a good cookie verifies, and a changed id, changed signature, wrong secret, or malformed value does not.

### P7: D1 schema and character store

- level: L1
- group: G2
- behavior: migrations/0001_init.sql creates characters (id, name, name_key UNIQUE, gender, level, xp, hp, max_hp, coins, sword, armor, place, x, y). src/server/db.ts has createCharacter (starting values from the rules module: level 1, full health, 0 coins, 0 XP, no gear, town, and x,y at the town spawn point from the region table in regions.ts), getById, getByNameKey, and saveFacts (which can write x and y). The position is stored as x and y, not only a zone name. Also creates wrangler.jsonc (D1 binding, DO binding, assets) and the Workers Vitest project.
- proves: Login (new character values); What must persist
- files: `migrations/0001_init.sql`, `src/server/db.ts`, `wrangler.jsonc`, `vitest.config.ts`, `package.json`, `test/worker/db.test.ts`
- depends_on: P1, P6, P3
- check: `npx vitest run test/worker/db.test.ts`
- pass: Against local D1 a created character reads back with the starting values (x,y equal to the town spawn point from the region table), a second insert with the same name_key fails, and saveFacts changes only the facts given, including x and y written alone.

### P8: Login route: create or enter

- level: L2
- group: G2
- behavior: POST /api/login {name, gender} refuses a blank or invalid name or a gender other than woman or man and creates nothing; a new name creates the starting character; an existing name (trim, case-insensitive) enters that character with level, XP, coins, gear, and place untouched and ignores the submitted gender; both set the signed HttpOnly cookie. Two simultaneous logins with one new name yield one row.
- proves: Login
- files: `src/server/index.ts`, `src/server/login.ts`, `test/worker/login.test.ts`
- depends_on: P6, P7
- check: `npx vitest run test/worker/login.test.ts`
- pass: Blank and spaces are refused with zero rows added, 'Bob' then ' bob ' return the same id, a character with edited coins and level re-enters unchanged, and the response carries an HttpOnly cookie.

### P9: Session identity and reload restore

- level: L2
- group: G2
- behavior: A requireSession helper reads the cookie, verifies it, and loads the character. GET /api/me returns that character's facts including x and y (this is the reload restore); a missing, forged, or deleted-character cookie gets 401; POST /api/logout clears the cookie. No route accepts a character id from the client.
- proves: Login (one session cannot act as another); What must persist (reload)
- files: `src/server/session.ts`, `src/server/index.ts`, `test/worker/me.test.ts`
- depends_on: P8
- check: `npx vitest run test/worker/me.test.ts`
- pass: A cookie for A returns A's facts, x and y included, after A's row is changed, a cookie signed with another secret returns 401, and passing B's id in query or body never returns B.

## G3 plans

### P10: WorldRoom socket join bound to the session

- level: L2
- group: G3
- behavior: /ws upgrades only with a valid cookie; the Worker forwards to the single WorldRoom Durable Object with the verified character id as a trusted internal header. WorldRoom loads the character from D1, places it at the saved x,y (a new character holds the town spawn point from the region table; a reload or a new socket restores the stored x,y, never a zone spawn), and sends a welcome plus snapshot. Messages never carry a character id; a second socket for the same character closes the first. src/protocol.ts defines the message types.
- proves: Login (session only as its character); What must persist; World (starts in town)
- files: `src/world/room.ts`, `src/world/core.ts`, `src/protocol.ts`, `src/server/index.ts`, `wrangler.jsonc`, `test/worker/ws-join.test.ts`
- depends_on: P9
- check: `npx vitest run test/worker/ws-join.test.ts`
- pass: No cookie or a forged cookie gets 401 on /ws, a valid cookie gets a welcome with that character's facts and the x,y stored in D1 (a new character at the town spawn point, a character whose row holds another x,y at that x,y, and a second socket for the same cookie at the same x,y), a client-supplied id field is ignored, and a duplicate socket evicts the earlier one.

### P11: Click-to-walk and place tracking

- level: L2
- group: G3
- behavior: A move {x,y} message clamps the target to the 1280x720 map and the room tick advances the player at the rules walk speed with no wall collision. zoneAt from the rules module sets the player's place each tick; a place change is written to D1. The player's x and y are written to D1 when they change (coalesced per tick), so a reload or new socket restores the position. Snapshots carry every player's position, facing, moving flag, and place, and a moving player is flagged so the client plays the walk stills.
- proves: World (click to walk, regions); What must persist (place)
- files: `src/world/core.ts`, `src/world/room.ts`, `src/protocol.ts`, `test/worker/move.test.ts`
- depends_on: P10, P3
- check: `npx vitest run test/worker/move.test.ts`
- pass: With a fake clock a player reaches a green target in the expected time, a target off the map is clamped, entering the green changes place and the place column is written once, D1 x,y equal the room position after the walk and after a disconnect, a new socket for the same character joins at those x,y, and another socket's snapshot shows the new position.

### P12: Seven monsters per zone, respawn after 5 seconds

- level: L2
- group: G3
- behavior: The room keeps 7 wolves in green, 7 bears in grey, and 7 skeletons in the cemetery, none in town, each at a spawn inside its zone. When one dies, a replacement of the same kind appears in that zone after 5 seconds at a different spot, returning the count to 7. Living monsters are kept in Durable Object storage and restored after the object restarts. Monsters stand still until P16 and P17 add aggro.
- proves: Monsters (7 per zone, respawn); What must persist (zones remember living monsters)
- files: `src/world/monsters.ts`, `src/world/core.ts`, `src/world/room.ts`, `test/worker/monsters.test.ts`
- depends_on: P10, P3
- check: `npx vitest run test/worker/monsters.test.ts`
- pass: A fresh room has exactly 7 of each kind in the right zone, a killed monster is replaced at exactly 5 seconds in the same zone at a new spot, and a restarted room restores the same living set.

### P13: Fountain click heals to maximum

- level: L2
- group: G3
- behavior: A fountain message from a player in town whose click lands in the fountain hit-area sets current health to current maximum, free and with no cooldown, and saves it to D1. It does nothing for a player at 0 health, outside town, or outside the hit-area.
- proves: World (fountain)
- files: `src/world/core.ts`, `src/protocol.ts`, `test/worker/fountain.test.ts`
- depends_on: P11
- check: `npx vitest run test/worker/fountain.test.ts`
- pass: A wounded level 3 character in town goes to base HP plus armor HP, two clicks in a row both work, a click outside the area or from the green changes nothing, and the new health is in D1.

### P14: Forge purchase

- level: L2
- group: G3
- behavior: A buy {item} message from a player in town spends the full price from the purse, replaces the worn sword or armor, raises or lowers maximum health, clamps current health to the new maximum, and writes the facts to D1 in one statement. A purse that cannot cover the price, an unknown item, or a player outside town is refused and changes nothing. No selling.
- proves: Shop; Login (cannot spend another character's coins)
- files: `src/world/core.ts`, `src/protocol.ts`, `test/worker/shop.test.ts`
- depends_on: P10, P2, P3
- check: `npx vitest run test/worker/shop.test.ts`
- pass: With 18 coins the short sword sells and leaves 0, with 17 it is refused and D1 is unchanged, plate then leather replaces without refund, and buying from the green is refused.

## G4 plans

### P15: Player attack, kill, experience, and coin drop

- level: L3
- group: G4
- behavior: An attack {monsterId} message from a player within melee reach damages the monster by strike (base plus sword), at most once per 0.45 seconds (earlier clicks are ignored, not queued). The player who lands the killing hit gets the monster's XP through the rules function (level up, leftover kept, cap 6), written to D1, and the monster's coins fall on the ground as one token per coin owned by that killer. The 5 second respawn starts. There is one attack clock per player, in combat.ts: a hit on a monster and a hit on a duelist (P20) both pass through the same 0.45 second check. When XP raises the level, it calls the P2 level-up health function.
- proves: Character numbers (attack gap, strike, XP); Monsters; Coins and the axolotl (ground tokens)
- files: `src/world/combat.ts`, `src/world/core.ts`, `src/protocol.ts`, `test/worker/attack.test.ts`
- depends_on: P11, P12, P2
- check: `npx vitest run test/worker/attack.test.ts`
- pass: With a fake clock a level 1 character with no sword kills a wolf in 5 hits spaced 0.45 seconds, a hit at 0.40 seconds is ignored, the killer gains 2 XP and 4 ground coins and the purse gains 0, and the ten-XP bar raises level 1 to 2 with the remainder kept, with health following the P2 function (24/24 becomes 32/32). The attack clock is shared: a duel-style swing stamped through the same combat.ts call at 0 s blocks a monster hit at 0.40 s, a monster hit at 0 s blocks that duel-style swing at 0.40 s, and either lands at 0.45 s.

### P16: Wolf and bear aggro after a hit, 2 second swings, player death

- level: L3
- group: G4
- behavior: A wolf or bear that has not been hit stands. A hit gives it the hitter as its target (the first holder keeps it); it chases at the rules monster chase speed and swings every 2 seconds for its attack (each swing flagged in the snapshot so the client can pick the bite or swipe still) while the target is in the same zone and within reach. Aggro clears when the target leaves the zone, dies, or disconnects. At 0 health the player returns to town at full maximum health and keeps level, XP, and gear, saved to D1.
- proves: Monsters (wolf, bear aggro, 2 second attack); Character numbers (death)
- files: `src/world/combat.ts`, `src/world/monsters.ts`, `src/world/core.ts`, `src/protocol.ts`, `test/worker/aggro.test.ts`
- depends_on: P15
- check: `npx vitest run test/worker/aggro.test.ts`
- pass: An unhit wolf never moves when a player stands beside it, after a hit it reaches the player and deals 5 at 2 second intervals, walking out of green clears it, a bear deals 9, and death lands the player in town at full max health with level, XP, and gear unchanged.

### P17: Skeleton proximity aggro inside the cemetery

- level: L3
- group: G4
- behavior: A skeleton aggros the nearest player who is inside the cemetery and within the measured pixel radius, with no hit needed, then chases and swings 12 every 2 seconds, flagged in the snapshot the same way (the client picks the strike still). A player in town, green, or grey is never targeted even if inside the radius of a skeleton near a border. Leaving the cemetery or dying clears the aggro.
- proves: Monsters (skeleton aggro)
- files: `src/world/combat.ts`, `src/world/monsters.ts`, `test/worker/skeleton.test.ts`
- depends_on: P16
- check: `npx vitest run test/worker/skeleton.test.ts`
- pass: A player just outside the radius is ignored, just inside is targeted and takes 12 every 2 seconds, a player standing in grey within radius of a border skeleton is ignored, and aggro clears on leaving.

### P18: Axolotl pickup: killer only, 4 seconds per coin

- level: L3
- group: G4
- behavior: Ground coins are owned by the killer and kept in Durable Object storage. While the owner is connected, the owner's axolotl takes one coin at a time: it plays the pickup still for 4 seconds, then one coin leaves the ground and one coin is added to the purse and D1 in the same tick, then the next starts. While a pickup runs, the snapshot carries the owner's current coin position and the elapsed pickup time. No other player's pet takes them. If the owner disconnects mid-pickup, the coin stays on the ground and the 4 seconds restart on return.
- proves: Coins and the axolotl
- files: `src/world/pets.ts`, `src/world/core.ts`, `src/protocol.ts`, `test/worker/pickup.test.ts`
- depends_on: P15
- check: `npx vitest run test/worker/pickup.test.ts`
- pass: With a fake clock a 4-coin drop adds coins at 4, 8, 12, and 16 seconds and not before, a second player standing beside the drop gains nothing, and a disconnect at 3 seconds leaves the coin on the ground with no purse change.

## G5 plans

### P19: Duel request, accept, decline, and red glow

- level: L3
- group: G5
- behavior: A duel_request {playerId} message is refused if either player is in town, the target is self or absent. The target sees a duel_offer and may duel_accept or duel_decline; decline clears the request and changes nothing; only the named target can accept. On accept both players are flagged dueling with each other, and snapshots carry the flag so the client draws the red glow. A pending request is dropped if either side enters town or disconnects.
- proves: Duels (outside town only, ask, accept, decline, red glow)
- files: `src/world/duels.ts`, `src/world/core.ts`, `src/protocol.ts`, `test/worker/duel-request.test.ts`
- depends_on: P11
- check: `npx vitest run test/worker/duel-request.test.ts`
- pass: A request in town is refused, a decline leaves both players unflagged with unchanged facts, a third player cannot accept it, and an accept flags exactly those two players.

### P20: Duel fight, settlement, and town exit

- level: L3
- group: G5
- behavior: Between flagged duelists an attack {playerId} damages the target by strike at one per 0.45 seconds, with no XP. The 0.45 second gap is the same per-player attack clock P15 uses for monsters: a duel swing blocks a monster swing inside the gap, and the reverse. At 0 the loser returns to town at full maximum health keeping level, XP, and gear, and the winner takes floor(loser coins / 2) from the loser's purse, both rows written to D1 in one batch. Walking into town or disconnecting ends the duel and the glow with no coin transfer. Attacks on non-duelists are ignored.
- proves: Duels (no XP, half the coins rounded down, town ends duel, no transfer)
- files: `src/world/duels.ts`, `src/world/combat.ts`, `src/world/core.ts`, `test/worker/duel-fight.test.ts`
- depends_on: P19, P16
- check: `npx vitest run test/worker/duel-fight.test.ts`
- pass: A loser holding 9 coins pays 4 and keeps 5, a loser with 1 coin pays 0, neither side gains XP, a duelist who walks into town mid-fight ends it with both purses unchanged, a non-duelist cannot be hit, and with the real duel and a real wolf a duel swing at 0 s blocks a monster swing at 0.40 s, a monster swing at 0 s blocks a duel swing at 0.40 s, and either lands at 0.45 s.

## G6 plans

### P21: Static page, client bundle, and login screen

- level: L1
- group: G6
- behavior: One HTML page and one client script bundled by a Wrangler build command, both served by the Worker at / and /client.js; pictures come from the assets directory (/maps/..., /avatars/...). The first screen is character setup: woman or man and a name box; it posts /api/login, shows the server's refusal, and on success calls /api/me and reveals the map canvas. No React.
- proves: Login (first screen); World (playfield picture); Art on hand
- files: `src/client/index.html`, `src/client/main.ts`, `src/client/login.ts`, `src/server/index.ts`, `wrangler.jsonc`, `package.json`, `test/worker/shell.test.ts`, `test/unit/login-ui.test.ts`
- depends_on: P8
- check: `npx vitest run test/worker/shell.test.ts test/unit/login-ui.test.ts`
- pass: / serves HTML with a single script tag, /client.js serves JavaScript, /maps/world-map-wide.jpg returns 200 from assets, and the login form with a mocked fetch shows a refusal for a blank name and the map on success.

### P22: World view: snapshot to drawing, clicks to messages

- level: L2
- group: G6
- behavior: src/client/view.ts turns a snapshot into a draw list using sprites.ts: scaled gender stills, walk-1..3 cycle while moving, attack-1/2 on attack, wolf/bear/skeleton stills by state (stand, step/charge/thrust while chasing, and bite/swipe/strike on a flagged swing), axolotl following its owner and, during the 4 second pickup, moving toward the owner's ground coin with the pickup still, the cropped coin on the ground, red glow on duelists, forge and blacksmith in town. src/client/input.ts turns a click into one message: ground to move, monster to attack, fountain, forge to open the smith panel then buy, right-click player to duel_request, accept and decline buttons. main.ts connects the WebSocket and reconnects with the same cookie.
- proves: World (click to walk, stills play); Shop (forge click); Duels (right-click, glow); Coins and the axolotl (pet and coin art)
- files: `src/client/view.ts`, `src/client/input.ts`, `src/client/main.ts`, `test/unit/view.test.ts`
- depends_on: P21, P4, P13, P14, P18, P20
- check: `npx vitest run test/unit/view.test.ts`
- pass: With a fake socket, each click kind sends exactly the expected message, a moving snapshot picks walk frames in order, a duelist gets the red glow flag, the pet draws the pickup still while a pickup is active and its position moves toward the owner's ground coin across the 4 seconds (closer at 2 s than at 0 s, at the coin at 4 s), and a monster swing draws the bite still for a wolf, the swipe still for a bear, and the strike still for a skeleton.

## Coverage of game_reqts.md

- Login and names: P6, P8, P9, P10, P21. Level/XP table, health, strike, armor as max HP: P1, P2. Swords and armor, forge prices, refusal: P1, P2, P14.
- Fountain: P3, P13. Regions, click-to-walk: P3, P11, P22. Seven monsters per zone and respawn: P12.
- Wolf/bear aggro after a hit, 0.45s and 2s timings, death: P15, P16. Skeleton proximity: P3 (radius), P17.
- Coins on the ground, killer-only pickup, 4 seconds per coin: P15, P18. Duels: P19, P20.
- Reload restore (including x,y) and one session one character: P7, P9, P10, P11. Same numbers in the sim: P5. Sprite scale and magenta: P4.

## Dependency order

Buildable in waves (plans in one wave do not depend on each other):

1. P1, P3, P4
2. P2, P6
3. P5, P7
4. P8
5. P9, P21
6. P10
7. P11, P12, P14
8. P13, P15, P19
9. P16, P18
10. P17, P20
11. P22

Flat order: P1 -> P3 -> P4 -> P2 -> P6 -> P5 -> P7 -> P8 -> P9 -> P21 -> P10 -> P11 -> P12 -> P14 -> P13 -> P15 -> P19 -> P16 -> P18 -> P17 -> P20 -> P22

Group integration runs after every plan in the group passes, in the order G1, G2, G3, G4, G5, G6.

## Levels

- L1: P1, P2, P3, P4, P5, P6, P7, P21
- L2: P8, P9, P10, P11, P12, P13, P14, P22
- L3: P15, P16, P17, P18, P19, P20

## Open items for review

- game_reqts.md sets no name length limit; none is planned.
- Tick 100 ms, walk speed 120 px/s, monster chase speed 90 px/s, and melee reach 48 px are frozen in P1 and tuned only in the rules module. The skeleton radius is measured in P3.
- Free-tier CPU is 10 ms per request; the 100 ms tick from P1 must keep one tick's work well under that.
- Balance evidence beyond the P5 sim (strategy sweeps, recovery under sustained play) is not a plan check here.

## Out of scope

Public deploy is out of this plan. Nothing here publishes anywhere; everything runs under `wrangler dev`. The HTTPS deploy is a later pass, and the cookie's Secure flag is already handled by P6 when the request is HTTPS.
