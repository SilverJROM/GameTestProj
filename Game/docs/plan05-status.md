# Plan 05 status (recovery tracker)

T0 (go) 2026-11-11 13:10 PHT. Suspend at T0 + 2 h 50 min = 16:00 PHT. First checkpoint at T0 + 2 h 30 min = 15:40 PHT, then every 10 minutes
(a background saver commits WIP on `update-05`; script /tmp/wip-saver.sh, log /tmp/wip-saver.log; if the VM restarts, restart it:
`setsid nohup /tmp/wip-saver.sh &` after `echo <T0 epoch> > /tmp/plan05.t0`, T0 epoch = `date -d "2026-11-11 13:10 +08" +%s`).
Branch `update-05` from `main` (163cc9d + plan 05 docs). Nothing is pushed or deployed. Cloudflare is NOT touched until the developer says so.

| # | Slice | Level | State |
|---|---|---|---|
| 1 | test clock only with ALLOW_TEST_CLOCK | L1 | done (b98cc15) |
| 2 | route graph and patrol cells precomputed at build time | L2 | done (c6547b7) |
| 3 | in-memory tick instead of the 100 ms alarm chain | L2 | done; Opus FAIL then PASS |
| 4 | position saves throttled, no read-back | L2 | done; Opus FAIL (3 position bugs) then PASS |
| 5 | monster bed saved at most once a second in chases | L2 | done; Opus finding (coin pickup) fixed |
| 6 | idle socket close after 20 min (client shows a reload message) | L1 | done |
| 7 | account cap (MAX_ACCOUNTS) | L1 | done |
| 8 | invited-email and invite-code sign-up (migration 0006) | L1/L2 | done |
| 9 | deploy | - | NOT started: waits for the developer's go |

Finished 2026-11-11 about 13:35 PHT (T0 13:10). Tests: 543 pass. Merged to main locally. Nothing pushed, nothing on Cloudflare.
Opus per-minute cost after the fixes: idle 1 DO request and 0 D1 rows; walking about 71 D1 rows (40 to 45 for one long walk), about 2 DO requests;
fighting 78 D1 rows, 61 DO storage writes. For 6 players x 2 h walking that is about 50,000 D1 rows written a day (cap 100,000) and about 1,500 DO requests.
To measure on real Cloudflare: whether the 10 ms CPU cap applies to DO timer callbacks, D1 query latency, how the dashboard counts alarm and storage writes.
Open lows: saveFacts still reads the row back on every bite (about 164 read statements per minute of fighting); one reconnect race fixed.
Next step: developer's go for slice 9 (see docs/plan05-deploy.md).

## Plan 07 (2026-11-11 PM): duel menu and click rules
Right click on a player opens a Duel/Cancel menu (whole-body click box); three dots over the target while waiting; cancel and decline clear them and close the offer panel; accept shows the red glow on both. Left click: walk, or walk to a monster and swing once. Right click: walk to a monster and swing until it dies; on the duel partner walk and swing until one falls. Left click on a player only walks. Tests: 568 pass; real-Chrome check docs/plan05-tools/death-duel-check.mjs. Deployed to game.silverjrom.workers.dev behind Cloudflare Access.
