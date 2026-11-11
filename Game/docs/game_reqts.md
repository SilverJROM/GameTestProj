# Game requirements

Source: `Game/docs/proj_A.md`, plus the rules confirmed with the project owner. Status: **the game, local and deployed, follows this document** (refreshed for plan 09: server-side death, level-3 duels, coin expiry, shared bag, route walking, controls, Access and account cap).

This document replaces `Game/docs/briefing_A.md` for project A. The older sheet (one sword, one armor, wolves only, one-shot arena duel, no levels) is not the rule set.

Route: **persistent economy.** One shared ongoing world. Players hunt, earn coins, buy gear, and duel. State survives a reload.

## World

The measuring frame is `assets/maps/world-map-wide.jpg` (1280×720). `map.jpg` and `world-map.jpg` are not the playfield. The picture drawn in play is not the wide map.

The stack shares one 1280×720 origin:

1. `assets/maps/world-ground.jpg`
2. `assets/overlays/town-behind.png`
3. Sprites, sorted by feet, higher feet first
4. `assets/overlays/town-wall-near.png`, in front of a character whose feet are inside town. A character south of the town gate is drawn after that wall.
5. `assets/overlays/cemetery-wall.png`, in front only when the character's feet are north of the cemetery wall

`houses/forge.png` is not drawn again. The forge building is already in `town-behind.png`. The blacksmith is a separate sprite and is drawn with the avatars.

The camera shows 60 percent of the current zone's area by default, and a slider can zoom out to 75 percent of that area. The window keeps the 1280×720 shape (16:9) with one scale, so the picture is not stretched and there are no dark bars. It stays centered on the player and does not slide past the map edge. A click is converted through that same camera onto the map.

Walls are solid. Fence pixels, and the uneven top of the near town wall, are paint, not collision. The town gate is open from (444, 574) to (410, 593). The short run from (410, 593) to (400, 598) stays solid. The road through the gate is around (425, 584). The cemetery gate is open from (317, 229) to (365, 217). The road through it is around (340, 222). The west cemetery chain, the east chain, and the pine edge through (542, 105), (548, 95), (520, 60), (470, 30), and (432, 0) are solid. A player stops at a solid wall. A monster does not step through a wall or out of its zone.

| Region | Where on the picture | What lives there |
| --- | --- | --- |
| Town | Lower left, inside the walls | Start, forge, fountain. No monsters. No duels. |
| Green fields | Lower right | Wolves |
| Grey ground | Upper right | Bears |
| Cemetery | Upper left | Skeletons |

### Controls

- Left click on the ground walks there by the shortest route around the solid walls (the town and cemetery gates are open). The walk stills play while the character moves.
- Left click on a monster walks to it and swings once. Left click on the duel partner (once a duel has started) does the same.
- Right click on a monster walks to it and keeps swinging until it dies. Right click on the duel partner walks over and keeps swinging until one of them falls.
- Right click on any other player opens a small menu: Duel (sends the request; while it waits the menu shows Cancel and waiting dots).
- Left click on the fountain (in town) sips. Left click on the forge (in town) opens the smith.
- The partner's outline lights up on hover during a duel. A swing out of reach does nothing while walking, and one swing is one swing.

The player starts in town after login.

The fountain is the courtyard well painted on the town. Clicking it sets that player's health to their current maximum. It costs nothing and has no cooldown. It does not revive a dead avatar: only Respawn does.

The shop is the forge in town. Clicking it opens the smith. The blacksmith still may stand there. `houses/cottage.png` and `houses/tall.png` are spare art and are not required.

## Login

The first screen is character setup, before the map.

- The player picks a gender and types a name.
- Genders are woman and man. Woman uses `avatars/warrior-f/`. Man uses `avatars/warrior-m/`. Gender changes the pictures only.
- Under that choice, a portrait shows the matching stand still. Woman shows `avatars/warrior-f/stand.png`. Man shows `avatars/warrior-m/stand.png`. The picture changes when the radio changes, before the name is submitted. The magenta field is removed. `avatars/warrior/` is the older smaller set and is not this portrait.
- A blank name, including a name that is empty after trim, is refused and creates nothing.
- Names are unique in the world after trim, compared without case. "Bob" and " bob " are the same character.
- An existing name enters as that character and does not reset level, experience, coins, gear, or place.
- A new name creates a level 1 character in town, with full health, 0 coins, 0 experience, no sword, no armor, and one axolotl.
- The session plays only as the character it entered. It cannot spend another character's coins, move them, or fight as them.

## Accounts

A player signs in to an account with a username and a password. The password is stored only as a PBKDF2-SHA-256 hash (10,000 rounds, kept low because the Workers Free plan allows 10 ms of CPU per request), so a forgotten password cannot be recovered. Each account has at most two avatars. A character name is still unique in the whole world. Signing in lists those avatars, and playing one enters the world as that character with the coins, gear, level, experience, place, and position already stored. Deleting an avatar removes it, including while it is connected. Characters from before accounts were discarded.

The deployed game is limited on purpose. A secret, `MAX_ACCOUNTS` (6 on the live site), caps the number of accounts; the site is also behind Cloudflare Access, which asks an allowed email address for a one-time PIN before the page loads. See `docs/security.md`.

## Character numbers

The level cap is 6. Experience to the next level is spent when the bar is reached. Leftover experience stays. At level 6, further experience does not raise the level.

| Level | Base HP | Strike | Experience to next |
| --- | --- | --- | --- |
| 1 | 70 | 4 | 10 |
| 2 | 80 | 5 | 15 |
| 3 | 92 | 6 | 20 |
| 4 | 106 | 8 | 30 |
| 5 | 122 | 10 | 40 |
| 6 | 140 | 12 | — |

Total experience from level 1 to level 6 is 115.

Maximum health is base HP plus the worn armor's HP. Current health never sits above that maximum. A new character is at maximum. On level-up, current health increases by the base HP that was gained, then clamps to the new maximum.

The screen shows current and maximum health as a bar and the numbers, for example `54 / 70`. It does not use the word Health. The bar sits at the top left of the window and stays there when the camera moves. The back of the bar is `#5a0d0d` and the fill is `#ff2a2a`. The numbers come from that character's current health and maximum health.

A hit shows a number at the target for about one second. Damage on a monster is white. Damage on a player is red. Each hit is shown once.

A player attack can happen every 0.45 seconds, and the attack stills play (see Controls for what one click does). Strike is base strike plus the worn sword. Damage is that strike, minus nothing from armor. Armor does not reduce damage. It adds maximum health.

## Monsters

Each zone holds **7** of its monster, which is inside the 6–8 band. They are shared by every player. When one dies, another of the same kind appears in that same zone after 5 seconds, in a different spot. The count returns to 7.

| Monster | Zone | HP | Attack | XP | Coins | Aggro |
| --- | --- | --- | --- | --- | --- | --- |
| Wolf | Green | 20 | 5 | 2 | 4 | Only after a player hits it |
| Bear | Grey | 45 | 9 | 5 | 10 | Only after a player hits it |
| Skeleton | Cemetery | 72 | 12 | 10 | 18 | When a player is near it in the cemetery |

A wolf or a bear that has not been hit does not chase. After a hit, it chases and attacks the player who hit it. Leaving the zone or dying clears the aggro.

A skeleton does not wait to be hit. It aggros a player who comes within 100 pixels of it inside the cemetery, then chases. Skeletons do not aggro players who are in town, on the green, or on the grey.

| Monster | Time between attacks |
| --- | --- |
| Wolf | 1.00 s |
| Bear | 0.80 s |
| Skeleton | 0.75 s |

The player's gap stays 0.45 seconds. A monster does not bite on a tick in which it moved. The first bite may land on the tick it is already in reach.

An unaggroed monster patrols from its spawn to the next spawn in that zone, then around the list, slowly: 11 pixels per second for wolves and skeletons, 8 for bears. Chasing is faster (90 pixels per second), and a wolf or bear gives up a chase when it is more than 250 pixels from its spawn. The patrol path is fixed. If the way back to its spawn stays blocked for 1 second, it is placed on its spawn.

While a monster is aggroed, a red glow is drawn behind its head and the head art is drawn on top. That glow is separate from the duel glow. Wolves and bears glow only after a hit. A skeleton glows when a player is within 100 pixels in the cemetery.

If no player is connected, the room does not tick. Monsters do not patrol, chase, bite, or appear in a broadcast. The login screen leaves them frozen. Only monsters in a zone that contains a connected player are stepped. Standing in town does not move wolves, bears, or skeletons. To fit the Cloudflare Free plan the room ticks in memory every 100 ms only while someone is connected, saves positions at most every 1.5 s, and closes a connection that has been idle for a while. A monster that is already chasing a connected player keeps being stepped until that chase ends. Patrol by itself does not write storage.

Walk stills play walk-1, then walk-2, then walk-3, then walk-2 again, about 320 ms a frame. The sprite flips when the path goes left. Standing still uses `stand`. An attack still holds for about 420 ms. The player shows attack-1, then attack-2. Each character is scaled to one height and anchored at the feet. A skeleton is not drawn at a wolf's height. The blacksmith is drawn at the player's height.

Monster attacks use their stills: wolf `stand` / `step` / `bite`, bear `stand` / `charge` / `swipe`, skeleton `stand` / `thrust` / `strike`. Wolves, bears, and skeletons also have walk-1, walk-2, and walk-3.

### Death

Death is real and is kept on the server. A character at 0 health (a monster's bite or a lost duel) is dead and **stays dead where it fell**: it cannot walk, attack, duel, or be woken by the fountain, monsters leave it alone, and every other player sees a cross on that spot. Its own screen shows a death panel; the Respawn button appears after about 1.5 seconds and sends `respawn`, which lands the character in town at full maximum health, keeping level, experience, gear, and coins.

Everything in progress when the avatar dies stops with it: any monster chase on it, any active duel or pending request, its pet's trip to a coin, and a coin it had not picked up (the coin waits on the ground for that owner and its 2.25 seconds start over after the respawn). The browser may keep a display hint, but the server is the only authority.

Deviation from the manager's guidance (report 22), decided by the project owner: if a dead avatar's player leaves with Exit game, the avatar is **not** left dead for the next Play; it rejoins in town at full health. Avatars saved alive in town are unaffected.

### Kills

A monster that reaches 0 dies, grants its experience to the killer, and drops one coin worth its coin value on the ground.

## Coins and the axolotl

Coins are not added to the purse at the moment of the kill. A kill drops one coin at the spot where the monster died, worth that monster's coin value. The ground picture is one icon, `assets/items/coin.png`, on a magenta field that is removed with the other stills. It is not cropped from the axolotl pickup still, and it is not drawn once per point of value.

Every character has one axolotl. It follows that character, using `avatars/axolotl/stand.png` and `walk.png`. The magenta behind those pictures is not part of the world.

Only the killer's axolotl picks up that coin. Another player's pet cannot take it.

The owner may walk away as soon as the monster dies. The pet goes to the coin wherever it lies. The pickup plays `avatars/axolotl/pickup.png` and lasts **2.25 seconds**. When those 2.25 seconds finish, the whole coin value is added to the owner's purse at once. The pet then comes back and follows the owner again. A coin left on the ground stays there for that owner until their pet collects it. If the owner leaves before the pickup finishes, the coin waits and the 2.25 seconds start over when the owner returns.

A coin expires 7 days after it is picked up. Each pickup is its own lot with its own date, spending takes the oldest lots first, and the Bag warns about lots that expire within 2 days. A lot past its date is gone from the purse.

When that coin reaches the owner's purse, a gold "+N" floats up for one second above the coin's last spot. N is the coin's value. Another player's coin does not float for you.

## Shop

The forge sells the only gear. The blacksmith stands at the painted forge, on the courtyard ground inside the walls, at the same height as the player. A thought bubble reading "Armor and weapons" opens the shop. A Bag button opens the inventory. The inventory shows coins, the worn sword, the worn armor, level, health, strike, and experience. An empty sword or armor slot shows that nothing is worn.

Buying spends the coins and puts the item in the account's bag. The bag belongs to the account and is shared by both avatars, but a piece can be worn by one avatar at a time. Buying does not equip. Duplicates are allowed: every copy is its own row. Equipping puts an owned sword in the sword slot or an owned armor in the armor slot, and the piece already in that slot goes back to the bag. Unequipping returns the worn piece to the bag. The bonus belongs to the equipped item: strike is the level's base plus the equipped sword, and maximum health is the level's base plus the equipped armor. Equipping armor raises maximum health and leaves current health where it is. Unequipping armor lowers maximum health and clamps current health down to it. Equipping or unequipping a sword does not change health. Equip and unequip work anywhere. A purchase the purse cannot cover, an unknown item, or a second copy is refused and changes nothing. Selling is not offered.

| Item | Effect | Price |
| --- | --- | --- |
| Short sword | +2 strike | 18 |
| Long sword | +4 strike | 40 |
| Great sword | +7 strike | 70 |
| Leather | +12 maximum HP | 16 |
| Chain | +24 maximum HP | 36 |
| Plate | +40 maximum HP | 64 |

These prices line up with the hunt. Five wolves reach level 2 and pay for the short sword. A level of bears pays for either the long sword or the chain, not both. A level of skeletons pays for either the great sword or the plate, not both. The sword shortens the fight. The armor raises the health the player can lose. That is the gear choice.

## Duels

A duel is player against player and cannot start in town.

- Right-click another player and pick Duel to ask. The asker can Cancel while the request waits. A dead player can neither ask nor accept.
- That player may accept or decline. Decline or cancel ends the request and changes nothing.
- On accept, both players show a red glow and the partner is outlined on hover. Either may then attack the other, using the 0.45 second gap.
- **Fighters are level 3 in a duel.** Each fights with level 3 base health (92) and strike (6) plus their own sword and armor, whatever their real level, on a separate duel health bar (shown as `Duel x / y`). A level 1 character is raised to 3 and a level 5 or 6 is lowered to 3, so farmed gear, not a level lead, decides the fight. Real health, level and experience are not touched by the fight.
- Duels give no experience.
- When a duel bar reaches 0, the loser dies where it fell (the death rules above apply) and gives the winner half of the loser's coins, rounded down.
- Walking into town ends the glow and stops the fight. Coins move only when a duel bar hits 0.

Declining the request is the way out of a mismatch. The balance case is in `docs/balance.md`.

## What must persist

For each character, the server remembers name, gender, level, experience, current health (0 means dead), maximum health, coins (as dated lots), sword, armor, place, and position. The account remembers its shared bag. The shared zones remember their living monsters and coins still on the ground. A reload returns the same character to the same facts. Other players' movement, fights, and coin drops appear on the same map.

## Delivery bar from proj_A

- The world has both hunts and duels, and both follow the tables in this document.
- Coins and gear have one owner. A reload does not reset them.
- Login chooses the character, and one session cannot act as another.
- The same numbers drive play and a reproducible simulation. The simulation runs the hunt and duel rules from level, gear, and monster, and prints health, experience, and coins. It does not use a second set of numbers.
- The game is playable in a browser at a deployed HTTPS URL. Failures and limits are reported as they are, not smoothed over.

## Art on hand

Present and used:

- `assets/maps/world-map-wide.jpg` as the measuring frame
- `assets/maps/world-ground.jpg` and the town and cemetery overlays as the play stack
- Woman and man: stand, walk-1, walk-2, walk-3, attack-1, attack-2, pickup
- Wolf, bear, skeleton: the attack stills named above, plus walk-1, walk-2, and walk-3
- Axolotl: stand, walk, pickup
- `assets/items/coin.png` for a coin on the ground
- Blacksmith stand

Not required for these rules: `map.jpg`, `world-map.jpg`, cottage, tall house, `houses/forge.png` as a separate draw, and `avatars/warrior/` (no walk cycle, so it is not a gender).

The fountain is the well painted on the town. There is no separate fountain sprite. Sprite files are large and different sizes, on a magenta field. Each kind is scaled to one height, and the magenta is removed before the still is shown.

## Hosting

Chosen and built: a Cloudflare Worker with one Durable Object (`WorldRoom`) for the live world and D1 for accounts, avatars, items and coin lots. The live site is behind Cloudflare Access. Setup, deployment and the access model are in `README.md` and `docs/security.md`; known limits are in `docs/limits.md`.
