# Game requirements

Build the game in this document. These are the requirements. Report project A at the first MCP check-in. Do not reopen a locked decision.

The setting is original. Final Fantasy and StarCraft names, characters, monsters, and sprites stay out.

## Route

Persistent economy. Several players share one ongoing map. Monsters drop coins only. A smith sells the only items, a sword and a piece of armor. Gear and coins persist. A duel moves coins from one player to the other.

One page and one saved world. `rules.ts` is the only number table. `fight.ts` exports `fight(seed, a, b)`. The page, the Worker, and the simulation share those rules. Pictures live in `assets/`: `world-map.jpg` (1024×1024), `warrior-stand.png`, `warrior-attack.png`, `warrior-pickup.png`, `axolotl-stand.png`, `axolotl-pickup.png`. The wolf is an SVG on the page.

## Where it runs

The game is a Cloudflare Worker. Build it so the local copy and the deployed copy are the same project.

Develop and test with Wrangler on the machine first. `wrangler dev` emulates the Worker. World state goes in D1, and the local run uses Wrangler's local D1, not a separate database and not a hand-written JSON file as the source of truth. Static pictures are Worker assets. A reload during `wrangler dev` shows the same coins, gear, names, and spots that a later `wrangler deploy` will show.

Deploy that same build to Cloudflare when the local journey passes. Players then open the deployed HTTPS URL. The app keeps running after the workstation is locked. Workers Free is the target. Keep each request inside the free CPU limit. Workers Paid is a separate charge and needs the evaluator's approval before anyone pays it.

The simulation may stay a local script. It imports the same `fight.ts` and prints `/log` for seed 4001. It does not need its own copy of the rules.

## Login

The first screen is a login, before the map. A player picks the warrior, chooses a gender, and types a name. That creates a saved character. The same screen lists characters already saved. Picking one enters the map as that character, with the coins, gear, and spot already stored.

The world is not capped at two. Two or three players is the normal session. A fourth player uses the same screen and the same rules. Each character has a separate coin purse, gear, position, and monster row. One session acts only as the character it entered with, so one player cannot spend another's coins or take another's fight.

Gender is woman, man, or unspecified. It is stored on the character and does not change strike damage, prices, or drops. The pictures in `assets/` are one warrior, used for every gender, until a second still set is drawn. The name is shown on the sprite. A blank name is refused. A name already saved returns that character and does not reset the purse.

The warrior choice is the three stills `warrior-stand.png`, `warrior-attack.png`, and `warrior-pickup.png`. The screen is built so another character can be added later without a new login flow. New characters start with 10 coins on the town square.

## The map

One isometric picture, `assets/world-map.jpg`. The walled town and the forge are on the left, the sand duel circle is outside the gate, and the paths and clearings are the outside. Play is a zoomed window on that image, about 440×330 map pixels. There is no second map.

Players, the wolf, and the axolotl are separate pictures on top. A coin is a CSS circle, credited when the pickup still plays.

Spots in `spots.json`:

| Id | Place | What it does |
| --- | --- | --- |
| `square` | Town square | Start |
| `forge` | Smith | Sword and armor |
| `gate` | Road by the gate | Passage |
| `arena` | Sand circle | Duels only when both players are here |
| `clearing-a` | North field | Wolves only |
| `clearing-b` | South field | Wolf, then the crimson wolf from that player's second fight on |

Roads are polylines in that file. The server accepts a move to any named spot. It does not check adjacency.

## How a click walks

Click empty ground. The hero walks a straight line in steps of about 24 map pixels. Each step takes 320 ms, with one bob, and the sprite faces left or right. The camera follows. A newer click cancels the walk and starts toward the new point.

The spot buttons and the rings still walk the road between named spots, one step at a time.

When the hero stops within about 96 pixels of a named spot, the page posts `/api/move` if that spot is not the current one. That is what opens the smith, the duel circle, and a monster draw. There is no wall collision, so a straight walk can cross art that looks blocked.

## Pictures for an action

The hero has three stills: standing with the sword sheathed, one attack pose, then bending to pick up. The page swaps those stills. There is no walk-cycle sheet. The axolotl follows and swaps to its pickup still when coins land.

The wolf has a standing SVG and a struck SVG. A player hit shows the struck still. The wolf's own attack is a short lunge toward the player. The crimson wolf is the same marker with another tint.

## Fighting a wolf

Click the wolf. If it is farther than about 78 pixels, the hero walks to a point just in front of it, then that arrival swings once. One click is one swing. The attack still holds for 420 ms. Damage on screen is 4, or 6 with the sword. Clicks during a swing wait, then play one at a time.

The wolf swings on its own about every 2.5 seconds (0.4 attacks a second), starting 2.5 seconds after the fight begins. Its damage on screen is `max(1, attack - 2)` when the player has armor, otherwise its attack (3 for a wolf, 4 for the crimson wolf). Hit points sit on the wolf's tag: wolf current/max, then you current/max. Health starts at 20 for the player and is not saved. Click the ground to leave the fight. Leaving and coming back starts a fresh pair of health bars.

The page keeps those hit points locally. When the wolf's bar hits 0, the page calls `POST /api/fight`. The server runs `fight(seed, a, b)` and grants the seeded drop if that function says the player won. The log is that seeded list. A fast series of clicks can kill the wolf on screen before the wolf has swung as many times as the log will show. If the seeded fight would be a loss, the wolf stays in the saved world.

Defeating the monster clears it for that player. Leaving the clearing and coming back draws the next one. Each player's first fight is a wolf. Players do not share one monster row.

## Duels and the smith

A duel plays the whole seeded exchange from one action. Both players must be on `arena`. Right-click the other hero, and the page blocks the browser menu. Left-click selects them. The Duel button calls the same `POST /api/fight` with the other player as the target. The winner takes `floor(half the loser's coins)`. The loser keeps gear and the coins that remain. The same attacker event index again returns 200 with `applied: false` and changes nothing.

The smith sells only at the forge. Sword is 12 coins and adds 2 damage. Armor is 20 coins and subtracts 2 after the strike bonus, minimum 1. A second buy does not charge again.

## Fight, drops, and the numbers

`fight.ts` returns the event list. `rules.ts` holds the table. Damage uses integer floor. The draw is `mulberry32(hash32(world_seed, player_id, event_index))`. `mulberry32` and `hash32` live in `fight.ts`. No `Date`, no `Math.random`, and no WebCrypto inside `fight.ts`. The world seed is 4001.

Armor applies after the strike bonus: `max(1, damage - 2)`.

| Rule | Value |
| --- | --- |
| Start | 10 coins. Health is 20 at the start of every fight and is not saved |
| Strike | 4 damage. Fighters alternate until health is 0. Cap 30 rounds |
| Sword | +2 damage, 12 coins. A second buy does not charge again |
| Armor | incoming damage reduced by 2 after the strike bonus, minimum 1. Costs 20 coins. A second buy does not charge again |
| Initiative | `hash32(seed, duel_index) & 1` picks who strikes first. `duel_index` is the attacker's event counter |
| Wolf | 10 health, attack 3, drops 3 to 5 coins |
| Second monster | 16 health, attack 4, drops 6 to 8 coins. The page calls it the crimson wolf |
| PvE loss | the player loses no coins to a monster. Health resets. The monster stays |
| Duel purse | the winner takes half of the loser's coins, rounded down. One write, conditional on the coin totals and the attacker's event index |
| After a loss | the loser keeps gear and remaining coins and can hunt again |

Hand check, 20 health: a sword (6) kills an unarmed fighter (4) in 4 strikes against 5, whoever starts. Armor against unarmed: unarmed deals 2 and needs 10 strikes, armor deals 4 and needs 5, so armor wins. Sword against armor: both deal 4 and need 5 strikes, so initiative decides. One wolf drop pays for the sword from a purse of 10.

`/state` returns at most the last 20 events. `/log` prints the lines. A reset returns day one: 10 coins, town square, empty log.

## Locked decisions

| ID | Locked choice |
| --- | --- |
| D1 | Persistent economy. Coins from monsters, smith sword and armor, duel purse. |
| D2 | One map. Click the ground to walk in steps. Named spots still own the forge, the circle, and monster draws. |
| D3 | One pure `fight(seed, a, b)` for monsters and players. Three hero stills. The wolf is an SVG with a stand still and a struck still. |
| D4 | On screen, one wolf click is one swing, and the wolf swings about every 2.5 seconds. The seeded `fight` runs when that wolf's bar hits 0 and is what the log and the coins follow. |
| D5 | Right-click duels. Left-click shows a Duel button. Both players on the sand circle. A duel plays the whole exchange. Replay of an event index is a no-op. |
| D6 | World seed 4001 plus player id plus event index. Shared by the sim and the Worker. |
| D7 | Login screen. Pick the warrior, set gender and name. The world holds two, three, or more characters. Each session plays only as the character it signed in. |
| D8 | Cloudflare Worker, tested first with `wrangler dev` and local D1, then deployed with the same build. |
| D9 | Out of scope: wall collision, a walk-cycle sheet, Guard, ground items, a second shop, a second town, licensed sprites, and click-by-click duels. |

## Acceptance

`J1`, first on `wrangler dev`, then on the deployed Worker. Two or three players each pass the login screen, pick the warrior, and enter with their own name. One walks to a field, fights one wolf, sees the attack still and then the pickup still, and lands at 13 to 15 coins. That player buys the sword for 12 at the forge. Another reaches the sand circle and duels. All reload and return through the same names. Coins, gear, and the purse match the table and match `/log` for seed 4001. The deployed URL plays the same journey.

A coin total with no event lines is a failure.

The wolf fight on screen is one click per swing. The coins and `/log` come from the seeded function when that wolf's bar hits 0.

Other players' moves and duels appear within about one second. The step walk can cross the drawing. Spot rings and the bottom bar remain a second way to travel.
