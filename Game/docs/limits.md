# Limits and open items (honest report)

Read with `docs/balance.md` (game balance limits) and `docs/security.md` (security limits).

## Verified and how

- Automated tests: `npm test` (vitest, 578 tests across unit, worker and integration files). Last full run after plan 10: all pass. One test (`test/worker/duel-request.test.ts`) had a timing race (the offer message could arrive after the reply snapshot) and was made order-safe with a ping; it was seen failing once in a full run before that change.
- `npx tsc --noEmit` reports 8 type errors in `src/client/main.ts` and `src/server/password.ts` (a `LooseCtx` cast, `root` possibly null, a readonly array, and a Uint8Array/BufferSource typing). They were there before plan 09 and do not block bundling or tests. They should be cleaned up.
- A real-browser check of the plan 09 death and duel flow is in `docs/plan05-tools/death-duel-check.mjs` (Playwright on installed Chrome).

## Not verified or not done

- **Free-plan load: one partial measurement, with caveats.** From Cloudflare's GraphQL analytics for 2026-11-10 to 2026-11-12 (UTC), which covers the owner's 20 to 25 minute live playtest plus my own deploy checks and tests against the live site, so it is not an isolated, controlled run:
  - Worker: 147 requests, 0 errors, CPU p50 1.4 ms, **p99 11.1 ms** (the Free limit is 10 ms per request, so the slowest 1% was at or above it; I do not know which requests, probably sign-up or sign-in hashing or a cold start).
  - Durable Object (the live world): 44 invocations with 13 reported errors that I have not explained, p50 CPU 90 ms and p99 369 ms per invocation (the long-lived WebSocket sessions), 1355 s of active time, 6.1 s of CPU in total, 426 inbound and 14,853 outbound WebSocket messages, 230 storage rows written.
  - D1 (`game-db`): 1,474 read queries and 678 write queries, 6,621 rows read and 822 rows written. The Free plan allows 100,000 rows written and 5 million rows read per day, so one player-session is far below it.
  This shows one or two players fit with a wide margin; it does not show what happens with many players.
- **No multi-player load test.** Two or three simultaneous players were exercised in tests, not dozens.
- **The coin sound has not been heard by a person** on the deployed site; the code path is tested, the audio is not.
- **A duel swing sent without `walk` has no reach limit** in the server (the client always sends `walk` for clicks). This should be closed.
- **Plan 06 to 08 client code** (menu, walking routes, duel menu, controls) had no independent review; only tests and my own browser checks.
- **Death rule deviation.** The manager's guidance says a dead avatar is still dead on the next Play; the project owner decided that it respawns in town on rejoin. That is implemented and tested, and recorded in `docs/game_reqts.md`.
- **Pacing is a model** (see `docs/balance.md`, limit 1): the XP ladder and prices were raised so level 6 takes about 2.7 hours in the simulation, with no player data behind the number.
- **Fountain:** the instant click heal still exists next to the new 5 health per second regeneration; if regeneration is meant to replace it, the click should be removed (it makes regeneration pointless for anyone who clicks).
- **Monster freeze:** monsters outside every player's own view stand still, so a monster seen from the edge of a zoomed-out view can look frozen just outside it; the server trusts the zoom the client reports.
- **Art provenance is incomplete.** `docs/asset-provenance.md` lists what is known; the sources of the maps, houses, overlays and the coin art lack evidence, and the generator's terms link is not recorded. This must be settled before any claim about asset rights.
- **Tokens.** The Cloudflare API token used for deployment is broader than needed and should be rotated; the Zero Trust team must stay enabled or Access stops working.
- **Git identity.** A commit once carried the developer's real name; the history was rewritten and force-pushed to the submission repository (author is now the GitHub handle only). Any clone made before that push still has the old commits.
