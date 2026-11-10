# Plan 04

Status: PLAN ONLY. Written 2026-11-11 (system clock 2026-11-10 ~00:10). Not started; waiting for the developer's review and "go".
Decisions and the reasoning behind each item are in `docs/plan04-notes.md`.

## Topology (updated: Grok is at 89% usage, so it only does L1)

| Level | Implements | Tests |
|---|---|---|
| L1 (small, client-side, low risk) | Grok 4.7 | Claude Sonnet 5.5 |
| L2 (core server rules, races, pathing) | Claude Sonnet 5.5 | Claude Opus (separate agent) |

If Grok runs out mid-slice, the slice moves to Sonnet and I tell the developer. Every update ends with `date time PHT · % complete · ETA`. Commit after each
slice, a WIP save every 30 minutes, nothing pushed or deployed. Memory is managed so there is no out-of-memory (one agent at a time on heavy work,
no parallel browsers beyond two).

## Slices

| # | Slice | Level | Implements / tests | Est. |
|---|---|---|---|---|
| 0 | Branch `update-04` from `main`, status file, test tools folder, baseline (445 tests, game up) | L1 | Grok / Sonnet | 15 min |
| A | Coin stamps: every coin keeps its stamp; duel loss drawn at random across lots; winner's coins keep old stamps; Bag line for coins expiring within 2 days (hidden otherwise, tooltip max 3 groups) | L2 | Sonnet / Opus | 60 min |
| B1 | Hamburger menu (upper right beside the Bag), Change avatar, Log out; vector bag icon replacing the word "Bag" | L1 | Grok / Sonnet | 50 min |
| B2 | Settings panel: resolution presets (Small, Medium, Large, Fit window, Fullscreen) beside the zoom slider; music and effects volume (default 25% and 35%) and mute; rebindable shortcuts (B Bag, M Menu, Esc close); saved per browser | L1 | Grok / Sonnet | 70 min |
| C1 | Sound engine and background music: per-zone track, 2 s crossfade, 0.5 s border delay, grey uses fields, loop, start on first click or key, pause when tab hidden, silent on sign-in and picker | L1 | Grok / Sonnet | 60 min |
| C2 | Effects: sword when attacking, stab when hit, wolf/bear/skeleton one at a time, each no faster than every 6 s, within 2.5x reach (120 px) or while fighting, nearest enemy wins; hit may cut in over a creature sound | L1 | Grok / Sonnet | 50 min |
| D | Best-route walking: walkable map, A*, path straightening, nearest reachable spot for a blocked click, no route means stay put; click-to-fight uses it | L2 | Sonnet / Opus | 100 min |
| E | Monster spacing and speed: one roaming cell per monster covering 80-90% of the section, gate openings clear, overlap at most 2 and up to 40%, patrol speeds wolf 11 / skeleton 11 / bear 8, chase 90, skeleton wakes at 100 px, wolf/bear give up at 250 px from home | L2 | Sonnet / Opus | 100 min |
| F | Chrome-extension test pass of everything, GIFs in `docs/plan04-gifs/`, evidence file | L1 run by Sonnet | Sonnet (test), Opus checks the evidence of A, D, E | 90 min |
| G | Regression (plan 03 checks and the full suite), Opus review round and fixes, final tracker, merge to `main` locally | L2 | Sonnet / Opus | 60 min |

Order: 0, then A and B1 (one server, one client, no clash), then B2, C1, C2 (client), then D and E (both touch the walking core, one at a time), then F and G.
Rough total: 6 to 7 hours with the review rounds. Grok carries about 4.5 hours of that and only on small L1 work, with Sonnet taking over if Grok stops.

## Per-slice acceptance and tests

- **A (L2).** Unit: lots keep stamps through spend, duel loss, duel win; random draw is unbiased over many runs (each coin equally likely); no negative or double count.
  Worker: duel payout moves lots with their stamps; sweep expires the winner's coins at the original time; a buy overlapping the sweep never revives expired coins.
  Chrome: seed lots aged 1, 3, 6 and 8 days in the local database; the 8-day lot goes at the sweep; the Bag line shows only coins within 2 days ("expire today" under 24 h, hidden otherwise); the tooltip lists at most 3 groups.
- **B1 (L1).** Chrome: the menu opens and closes (click, Esc); Change avatar shows the picker while still signed in and the avatar leaves the world for other players; Log out returns to sign-in; the bag icon opens the Bag modal; the word "Bag" is gone.
- **B2 (L1).** Chrome: each preset resizes the game and the slider still works; volume defaults are light; mute works; a rebound key opens the Bag; a duplicate binding is refused or swaps with a message; settings survive reload.
- **C1 (L1).** Chrome with page inspection of the audio elements: town track in town, fields in green and grey, cemetery track in the cemetery; a 2 s crossfade (both volumes change over 2 s); no flip when standing on a border for less than 0.5 s; no sound before the first click; silent on sign-in and picker; paused when the tab is hidden; volume slider scales the level.
- **C2 (L1).** Chrome and logged playback calls: with several enemies near only one creature sound plays; the same creature repeats no faster than every 6 s; nothing plays beyond 120 px unless fighting; sword on attack, stab on hit; hit cuts in over a creature sound.
- **D (L2).** Unit table of start and target pairs (inside to outside, outside to inside, cemetery, around houses and fountain, a click in a wall or house, an unreachable spot): reaches the target, never touches a wall, length within 10% of the best. Worker: server path agrees with the client display. Chrome: clicking outside the town from inside goes through the gate; GIF.
- **E (L2).** 10-minute simulation: no triple overlap, no 1:1 overlap, closest-pair report, 80-90% of the section visited, speeds by state; gates clear; wolf/bear chase ends at 250 px from home; skeleton wakes at 100 px. Chrome: look at the three zones and time the speeds; GIF.
- **F.** Everything above through the Chrome extension, two tabs for the duel; GIFs named by flow (`coin-expiry-bag-line.gif`, `duel-coins-keep-stamps.gif`, `menu-change-avatar.gif`, `music-crossfade-border.gif`, `route-through-gate.gif`, `monsters-spread-patrol.gif`, and so on). If the extension is disconnected, I say so and use Playwright, naming it in every report.
- **G.** `npm test` all pass; plan 03 regression run (15 steps) passes; Opus review on A, D and E with every finding fixed or recorded.

## Risks

- D and E both change the walking core; they run one after the other, with the plan 03 gate walks and patrol checks re-run after each.
- Slice A changes how coins move in duels, the place where plan 03 found three races. Opus tests it hard.
- Grok's remaining usage may not cover C1 and C2; Sonnet takes them if so.
- Audio: I can verify which sound plays and when, not how it sounds. The developer listens.
- Open items carried over: test-clock header must be disabled before any deploy; real D1 cost unmeasured; provenance evidence for the Grok art, the maps, houses, overlays, coin and the wolf author.
- The sounds in `assets/sounds` stay as downloaded; the skeleton sound is a placeholder.

## Defaults I will use unless the developer changes them
Click marker only (no dotted route line); resolution presets Small, Medium, Large, Fit window, Fullscreen; vector bag icon; settings per browser; two tabs for the duel test.
