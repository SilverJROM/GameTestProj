# Plan 03 status tracker

Recovery file. If the session closes, read this first, then `docs/plan03.md`. Times in UTC. Same topology and rules as `docs/plan02-status.md` (Grok implements, Claude reviews and commits, user-approved plan only).

Last updated: 2026-11-10 18:03 UTC

| Item | Value |
| --- | --- |
| Base | `main` at `cde3469` |
| Working branch | `update-03` (cut from `main`) |
| Overall | 100% (slices 0-11 done) |

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
| 9 | Shared account bag (L3, Claude implements, Opus validates) | **done, Opus re-check PASS** | `5fbb2bc` + `ae200ff` |
| 10 | Coin expiry (L3, Claude implements, Opus validates) | **done, Opus PASS (3 rounds)** | `ae200ff`, `0231c21`, `0a8858b` |
| 11 | Final: full suite (445 pass), regression 15/15 in Chrome, screenshots, merge to main | **done** | see git log |

Levels: L1/L2 = Grok implements, Sonnet 5.5 tests; L3 = Sonnet 5.5 implements, Opus tests (see plan03.md revision). Slice levels: 0 L1, 1 L2, 2 L2, 3 L2, 4 L2, 5 L1, 6 L3, 7 L2, 8 L2, 9 L3, 10 L3, 11 L2.

Schedule: suspend expected 2026-11-10 20:06 UTC (04:06 PHT). WIP save every 30 min. No new slice after 19:30 UTC. Final save by 19:45 UTC.

## Open items for the user (2026-11-10)

- **Test-clock header (Opus finding B2, existing since earlier plans):** any client can send `X-Papaya-Clock: ripe`, which switches the room to manual ticks and turns off the real alarm (patrol, expiry sweep). Must be disabled (for example behind a dev-only variable) before any Cloudflare deploy.
- **Real D1 cost:** a pickup write costs about 5 D1 queries, a buy about 9, the minute sweep 2 per connected avatar. The Workers Free plan allows 50 subrequests per invocation; with 20 or more avatars connected at once the minute's alarm could reach it. Not measured on real D1.
- Two low Opus items not reproduced: a race at the exact 7-day moment between a spend and a sweep; old purses with no lots are not repaired (the migration gives every existing purse a lot, so only data created outside it is affected).
- Migrations 0004 (shared bag) and 0005 (coin lots) must be applied to any existing local or remote database before running this build (`npx wrangler d1 migrations apply game-db --local`).
