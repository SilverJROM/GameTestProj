# Plan 04 evidence

Checked 2026-11-11 (PHT) in the real Chrome through the Claude in Chrome extension against `wrangler dev` on 127.0.0.1:8787,
plus automated tests. GIFs are in `docs/plan04-gifs/`; the screenshot is `docs/mockups/screenshots/plan04-duel-winner-bag-expiry.jpg`.
The extension was used for every browser check below, except the duel (see the note).

## A. Coins
- Seeded a test avatar with lots aged 1, 5.5, 6.5 and 8 days (10, 8, 12 and 9 coins). On join the 8-day lot (9 coins) was removed: Coins 30.
  The Bag line read "20 coins expire within 2 days." and the tooltip "12 in 12 hours, 8 in 2 days". Items worn by the other avatar of the
  account show greyed "Worn by JROMTEST".
- Duel (Duelist beats Victim in the green): Victim held 10 @ 6.5 d, 10 @ 5 d, 20 @ 1 d (40 coins); the pot is 20. The random draw took 4, 4 and 12;
  the Duelist received them under the same ages (4 @ 6.5 d, 4 @ 5 d, 12 @ 1 d, plus its own 12 @ 2 d = 32), Victim kept 6, 6, 8 (20 coins) and landed in town.
  The winner's Bag then showed "8 coins expire within 2 days." with tooltip "4 in 12 hours, 4 in 2 days" (screenshot).
  Note: the duel itself was sent over the real websocket by `docs/plan04-tools/duel-run.mjs` (the extension's right-click did not start the duel offer in the
  tabs), and the result was read in the extension. Opus found and I fixed races in the payout (see the tracker).

## B. Menu and settings
- M opens the menu (Change avatar, Settings, Log out, Close); Esc closes it. The bag icon replaces the word "Bag" and opens the Bag; the Bag shows (B).
- Settings: resolution Small/Medium/Large/Fit window/Fullscreen; music 25 and effects 35 by default; Mute all; shortcuts Bag B, Menu M, Settings S, Reset.
  Rebinding Bag to V worked and persisted (`pl-settings`); the old B key then did nothing; binding Menu to V was refused ("Already used by Bag.").
- Presets measured on the canvas in a 1502x615 window: Small 960x540, Medium 1280x720, Large 1502x845 (width capped at the window, so taller than the window),
  Fit window 1093x615.
- Log out and Change avatar reload the page; after the session was replaced the page showed the sign-in screen.

## C. Sound
- Page resource list: town.mp3 loaded in town, fields.ogg when the avatar walked out to the green, town.mp3 again on return.
- A volume hook on the audio elements showed the crossfade when crossing the border: town 0.25 -> 0.013 and fields 0.038 -> 0.25 over about 2.0 s,
  starting about 0.5 s after the crossing, the two always adding to about 0.25 (the music volume).
- Creature and combat effects are covered by `test/unit/sfx.test.ts` (14 tests); not heard by the assistant.

## D. Route walking
- From inside the town the avatar clicked a spot outside the east wall: it went out by the south gate and ended at the click (638, 455, green).
  Clicking back inside the courtyard from outside brought it back through the gate to (349, 472), inside the walls. GIF `route-through-gate.gif`.
- `test/unit/route.test.ts`: 10 start/target pairs, shortest-route check, wall-click snap, 150 random pairs, plan cost.

## E. Monsters
- 7 spawns per zone at the centres of seven equal parts; patrol coverage within 45 px of some path: green 86%, grey 92%, cemetery 100%.
- In the browser the wolves and bears are spread over the zone, move visibly (wolves about 60-100 screen px in 10 s), stay clear of each other. GIF `monsters-spread-patrol.gif`
  was recorded while the dev server was still restarting every second (see below), so it shows them nearly still; the later screenshots show them moving.
- Found and fixed a pre-existing local-server bug: `scripts/build-client.mjs` rewrote `src/client/shell.generated.ts` on every build and `wrangler dev` watches that
  file, so the local server rebuilt and restarted about once a second (369 reloads in one session), resetting the game room every time. That froze monsters and
  explains the tiny patrol movement measured in plan 03. The build now writes only when the content changed.

## Tests
- `npm test`: 51 files, 523 tests (after the last change).
