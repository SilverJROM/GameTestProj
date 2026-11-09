# Requirements (North draft, not yet reviewed)

Source: `/home/candidate/ProjA/tasks/briefing_A.md` (project A). Status: **DRAFT. Two items are BLOCKED and need a decision before the Grok/Claude review step.**

## Locked decisions

Each line is one locked decision from the briefing.

| ID | Decision |
| --- | --- |
| D1 | Persistent economy. Coins come from monsters, the smith sells the only items (sword, armor), and a duel moves coins between players. |
| D2 | One map. Click the ground to walk in steps. Named spots still own the forge, the duel circle, and monster draws. |
| D3 | One pure `fight(seed, a, b)` serves monsters and players. The hero has three stills. The wolf is an SVG with a standing still and a struck still. |
| D4 | On screen, one wolf click is one swing, and the wolf swings about every 2.5 s. The seeded `fight` runs when that wolf's bar hits 0 and decides the log and the coins. |
| D5 | Right-click duels. Left-click shows a Duel button. Both players must be on `arena`. A duel plays the whole exchange. Replaying an event index is a no-op. |
| D6 | World seed 4001, plus player id, plus event index. Shared by the simulation and the Worker. |
| D7 | Login screen first. Pick the warrior, set gender and name. The world holds two, three, or more characters. Each session plays only as the character it signed in as. |
| D8 | Cloudflare Worker. Test first with `wrangler dev` and local D1, then deploy the same build. |
| D9 | Out of scope: wall collision, a walk-cycle sheet, a Guard, ground items, a second shop, a second town, licensed sprites, and click-by-click duels. |

## Requirements

Each R id names an observable result. "Source" points to the briefing section.

### Login and characters

| ID | Criterion | Source |
| --- | --- | --- |
| R1 | The first screen is a login. It lists saved characters and offers a create form (warrior pick, gender, name). Submitting the form stores a character row in D1 and enters the map. | Login |
| R2 | Picking a saved character enters the map with that character's stored coins, gear, spot, and monster row. | Login |
| R3 | A blank name is refused with a visible message and no row is written. | Login |
| R4 | A name already saved returns that character and does not reset its purse. | Login |
| R5 | Gender is one of woman, man, or unspecified. It is stored on the character and does not change damage, prices, or drops. | Login |
| R6 | A new character starts with 10 coins on `square`, with no gear. | Login, rules table |
| R7 | A session can act only as the character it entered with. A request for another character's coins, moves, or fights is refused. | Login, D7 |
| R8 | Any number of characters is allowed. A fourth character uses the same screen and rules. | Login |

### Map and movement

| ID | Criterion | Source |
| --- | --- | --- |
| R9 | The map view is a zoomed window of about 440×330 map pixels on `assets/world-map.jpg`. The town, forge, duel circle, and fields are visible on that picture. | The map |
| R10 | Other characters, the wolf, and the axolotl are drawn as separate sprites on top of the map. A coin is a CSS circle. | The map |
| R11 | `spots.json` defines `square`, `forge`, `gate`, `arena`, `clearing-a`, and `clearing-b` with the roads as polylines. | The map |
| R12 | `POST /api/move` accepts a move to any named spot and does not check adjacency. | The map |
| R13 | Clicking empty ground walks a straight line in steps of about 24 map pixels, 320 ms per step, with one bob. The sprite faces left or right. The camera follows. | How a click walks |
| R14 | A newer click cancels the current walk and starts toward the new point. | How a click walks |
| R15 | When the hero stops within about 96 px of a named spot different from its current spot, the page posts `/api/move` for that spot. | How a click walks |
| R16 | The spot buttons and rings walk the road polyline between named spots, one step at a time. | How a click walks |
| R17 | Other players' moves appear on screen within about one second. | Acceptance |

### Pictures

| ID | Criterion | Source |
| --- | --- | --- |
| R18 | The hero uses three stills: `warrior-stand.png`, `warrior-attack.png` (shown on a swing for 420 ms), and `warrior-pickup.png`. There is no walk-cycle sheet. | Pictures for an action |
| R19 | The axolotl follows the hero and swaps to `axolotl-pickup.png` when coins land. | Pictures for an action |
| R20 | The wolf shows the struck still when a player hit lands, and performs a short lunge toward the player when it swings. The crimson wolf is the same marker with another tint. | Pictures for an action |
| R21 | The name is shown on each character's sprite. | Login |

### Fighting a wolf

| ID | Criterion | Source |
| --- | --- | --- |
| R22 | Clicking a wolf farther than about 78 px walks the hero to a point just in front of it. The arrival swings once. | Fighting a wolf |
| R23 | Clicking within reach swings once. Clicks during a swing queue and play one at a time. | Fighting a wolf |
| R24 | Player damage on screen is 4, or 6 with the sword. | Fighting a wolf |
| R25 | The wolf swings on its own about every 2.5 s, starting 2.5 s after the fight begins. Wolf damage on screen is `max(1, attack − 2)` with armor, otherwise `attack` (3 for the wolf, 4 for the crimson wolf). | Fighting a wolf, D4 |
| R26 | The tag shows wolf current/max and player current/max. Player health starts at 20 and is not saved. | Fighting a wolf |
| R27 | Clicking the ground leaves the fight. Coming back starts a fresh pair of health bars. | Fighting a wolf |
| R28 | When the wolf's bar reaches 0, the page calls `POST /api/fight`. The server runs `fight(seed, a, b)`, and grants the seeded drop if the function says the player won. | Fighting a wolf, D4 |
| R29 | If the seeded fight is a loss for the player, the wolf stays in the saved world. | Fighting a wolf |
| R30 | Defeating a monster clears it for that player. Leaving the clearing and returning draws the next monster. | Fighting a wolf |
| R31 | A player's first fight is a wolf. From the second fight on, `clearing-b` draws the crimson wolf. `clearing-a` draws wolves only. | Spots, Fighting a wolf |
| R32 | Each player has its own monster row. Players do not share one. | Fighting a wolf |
| R33 | A monster loss costs the player no coins. Health resets, the monster stays. | Rules table |

### Duels and the smith

| ID | Criterion | Source |
| --- | --- | --- |
| R34 | Right-click on another hero does not open the browser menu. Left-click selects that hero and shows a Duel button. | Duels |
| R35 | The Duel button is enabled only when both heroes are on `arena`. It calls `POST /api/fight` with the other character as target. | Duels, D5 |
| R36 | A duel plays the whole seeded exchange from one action. The winner takes `floor(loser coins / 2)`. The loser keeps gear and remaining coins. | Duels, rules table |
| R37 | Replaying the same attacker event index returns 200 with `applied: false` and changes nothing. | Duels, D5 |
| R38 | The coin transfer is one conditional write. It succeeds only if the coin totals and the attacker's event index still match. | Rules table |
| R39 | The smith sells only at `forge`. Sword: 12 coins, +2 damage. Armor: 20 coins, −2 incoming damage after the strike bonus, minimum 1. A second purchase of either item is free. | Duels and the smith, rules table |

### Simulation and rules

| ID | Criterion | Source |
| --- | --- | --- |
| R40 | `rules.ts` is the only table of numbers. The page, the Worker, and the simulation import it. | Where it runs, Fight numbers |
| R41 | `fight.ts` exports `fight(seed, a, b)`, which returns an event list. It has no `Date`, no `Math.random`, and no WebCrypto. | Fight numbers |
| R42 | The random draw is `mulberry32(hash32(world_seed, player_id, event_index))`. Both `mulberry32` and `hash32` live in `fight.ts`. | Fight numbers, D6 |
| R43 | Damage uses integer floor. Strike is 4. Fighters alternate until health reaches 0. A fight is capped at 30 rounds. | Rules table |
| R44 | Wolf: 10 health, attack 3, drops 3 to 5 coins. Crimson wolf: 16 health, attack 4, drops 6 to 8 coins. | Rules table |
| R45 | The simulation is a local script that imports `fight.ts` and prints the `/log` for seed 4001. | Where it runs |

### State and API

| ID | Criterion | Source |
| --- | --- | --- |
| R46 | World state is stored in D1. Local runs use Wrangler's local D1. A reload shows the same coins, gear, names, and spots as before. | Where it runs, D8 |
| R47 | `/state` returns at most the last 20 events. | Rules table |
| R48 | `/log` prints the event lines for the character. | Rules table |
| R49 | A reset returns the character to day one: 10 coins, `square`, an empty log. | Rules table |
| R50 | The static pictures are served as Worker assets. | Where it runs |

### Deployment (later step, does not gate the first pass)

| ID | Criterion | Source |
| --- | --- | --- |
| R51 | After the local journey passes, the same build deploys with `wrangler deploy` to Workers Free. Each request stays within the free CPU limit. The deployed HTTPS URL plays J1. | Where it runs, D8 |

## Journey

**J1** (from the briefing, made concrete). Run first on `wrangler dev`, then on the deployed Worker.

Two or three players each pass the login screen, pick the warrior, and enter with their own name. One walks to a field, fights one wolf, sees the attack still and then the pickup still, and ends with 13 to 15 coins. That player buys the sword for 12 at the forge. Another reaches the sand circle and duels. All players reload and return through the same names. Coins, gear, and purses match the table and match `/log` for seed 4001.

A coin total with no event lines is a failure.

## Blocked: needs your decision

| ID | Question | Why it matters |
| --- | --- | --- |
| B1 | **Duel initiative formula.** The briefing says `hash32(seed, duel_index) & 1`, but D6 says the draw is seed plus player id plus event index. Which should I use? Proposed: `hash32(seed, attacker_id, event_index) & 1`, which matches D6. | Changes who strikes first in every duel, so it changes the log. |
| B2 | **Scope: "full game".** You said the full game in this pass. Should D9 (the out-of-scope list) stay out of scope, or do you want any of it now? | Decides whether R-criteria are added or cut. |
| B3 | **Session identity.** How does a session know which character it is? Proposed: a signed cookie that holds the character id, set on login. | Without this, R7 cannot be built. |
| B4 | **Event counter.** Does the attacker's event counter count only duel events, or every fight event (wolf fights and duels)? | It sets the duel index used in B1 and in replay protection (R37). |
| B5 | **Name matching.** Are names case-sensitive, and are they unique across the whole world? Proposed: unique, case-insensitive, trimmed. | Affects R3 and R4. |

## Open dependencies (not decisions)

- **Assets.** The pictures listed under "Pictures" are needed for the screen checks. You said you will pull them. Until they arrive, screen rows use placeholders.
- **Second warrior set.** Locked as one set for every gender (R5). No action needed unless you want a second set now.

## Lists

**In scope:** R1–R51 (R51 after the local pass), J1.

**Out of scope:** D9, as listed in the briefing, unless B2 changes it.

**Blocked:** B1, B3, B4, B5. B2 is a scope question, not a blocker for the rest of the file.
