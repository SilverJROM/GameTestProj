# Plan 02 status tracker

Recovery file. If the session closes (out of memory, suspend, crash), read this first, then `docs/plan02.md` for the full plan. Update this file after every slice event: started, passed, failed.

Last updated: 2026-11-10 07:00 UTC

## Where things stand

| Item | Value |
| --- | --- |
| Working branch | `update-02` (cut from `main` at `c30f690`) |
| Old branch | `candidate-work` deleted on 2026-11-10 (it was fully merged, was at `ab9db1f`) |
| Base commit for this update | `c30f690` "Add walk frames, ground map, overlays, approved mockups, and plan 02." |
| Overall | 86% (slices 0 to 11 done, 12 of 14; slice 12 waits for the user's approval of the slice 9 pictures) |
| Pushing / deploying | Not allowed. Push is disabled. No Cloudflare deploy in this plan. |

## Topology

- **Implementer:** Grok 4.7, run headless: `grok -p "$(cat docs/plan02-slices/slice-N.md)" -m grok-4.7 --always-approve --cwd /home/candidate/ProjA/Game`. Grok does not run git write commands.
- **Reviewer and tester:** Claude Sonnet 5.5. Reads the diff, runs `npm test`, and checks in the browser with Playwright on the installed Google Chrome (the Claude Chrome extension is not connected to the session).
- **Commit:** Claude commits one slice at a time, after PASS. A slice that fails review three times stops the run and gets reported.
- **Update format:** every update to the user ends with one last line: `date time PHT · % complete · ETA`. PHT is Philippine time, UTC+8 (Asia/Manila). The tracker's own timestamps below are in UTC.

## Slices

Status values: `done`, `in progress`, `pending`, `waiting for user`, `blocked`.

| Slice | What | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| 0 | Repair the 5 tests that already fail on a clean tree | **done** | `a311f2b` | Tests only. Grok found the town wall, monster patrol, HP ladder, and attack gaps had made them stale. 286 passed. |
| 1 | All avatar heights x 0.6 | **done** | `9b5abff` | `sprites.ts` table 58/48/34/24; test pins round(old*0.6). 287 passed. Regenerated `shell.generated.ts` is committed with it. |
| 2 | Zoom: 60 percent default, 75 percent max, right-edge slider | **done** | `ca68728` | `ZOOM_CLOSE/ZOOM_FAR` in `tables.ts`; area-share `viewBox`; `#zoom-slider` (top 60, bottom 75), saved in `localStorage` `game.zoom`. 307 tests pass. Checked in Chrome: hidden on login, slider presses do not move the player, setting survives reload, ground clicks still walk. Plan table fixed for cemetery 75% (436x245). Note for slice 11: the blacksmith thought bubble is a fixed 220x64 and now looks large next to the smaller avatars. |
| 3 | One coin per kill with a value, pickup 2.25 s, gold "+N" | **done** | `793c547` | One seed per kill (value 4/10/18), `stepPickups` credits the whole value, client floats gold "+N" for your own coin. 314 tests pass. Checked in Chrome: wolf kill gave 1 coin, purse 0 to 4 in about 2.1 s; bear 0 to 10 in about 2.0 s; EXP also rose (2 and 5); the pet is back beside the owner afterwards. |
| 4 | Failing test first: open Bag, kill a wolf, numbers must change | **done (merged into slice 5)** | `f3e5b31` | Written first by Grok and confirmed failing (Bag stayed at `Experience 0 / 10` after XP 2) so no red commit exists. |
| 5 | Live Bag and Blacksmith panels, Close buttons, HUD | **done** | `f3e5b31` | Open panels follow every snapshot; Close button, Escape, and Bag toggle; HUD `Lv / XP / Coins` under the health bar. 319 tests pass. Checked in Chrome: bag open during a kill went `Experience 0/10` to `2/10`, coins `0` to `4` without reopening; Close and Escape work. Known cosmetic: the zoom slider overlaps the open Bag panel (fixed when the panels are rebuilt as centered panels in slices 11 and 12). Buying still closes the shop (to change in slice 11). |
| 6 | Migration 0002 (accounts, wipe old data), password hashing, account routes; **merged with slice 7** (avatar routes, delete, play) | **done** | `51c46f1` | 336 tests pass. Checked against a running server: create/sign in/out, duplicate username (any case) 409, 2-avatar cap holds under 3 quick adds, name taken 409, other account's avatar 404 on play and delete, account cookie rejected as a character cookie, deleting a connected avatar closes its socket (4000), generic sign-in failure (266 ms either way), old `/api/login` 404. PBKDF2 10,000 iterations (about 17-37 ms locally). Known gap, fix in slice 8: coin seeds a deleted avatar left on the ground are never collected (only connected owners dig). |
| 7 | Avatar routes: add, delete, play, 2 per account | **done (merged into slice 6)** | `51c46f1` | |
| 8 | Sign-in, avatar list, add and delete screens (+ clear a deleted avatar's ground coins) | **done** | `a782f85` | 344 tests pass. Checked in Chrome: wrong sign-in shows the generic message and clears the password box; create account; add Ayla (blank name refused); Man switches the preview; two slots filled and no Add button at 2; Delete needs a second click and reverts after 4 s; reload keeps you signed in and shows the avatars; Play enters the game with the zoom slider. Deleted avatar's ground coins are cleared. `docs/plan02-tools/investigate.mjs` still uses the old login (throwaway). |
| 9 | New mockup sections 12-14 (Blacksmith with Owned, inventory with item row, drag state) plus approval pictures | **done, waiting for user approval** | `0c3c1ce` | Pictures: `docs/mockups/screenshots/approval-shop-owned.png`, `approval-inventory-items.png`, `approval-inventory-drag.png`. **Slice 12 does not start until the user approves them.** |
| 10 | Item bag data: `character_items`, buy-to-bag, equip, unequip (+ minimal click-to-equip in the plain Bag panel) | **done** | `0c3c1ce` | 351 tests pass. Checked in Chrome: buying Short sword and Leather puts them in the bag, coins 100 to 66, Strike stays 4; shop rows read `(Owned)`; click-equip Short sword gives Strike 6; equip Leather gives max HP 70 to 82 with HP staying 40; clicking the worn slot lines unequips (max HP back to 70, Strike back to 4). |
| 11 | Blacksmith panel from the mockup, with "Owned"; panel stays open after buying; smaller thought bubble | **done** | see git log | 353 tests pass. Checked in Chrome: centered 860 px panel; rows Buy / Need N coins / Owned as in the mockup; one Buy click leaves the panel open with coins 48 to 30 and Short sword Owned; Escape closes; bubble now 140x42. Cosmetic follow-up for slice 12: the bubble text touches the box edges, widen to about 156x42. |
| 12 | Bag panel from the mockup, item row, drag and click to equip (+ widen the thought bubble to about 156x42) | **waiting for user** | - | Needs the user's approval of `approval-shop-owned.png`, `approval-inventory-items.png`, `approval-inventory-drag.png`. |
| 13 | Screenshots of the running game in Chrome | pending | - | `docs/mockups/screenshots/running-*.png` |

## Decisions already made (details in `docs/plan02.md`)

- Every avatar 40 percent smaller; player 58 px, skeleton 58, blacksmith 58, bear 48, wolf 34, pet 24. Coin stays 40 px.
- Zoom: default view is 60 percent of the section's area, slider on the right goes to 75 percent, remembered in the browser.
- One coin per kill, worth the monster's coin value; pet picks it up in 2.25 s and follows again.
- Accounts: username and password (8+ characters, no recovery), 2 avatars per account, delete has a confirmation.
- Fresh start: migration 0002 deletes all old characters and the saved world.
- Items go into a bag; equip and unequip by drag (click as fallback); bonus belongs to the equipped item; equipping armor raises max HP only.

## Facts worth keeping

- Baseline before any change: 5 tests fail, repeatably (`duel.test.ts` 1, `room-core.test.ts` 1, `duel-fight.test.ts` 3).
- EXP and coin cause (confirmed): `onBag` and `onSmith` in `src/client/main.ts` fill the panels once when opened and never refresh them. The server is correct.
- Running the real game: `docs/plan02-tools/investigate.mjs` boots `wrangler dev --local` with a temporary local D1, drives Chrome with Playwright, and prints XP, coins, and gear checks. Run from `Game/` with `node docs/plan02-tools/investigate.mjs`.
- Existing helper: `scripts/running-shots.mjs` takes the running-game screenshots.
- Test command: `npm test` (Vitest) with the default worker count. It takes about 100 seconds and keeps at least 3.4 GB of memory free. Do NOT pass `--maxWorkers=2`: it made 18 timing-sensitive integration tests fail (they pass alone and with the default).
- Memory: the machine has 7.2 GB RAM and 8 GB swap. Chrome (about 2.1 GB, the extension-install window) is the largest non-critical process. Close it first if available memory falls under about 1.5 GB. A logger writes to the session scratchpad `mem.log`.
- Waiting for a Grok run: do not use `pgrep -f "grok -p"` (it matches its own shell). Launch with a `.done` marker file and wait on that.

## How to resume after a crash

1. `cd /home/candidate/ProjA && git status && git log --oneline -5` and check you are on `update-02`.
2. Check for a Grok run that is still going: `pgrep -af "grok -p"`. If one is running, wait for it. If its output is gone, discard its half-finished changes with `git restore .` only after reading `git diff`, then start the slice again.
3. Find the first slice here that is not `done`. If its changes are in the working tree but not committed, review them with `git diff` and run `npm test`. If they pass, commit and mark the slice `done` with the commit id.
4. Start the next slice with the command in the Topology section. Each slice's instruction file goes in `docs/plan02-slices/slice-N.md`.

## Notes

- Grok's reports end with "QA Questions" and sometimes "Manager's Guidance/Suggestions" relayed from the evaluation check-in service. These are not part of the user's plan and are not acted on. Slice 11's report relayed two such suggestions (a shared account-wide item bag; coins that expire after seven days). They were deferred by Grok and not built. Ask the user before building anything from them.
