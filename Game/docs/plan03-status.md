# Plan 03 status tracker

Recovery file. If the session closes, read this first, then `docs/plan03.md`. Times in UTC. Same topology and rules as `docs/plan02-status.md` (Grok implements, Claude reviews and commits, user-approved plan only).

Last updated: 2026-11-10 16:40 UTC

| Item | Value |
| --- | --- |
| Base | `main` at `cde3469` |
| Working branch | `update-03` (cut from `main`) |
| Overall | 83% (slices 0-9 done, 10 in progress, 11 left) |

| Slice | What | Status | Commit |
| --- | --- | --- | --- |
| 0 | Branch and measurement (evidence in `docs/plan03-evidence.md`) | **done** | see git log |
| 1 | Gate routing and wall sliding | **done** | see git log |
| 2 | Smooth walking (interpolation) | **done** | see git log |
| 3 | Everything on screen patrols (merged with 4) | **done** | see git log |
| 4 | Own patrol patch, no overlap (merged into 3) | **done** | see git log |
| 5 | Sprite click area | **done** | `d71390c` |
| 6 | Click to chase and fight (L3, Claude implements, Opus validates) | **done, Opus PASS** | `e1e077d` + `488ff98` |
| 7 | Coin 24 px, walk-on pickup | **done** | see git log |
| 8 | Checkpoint: full suite (422 pass), screenshots retaken, slices 0-7 merged to `main` locally | **done** | see git log |
| 9 | Shared account bag (L3, Claude implements, Opus validates) | **done, Opus validation running** | `5fbb2bc` |
| 10 | Coin expiry (L3) | **in progress** (design: coin_lots table + migration 0005, expiry at join and every minute, oldest spent first) | - |
| 11 | Final suite, regression, merge | pending | - |

Levels: L1/L2 = Grok implements, Sonnet 5.5 tests; L3 = Sonnet 5.5 implements, Opus tests (see plan03.md revision). Slice levels: 0 L1, 1 L2, 2 L2, 3 L2, 4 L2, 5 L1, 6 L3, 7 L2, 8 L2, 9 L3, 10 L3, 11 L2.

Schedule: suspend expected 2026-11-10 20:06 UTC (04:06 PHT). WIP save every 30 min. No new slice after 19:30 UTC. Final save by 19:45 UTC.
