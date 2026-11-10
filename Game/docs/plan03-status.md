# Plan 03 status tracker

Recovery file. If the session closes, read this first, then `docs/plan03.md`. Times in UTC. Same topology and rules as `docs/plan02-status.md` (Grok implements, Claude reviews and commits, user-approved plan only).

Last updated: 2026-11-10 15:16 UTC

| Item | Value |
| --- | --- |
| Base | `main` at `cde3469` |
| Working branch | `update-03` (cut from `main`) |
| Overall | 42% (slices 0-4 of 12 done) |

| Slice | What | Status | Commit |
| --- | --- | --- | --- |
| 0 | Branch and measurement (evidence in `docs/plan03-evidence.md`) | **done** | see git log |
| 1 | Gate routing and wall sliding | **done** | see git log |
| 2 | Smooth walking (interpolation) | **done** | see git log |
| 3 | Everything on screen patrols (merged with 4) | **done** | see git log |
| 4 | Own patrol patch, no overlap (merged into 3) | **done** | see git log |
| 5 | Sprite click area | **in progress** (Grok started 15:05 UTC, marker `slices/p3-slice-5.done`) | - |
| 6 | Click to chase and fight (L3, Claude implements, Opus validates) | **in progress** (server chase target in room.ts + protocol `attacking`, test/worker/chase.test.ts passes 4/4; needs full suite, slice 5 first, then Opus validation) | - |
| 7 | Coin 24 px, walk-on pickup | pending | - |
| 8 | Checkpoint: full suite, screenshots, merge slices 0-7 to main | pending | - |
| 9 | Shared account bag (L3) | pending | - |
| 10 | Coin expiry (L3) | pending | - |
| 11 | Final suite, regression, merge | pending | - |

Levels: L1/L2 = Grok implements, Sonnet 5.5 tests; L3 = Sonnet 5.5 implements, Opus tests (see plan03.md revision). Slice levels: 0 L1, 1 L2, 2 L2, 3 L2, 4 L2, 5 L1, 6 L3, 7 L2, 8 L2, 9 L3, 10 L3, 11 L2.

Schedule: suspend expected 2026-11-10 20:06 UTC (04:06 PHT). WIP save every 30 min. No new slice after 19:30 UTC. Final save by 19:45 UTC.
