# Game requirements

Source: `Game/docs/proj_A.md`, plus the rules confirmed in this session. Status: **written for confirmation. Planning has not started.**

This document replaces `Game/docs/briefing_A.md` for project A. The older sheet (one sword, one armor, wolves only, one-shot arena duel, no levels) is not the rule set.

Route: **persistent economy.** One shared ongoing world. Players hunt, earn coins, buy gear, and duel. State survives a reload.

## World

The playfield is `assets/maps/world-map-wide.jpg` (1280×720). `map.jpg` and `world-map.jpg` are not the playfield.

| Region | Where on the picture | What lives there |
| --- | --- | --- |
| Town | Lower left, inside the walls | Start, forge, fountain. No monsters. No duels. |
| Green fields | Lower right | Wolves |
| Grey ground | Upper right | Bears |
| Cemetery | Upper left | Skeletons |

Click the ground to walk. The walk stills play while the character moves. The player starts in town after login.

The fountain is the courtyard well painted on the town. Clicking it sets that player's health to their current maximum. It costs nothing and has no cooldown. It does not revive a player who is already at 0.

The shop is the forge in town. Clicking it opens the smith. The blacksmith still may stand there. `houses/cottage.png` and `houses/tall.png` are spare art and are not required.

## Login

The first screen is character setup, before the map.

- The player picks a gender and types a name.
- Genders are woman and man. Woman uses `avatars/warrior-f/`. Man uses `avatars/warrior-m/`. Gender changes the pictures only.
- A blank name, including a name that is empty after trim, is refused and creates nothing.
- Names are unique in the world after trim, compared without case. "Bob" and " bob " are the same character.
- An existing name enters as that character and does not reset level, experience, coins, gear, or place.
- A new name creates a level 1 character in town, with full health, 0 coins, 0 experience, no sword, no armor, and one axolotl.
- The session plays only as the character it entered. It cannot spend another character's coins, move them, or fight as them.

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

Maximum health is base HP plus the worn armor's HP. Current health never sits above that maximum. A new character is at maximum.

One click is one attack. A player attack can happen every 0.45 seconds, and the attack stills play. Strike is base strike plus the worn sword. Damage is that strike, minus nothing from armor. Armor does not reduce damage. It adds maximum health.

## Monsters

Each zone holds **7** of its monster, which is inside the 6–8 band. They are shared by every player. When one dies, another of the same kind appears in that same zone after 5 seconds, in a different spot. The count returns to 7.

| Monster | Zone | HP | Attack | XP | Coins | Aggro |
| --- | --- | --- | --- | --- | --- | --- |
| Wolf | Green | 20 | 5 | 2 | 4 | Only after a player hits it |
| Bear | Grey | 45 | 9 | 5 | 10 | Only after a player hits it |
| Skeleton | Cemetery | 72 | 12 | 10 | 18 | When a player is near it in the cemetery |

A wolf or a bear that has not been hit stands and does not chase. After a hit, it chases and attacks the player who hit it, and it swings every 2 seconds while that player remains in the same zone. Leaving the zone or dying clears the aggro.

A skeleton does not wait to be hit. It aggros a player who comes near it inside the cemetery, then chases and swings every 2 seconds. Skeletons do not aggro players who are in town, on the green, or on the grey. The exact pixel radius is measured on the 1280×720 map during planning. The rule is proximity inside the cemetery, not the whole zone at once.

Monster attacks use their stills: wolf `stand` / `step` / `bite`, bear `stand` / `charge` / `swipe`, skeleton `stand` / `thrust` / `strike`.

At 0 health the character returns to town at full maximum health and keeps level, experience, and gear. A monster that reaches 0 dies, grants its experience to the killer, and drops its coins on the ground.

## Coins and the axolotl

Coins are not added to the purse at the moment of the kill. They fall on the ground as one token per coin.

Every character has one axolotl. It follows that character, using `avatars/axolotl/stand.png` and `walk.png`. The magenta behind those pictures is not part of the world.

Only the killer's axolotl picks up that kill. Another player's pet cannot take those coins.

The pet picks up one coin at a time. Each pickup plays `avatars/axolotl/pickup.png` and lasts **4 seconds** (inside the 3–5 second range). When those 4 seconds finish, one coin is added to the owner's purse. The pet then starts the next coin. Coins left on the ground stay there for that owner until their pet collects them.

## Shop

The forge sells the only gear. Prices are paid from the purse in full. The player wears one sword and one armor. Buying a new piece replaces the worn one. There is no refund.

| Item | Effect | Price |
| --- | --- | --- |
| Short sword | +2 strike | 18 |
| Long sword | +4 strike | 40 |
| Great sword | +7 strike | 70 |
| Leather | +12 maximum HP | 16 |
| Chain | +24 maximum HP | 36 |
| Plate | +40 maximum HP | 64 |

A purchase the purse cannot cover is refused and changes nothing. Selling is not offered.

These prices line up with the hunt. Five wolves reach level 2 and pay for the short sword. A level of bears pays for either the long sword or the chain, not both. A level of skeletons pays for either the great sword or the plate, not both. The sword shortens the fight. The armor raises the health the player can lose. That is the gear choice.

## Duels

A duel is player against player and cannot start in town.

- Right-click another player to ask.
- That player may accept or decline. Decline ends the request and changes nothing.
- On accept, both players show a red glow. Either may then attack the other. One click is one attack, using the same strike and the same 0.45 second gap as a monster fight.
- Duels give no experience.
- At 0 health, the loser returns to town at full maximum health, keeps level, experience, and gear, and gives the winner half of the loser's coins, rounded down.
- Walking into town ends the glow and stops the fight. Coins move only when a duelist hits 0.

A higher level with a better sword beats a new character quickly. Declining the request is the way out of a mismatch.

## What must persist

For each character, the server remembers name, gender, level, experience, current health, maximum health, coins, sword, armor, and place. The shared zones remember their living monsters and coins still on the ground. A reload returns the same character to the same facts. Other players' movement, fights, and coin drops appear on the same map.

## Delivery bar from proj_A

- The world has both hunts and duels, and both follow the tables in this document.
- Coins and gear have one owner. A reload does not reset them.
- Login chooses the character, and one session cannot act as another.
- The same numbers drive play and a reproducible simulation. The simulation runs the hunt and duel rules from level, gear, and monster, and prints health, experience, and coins. It does not use a second set of numbers.
- The game is playable in a browser at a deployed HTTPS URL. Failures and limits are reported as they are, not smoothed over.

## Art on hand

Present and used:

- `assets/maps/world-map-wide.jpg`
- Woman and man: stand, walk-1, walk-2, walk-3, attack-1, attack-2, pickup
- Wolf, bear, skeleton: the stills named above
- Axolotl: stand, walk, pickup (the pickup still already shows a coin in its hand)
- Blacksmith stand, forge picture

Not required for these rules: `map.jpg`, `world-map.jpg`, cottage, tall house, and `avatars/warrior/` (no walk cycle, so it is not a gender).

Gaps, small enough to settle in planning:

- No separate coin picture for a coin lying on the ground. The coin graphic exists only in the axolotl pickup still.
- No separate fountain sprite. The fountain is the well painted on the town.
- Sprite files are large and different sizes, on a magenta field. They need one on-map scale and the magenta removed. That is production work, not a missing rule.

## Not decided here

The host and the storage engine are not chosen. `proj_A.md` requires a saved shared world and a deployed HTTPS game. It does not name the vendor. Planning picks that, after this document is confirmed.
