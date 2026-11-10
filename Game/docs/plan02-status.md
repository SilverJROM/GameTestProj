# Plan 02 status tracker

Recovery file. If the session closes (out of memory, suspend, crash), read this first, then `docs/plan02.md` for the full plan. Update this file after every slice event: started, passed, failed.

Last updated: 2026-11-10 03:45 UTC

## Where things stand

| Item | Value |
| --- | --- |
| Working branch | `update-02` (cut from `main` at `c30f690`) |
| Old branch | `candidate-work` deleted on 2026-11-10 (it was fully merged, was at `ab9db1f`) |
| Base commit for this update | `c30f690` "Add walk frames, ground map, overlays, approved mockups, and plan 02." |
| Overall | 14% (slices 0 and 1 done, 2 of 14) |
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
| 1 | All avatar heights x 0.6 | **done** | see git log | `sprites.ts` table 58/48/34/24; test pins round(old*0.6). 287 passed. Regenerated `shell.generated.ts` is committed with it. |
| 2 | Zoom: 60 percent default, 75 percent max, right-edge slider | pending | - | `src/client/camera.ts`, `index.html`, `main.ts` |
| 3 | One coin per kill with a value, pickup 2.25 s, gold "+N" | pending | - | `monsters.ts`, `pets.ts`, protocol, client |
| 4 | Failing test first: open Bag, kill a wolf, numbers must change | pending | - | |
| 5 | Live Bag and Blacksmith panels, Close buttons, HUD | pending | - | |
| 6 | Migration 0002 (accounts, wipe old data), password hashing, account routes | pending | - | |
| 7 | Avatar routes: add, delete, play, 2 per account | pending | - | |
| 8 | Sign-in, avatar list, add and delete screens | pending | - | |
| 9 | New mockup section for the item row and drag, plus approval picture | pending | - | **Stops for your approval of the picture before slice 12.** |
| 10 | Item bag data: `character_items`, buy-to-bag, equip, unequip | pending | - | |
| 11 | Blacksmith panel from the mockup, with "Owned" | pending | - | |
| 12 | Bag panel from the mockup, item row, drag and click to equip | pending | - | Needs slice 9 approved. |
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
