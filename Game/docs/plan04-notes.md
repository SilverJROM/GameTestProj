# Plan 04 notes (not started)

Logged 2026-11-10 22:30 system clock (about 06:30 PHT 2026-11-11). Nothing here is built. The developer said not to start until they say so.

## Coin expiry refinement: decisions from the developer

- Every coin carries its own date stamp and 7-day expiry (stored as lots: coins gained together share one stamp).
- Losing coins in a duel: the loss is picked at random across all of the loser's coins, not oldest first.
- Coins won in a duel keep their old stamp and expiry. They do not get a new seven-day clock. This reverses the plan 03 rule
  "duel winnings are new lots dated at the duel", and it answers the open QA question about duel winnings.
- Spending at the forge: coins closest to expiry go first (unchanged).
- Warning window: 2 days.
- Indicator: Bag only. One line, shown only when coins expire within 2 days (for example "12 coins expire in 2 days",
  "expire today" under 24 hours); hidden otherwise. A hover tooltip lists at most 3 groups. No HUD dot.
- Client receives only the count expiring within the window and the soonest time.

Open point to confirm: "yes in bag only" was read as "show the indicator in the Bag only, with no HUD dot".

Implementation notes for later: transferred coins need their original stamps kept on the winner's side (lots move with their
stamp, merged only when the stamp is identical); the winner's lots from a duel must still be expired by the sweep at their old
time; `coinExpiryText` and `nextExpiry` change from "oldest group" to "total in the window"; tests for the random draw
and for transferring lots with stamps.

## Other improvements the developer wants to add

Logged 2026-11-10 (system clock). Not started.

### 1. Game menu and Bag icon (developer request)

- A three-line (hamburger) button in the upper right, beside the Bag. Clicking it opens the menu.
- Menu items: Exit game, Log out, Exit character (back to picking avatars), Settings.
- Settings: game resolution; sound (new, to be added); shortcuts (keys for Bag, Menu, and so on).
- Replace the word "Bag" with a bag icon; clicking the icon opens the Bag modal.

Questions to settle before building:
- "Exit game": a browser tab cannot close itself unless the game opened it. Options: return to the sign-in screen,
  or show a "you can close this tab" screen. Is that fine?
- Exit character versus Log out: Exit character keeps the account signed in and shows the avatar picker; Log out ends
  the session. Both should leave the world cleanly (the avatar disappears for other players). Confirm.
- Resolution: the game is already sized by the zoom slider. Do you mean a few presets (for example Small, Medium, Large,
  Fit window, Fullscreen), or exact sizes? Does it replace or sit beside the zoom slider?
- Sound: no audio exists yet. For now only a volume slider and a mute toggle, with the sounds themselves (steps, hits,
  coin, menu clicks) as a later step? Where do sound files come from (the same Grok provenance question applies)?
- Shortcuts: which actions get keys, and which defaults (for example B Bag, M Menu, Esc close)? Can the player rebind them,
  or only see them?
- Saving: store settings per account on the server, or per browser? Recommendation: per browser to start.
- Is the Bag icon drawn like the coin and items (Grok generated), or a plain vector icon? A plain vector icon avoids a new
  asset provenance item.

### Menu answers (developer, 2026-11-10) and the agreed design

1. No "Exit game"; Log out only (returns to the sign-in screen).
2. "Exit character" is renamed "Change avatar" (stays signed in, shows the avatar picker).
3. Resolution presets are added; the zoom slider stays beside them.
4. Sound: find free-to-use sounds. Three ambient tracks (town joyful, fields active/adventure, cemetery gloomy); sword sound when attacking;
   stab sound when being attacked; one wolf, one bear, one skeleton sound. Volume slider and mute are part of Settings.
5. Shortcuts can be rebound.
6. Settings are saved per browser.
7. The bag icon is generated as a small vector bag icon (no new asset provenance item).

### Sound candidates found online (not downloaded; licenses must be checked on each page before use)

Searched OpenGameArt and Kenney listings on 2026-11-10. Listed license is what the search result said; confirm on the page.

- Town (joyful): "Town Theme RPG" by cynicmusic (CC0); "Sideways City" by Zane Little Music (CC0, chiptune, cheerful).
- Fields (adventure): "Fairy Adventure" by MintoDog (CC0, loopable); "JRPG Pack 1 Exploration" by SubspaceAudio (CC0); "Flowerbed Fields" (CC0, chiptune).
- Cemetery (gloomy): "Kokopelli's Graveyard Theme" (CC0, may not loop cleanly); "Lonelyhood" by yd (CC0, loop); "Abandoned passages" (CC0 loop).
- Sword and stab: Kenney Impact Sounds (CC0); "50 RPG sound effects" by Kenney (CC0); "150 Combat Sound Effects" (CC0, melee set, unconfirmed).
- Wolf: "Wolf Monster Sound" (CC0, a processed horse snort, so more of a cry than a growl); "Monster or beast sounds" (CC0, growls).
- Bear: "Bear Growls" (CC0, U.S. Fish and Wildlife Service; growls, not a roar).
- Skeleton: nothing found yet. Options: a bone rattle from a CC0 pack, or a short synthesized clatter we make ourselves.
- Avoid: "Dark Ambience Loop" (CC-BY/GPL) and "Monster and Creatures Sound Effects Pack 001" (CC-BY 3.0) unless you accept the credit line.
- Every sound used goes into docs/asset-provenance.md with its page link and license, and downloading each file needs your yes.

### Sound behaviour (developer, 2026-11-10) — confirmed design, not started

- Developer approved the downloaded sounds.
- Settings has separate volume sliders for background music and for effects (the "active" sounds), each configurable, plus mute.
- Defaults are light: low volume for both (proposal: music 25%, effects 35%), not loud. Saved per browser.
- Creature sounds (wolf, bear, skeleton): only one creature sound plays at a time on the player's device, even with several
  enemies nearby, so they never overlap or get busy. While one is playing, other creature sounds are skipped (not queued).
- A creature sound plays when the player is close to that enemy or fighting it: within 2 to 3 times the melee reach.
  Melee reach is 48 px, so the trigger distance is about 96 to 144 px (proposal 120 px, 2.5x).
- Proposal for the details: the nearest enemy inside that distance is the one that plays; each creature repeats no faster than
  about once every 6 seconds; the sword sound (when you attack) and the stab sound (when you are hit) follow the same
  one-at-a-time rule among themselves, but a hit sound may cut in over a creature sound.

### Sound details confirmed (developer, 2026-11-10)
Creature sounds repeat no faster than once every 6 seconds; the sword sound is included in the plan.

### 2. Best-route walking (developer request, review done, not started)

Request: when the player clicks a place, the game should work out the best way there. Example: clicking outside the town from
inside should send the avatar through the town gate and then out to the spot, not into the wall.

Review of what exists (`papayaGateBend` in `src/rules/regions.ts`, used by `src/world/core.ts`):
- It is a one-bend rule. If the straight line crosses a solid wall, it tries the two gates (town, cemetery) and uses one only if
  start -> gate middle and gate middle -> target are both straight and clear. Otherwise there is no route and the avatar walks
  the straight line and slides along the wall.
- So it fails when the way needs two or more bends: a start spot from which the gate is not in a straight clear line, a
  target outside that needs to go around a wall corner after the gate, or walls, houses and the fountain in between.
- It aims at the gate middle point, not the best crossing line.
- A click inside a wall or house has no rule (the avatar just pushes against it).
- Not yet reproduced with numbers; the first step would be to measure many start/target pairs, as done for the gates.

Proposed fix (to discuss):
- Build a walkable grid from the solid walls, gates, houses and fountain (cells about 16 px, with the avatar's width kept clear
  of walls), and find the shortest path with A* on the server when a click arrives, then straighten the path so it has few turns.
- The path is a list of waypoints the existing walking code follows. Click-to-fight chase uses the same path to reach an enemy.
- A click on a blocked spot goes to the nearest reachable spot.
- If no route exists, the avatar stays put and the client shows no walk marker.
- The grid is built once at start-up. One search per click is cheap on the server.
- Tests: a table of start/target pairs (inside to outside, outside to inside, cemetery, around houses) that must reach the target
  with no wall contact and a path length within a small margin of the best; a regression run in real Chrome.
Size estimate: about 1 to 1.5 hours with a Sonnet check, because it touches the walking core.
Questions: should the client draw the planned path as a faint dotted line, or just show the click marker?

### 3. Enemy spacing, spread and speed (developer request, review done, not started)

Request: monsters jump on each other. Sprites may overlap at best 2 at a time in one frame, never one on top of the other (clear
view of each). Spread them to cover about 80 to 90% of their section. Patrol slower; normal speed only when aggro (attacking).

Review (code and constants, nothing measured in the browser this time):
- Patrol is already slower than chase: `monsterPatrolSpeedPxPerSec` 40, chase 90, player walk 120. If it still looks fast, the
  likely cause is the animation (walk frames swap at a fixed rate) or the client glide, not the patrol speed. Needs a look.
- Each monster patrols a disk around its own spawn, with the radius capped at 70 px (`patchCapPx`) and 45% of the gap to the
  nearest spawn (`patchGapShare`). Spawn spacing is only about 80 to 130 px, so the disks cover a small part of each section.
  That is why the monsters bunch near their spawns, and why plan 03 measured 56 px as the closest pair.
- Spawns: green 9 wolves, grey 7 bears, cemetery 8 skeletons. Sprite heights are wolf 34, bear 48, skeleton 58 px (widths follow the pictures).
- There is no separation between monsters, so two can walk onto the same spot. Drawing order is by feet, so they stack and flicker.
- Covering 80 to 90% of a section means longer, wider routes, which makes meeting more likely, so the spread needs an avoidance
  rule, not only larger disks.

Proposed fix (to discuss):
- Give each monster a larger roaming area: sections are divided into one cell per monster (Voronoi-style, from the section shape), the patrol route runs
  through that cell, and together the cells cover 80 to 90% of the section.
- Add a separation rule on the server: a monster will not move closer to another than a minimum centre distance of about 55% of the
  larger sprite's width (so sprites overlap at most partly and each stays clearly visible), and never lets a third sprite into a pair.
- Patrol speed becomes a setting: proposal 25 px/s (about 60% of today), walking frames slowed to match; aggro speed stays 90.
- A monster that is chasing and loses the player returns to its cell at patrol speed.
- Tests: a long simulation (all monsters for 10 minutes) that records the closest pair, the number of triple overlaps (must be 0),
  the share of the section visited, and the speed in each state; a real-browser look at the three zones.

Questions for the developer:
1. How strict is "at most 2 overlapping"? Proposal: pairs may overlap by up to 40% of the narrower sprite, no triples, and the server keeps them apart.
2. Is 25 px/s the right slow speed (about 1 body length per second)? Or slower?
3. What counts as aggro today (a player within sight starts a chase)? Keep as is, and how far should they chase before giving up?
4. Do monsters spread over the whole section including near the gates and paths, or should a safe margin stay free near the town and gates?
5. Same rules for all three monsters (wolf, bear, skeleton), or should bears (slower, larger) move even slower?

### Item 3 answers (developer, 2026-11-10) — confirmed design, not started

1. Overlap rule accepted: a pair may overlap by up to 40% of the narrower sprite, never a third, never 1 to 1.
2. Patrol speed 10 to 12 px/s. Chosen: wolf 11, skeleton 11, bear slower at 8 (the developer said the bear is slower). Chase stays 90.
3. Aggro: the skeleton wakes at 100 px (today 120, `skeletonRadiusPx`). Wolf and bear chase up to 250 px from where the chase began (or from their cell; to be settled), then give up and walk back at patrol speed.
4. Spread over the whole section, with no free margin near gates or paths (answer was "yes"; confirm this reading).
5. Bear slower than wolf and skeleton.

Facts found while checking (corrections to the earlier review):
- Each monster type has 7 in its zone (`count: 7` in `tables.ts`). The earlier "9 wolves, 8 skeletons" were spawn points, not monsters.
- Wolf and bear aggro is by hit only today (they chase after being hit), the skeleton by proximity. There is no chase limit now; a chase ends only when the target is gone, dead or outside the zone. The 250 px limit is new.
- With no gate margin, monsters can stand in a gate. Safe by the zone rule today (town is never entered: the town, green and grey figs are never skeleton targets), but a monster blocking a gate route is a risk for best-route walking (item 2).

### Item 3 final answers (developer, 2026-11-10)
- The 250 px chase limit for wolf and bear is measured from the monster's home (its roaming area), not from where the chase began.
- Gate openings are kept clear of monsters (patrol cells and the avoidance rule keep monsters out of the gate openings); elsewhere they spread over the whole section.
- The skeleton has no chase limit.
- Item 3 is settled and ready to build when the developer says go. Next topic: sound (the developer wants to talk about it again).

### Background music rule (developer, 2026-11-10)
The background track follows the section the player's avatar is in, with a 2 second fade when the section changes.
Design: the track is picked from the avatar's zone (town, green, grey, cemetery); on a change, the old track fades out and the new one fades in over 2 s (crossfade).
Details to settle: the grey zone (bears) has no track of its own (we have town, fields, cemetery); a small delay so crossing a border back and forth does not flip the music; tracks loop; the music starts on the first click or key press (browser rule).

### Background music answers (developer, 2026-11-10)
- Grey zone uses the fields track (continues across the green/grey border, no fade there).
- A short delay (about 0.5 s) before a zone change starts the fade.
- Music starts on the first click or key press after sign-in.
- Sign-in and avatar picker are silent for now.
- Music pauses when the browser tab is hidden.
