# Plan 05 status (recovery tracker)

T0 (go) 2026-11-11 13:10 PHT. Suspend at T0 + 2 h 50 min = 16:00 PHT. First checkpoint at T0 + 2 h 30 min = 15:40 PHT, then every 10 minutes
(a background saver commits WIP on `update-05`; script /tmp/wip-saver.sh, log /tmp/wip-saver.log; if the VM restarts, restart it:
`setsid nohup /tmp/wip-saver.sh &` after `echo <T0 epoch> > /tmp/plan05.t0`, T0 epoch = `date -d "2026-11-11 13:10 +08" +%s`).
Branch `update-05` from `main` (163cc9d + plan 05 docs). Nothing is pushed or deployed. Cloudflare is NOT touched until the developer says so.

| # | Slice | Level | State |
|---|---|---|---|
| 1 | test clock only with ALLOW_TEST_CLOCK | L1 | done (tests updated, lock test added) |
| 2 | precompute route graph and patrol cells at build time | L2 | not started |
| 3 | in-memory tick instead of the 100 ms alarm chain | L2 | built (Opus review pending) |
| 4 | throttle position saves, no read-back | L2 | built (Opus review pending) |
| 5 | throttle storeCabbage | L2 | built (Opus review pending) |
| 6 | idle socket close after 20 min | L1 | not started |
| 7 | account cap 6 | L1 | not started |
| 8 | email allowlist + invite code sign-up (lock B) | L1/L2 | not started |

Next step: see the first non-done row.
