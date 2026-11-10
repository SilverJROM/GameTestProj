# Plan 03 test plan (Claude Sonnet 5.5), for the user's confirmation

Nothing here has been run. Work starts only when the user says so.

## How Claude will test

- **Browser:** the real game in Google Chrome, driven by Playwright (the Claude Chrome extension has not been connected to this session; if the user connects it, the same checks run through it). Screenshots go to `docs/mockups/screenshots/plan03-*.png`.
- **Server:** a fresh `wrangler dev` with a temporary local D1 per run. Two or three browser windows (separate cookie jars) for multiplayer checks.
- **Clock:** the server's existing test-clock header moves time forward for the 7-day coin expiry, so no waiting.
- **Gate per slice:** unit tests, then the full `npm test` (default workers), then the browser checks below, then a diff review. A slice fails review on any red item; three failures stop the run.

## Critical checks, by change

| # | Change | What Claude does in the browser | Pass means |
| --- | --- | --- | --- |
| 1 | Walking and gates | Walk through the south town gate and the cemetery gate, in and out, from 8 start angles each; click far away targets across the gate | Avatar never stops at an open gate; still stops at every solid wall piece; position per frame has no visible jumps (max step per frame small and even) |
| 2 | Patrol | Stand in the green with the grey zone's bears on screen; record every monster's position for 20 s. Repeat with two players in different zones | Every monster visible on screen moves; no two monsters in a zone share a patrol patch; monsters just off screen also move |
| 3 | Fight | Click the body (head, chest, legs) of a wolf, bear and skeleton from far away; click ground mid-fight | Click on any part of the sprite engages; avatar walks up, swings until the kill or the cancel; hand cursor and outline show on hover; XP and coin arrive |
| 4 | Coin | Kill a wolf; walk onto the coin; kill another and stand still | Coin is 24 px; walking onto it credits at once, exactly once; standing away lets the pet take it in about 2.25 s |
| 5 | Shared bag | Account with 2 avatars: buy on avatar A, sign in as B; equip the same item on both; delete A | B sees A's items; one piece is worn by one avatar at a time (the other shows who wears it); duplicates from before are kept; deleting an avatar keeps its gear in the bag |
| 6 | Coin expiry | Earn coins, move the clock 6 days then 8 days; spend some at the forge; check an old character | Coins vanish 7 days after pickup, oldest spent first, existing balances start their clock at go-live, HUD and Bag show the right total, no negative or double counting; duels still move coins correctly |

## Regression list (re-run after every slice)

Create account and sign in (wrong password message, 8-character rule); 2 avatars and delete with confirmation; zoom slider 60 to 75 and its saved setting; HUD Lv/XP/Coins live; Bag and Blacksmith panels open, update live, close with Close and Esc; buy, equip and unequip by drag and by click; max HP and Strike change with gear; three-dot bubble in town only; reload keeps the session.

## What Claude reports back

A table per slice: what was done, test counts, screenshots, anything that failed and how it was fixed, plus the status line you asked for. Anything the checks cannot prove is said plainly.

## Not tested / out of scope

Deploying to Cloudflare, pushing to GitHub, the assessment portal, load testing, and touch-screen devices.

## Design choices to confirm for the two new rules (defaults shown)

- **Shared bag:** items belong to the account, each copy is its own row. Existing per-avatar items move into the account bag, duplicates are kept. An item worn by one avatar shows "Worn by NAME" on the other avatar and cannot be equipped until it is taken off. Deleting an avatar returns its worn gear to the bag. Buying still uses the buying avatar's coins; "Owned" in the shop means the account owns a copy.
- **Coin expiry:** each pickup is a lot with its pickup time; lots older than 7 days are removed; spending uses the oldest lots first; existing balances become one lot dated at the moment this goes live; duel winnings are new lots dated at the duel. The 2.25 s pickup time stays (the guidance mentions 4 s, but you set 2.25 s).
