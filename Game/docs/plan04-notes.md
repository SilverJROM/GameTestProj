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
