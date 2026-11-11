# Limits and open items (honest report)

Read with `docs/balance.md` (game balance limits) and `docs/security.md` (security limits).

## Verified and how

- Automated tests: `npm test` (vitest, 608 tests across unit, worker and integration files). Last full run after plan 10: all pass. One test (`test/worker/duel-request.test.ts`) had a timing race (the offer message could arrive after the reply snapshot) and was made order-safe with a ping; it was seen failing once in a full run before that change.
- `npx tsc --noEmit`: the six type errors in `src/client/main.ts` and `src/server/password.ts` are fixed (plan 14). The command still reports many more in this checkout that are only missing environment packages (`@cloudflare/workers-types` for `src/world/room.ts`, `@types/node` and implicit `any` in tests); adding those packages is a separate, low-risk change that has not been made.
- A real-browser check of the plan 09 death and duel flow is in `docs/plan05-tools/death-duel-check.mjs` (Playwright on installed Chrome).

## Not verified or not done

- **Free-plan load: one partial measurement, with caveats.** From Cloudflare's GraphQL analytics for 2026-11-10 to 2026-11-12 (UTC), which covers the owner's 20 to 25 minute live playtest plus my own deploy checks and tests against the live site, so it is not an isolated, controlled run:
  - Worker: 147 requests, 0 errors, CPU p50 1.4 ms, **p99 11.1 ms** (the Free limit is 10 ms per request, so the slowest 1% was at or above it; I do not know which requests, probably sign-up or sign-in hashing or a cold start).
  - Durable Object (the live world): 44 invocations with 13 reported errors that I have not explained, p50 CPU 90 ms and p99 369 ms per invocation (the long-lived WebSocket sessions), 1355 s of active time, 6.1 s of CPU in total, 426 inbound and 14,853 outbound WebSocket messages, 230 storage rows written.
  - D1 (`game-db`): 1,474 read queries and 678 write queries, 6,621 rows read and 822 rows written. The Free plan allows 100,000 rows written and 5 million rows read per day, so one player-session is far below it.
  This shows one or two players fit with a wide margin; it does not show what happens with many players.
- **No multi-player load test.** Two or three simultaneous players were exercised in tests, not dozens.
- **The coin sound has not been heard by a person** on the deployed site; the code path is tested, the audio is not.
- **Duel swing reach (closed in plan 14):** a duel swing now needs the partner within melee reach (48 px) on the server, whatever the message says.
- **Plan 06 to 08 client code** (menu, walking routes, duel menu, controls) had no independent review; only tests and my own browser checks.
- **Death rule deviation.** The manager's guidance says a dead avatar is still dead on the next Play; the project owner decided that it respawns in town on rejoin. That is implemented and tested, and recorded in `docs/game_reqts.md`.
- **Pacing is a model** (see `docs/balance.md`, limit 1): the XP ladder and prices were raised so level 6 takes about 2.3 hours in the simulation (levels 2 and 3 take about 1.4 and 4 minutes), with no player data behind the number.
- **Fountain (decided in plan 14):** the instant click heal was removed; the fountain heals only by regeneration. A click on the fountain just walks there.
- **Monster freeze:** monsters outside every player's own view stand still, so a monster seen from the edge of a zoomed-out view can look frozen just outside it; the server trusts the zoom the client reports.
- **Art provenance is incomplete.** `docs/asset-provenance.md` lists what is known; the sources of the maps, houses, overlays and the coin art lack evidence, and the generator's terms link is not recorded. This must be settled before any claim about asset rights.
- **Tokens.** The Cloudflare API token used for deployment is broader than needed and should be rotated; the Zero Trust team must stay enabled or Access stops working.
- **Git identity.** A commit once carried the developer's real name; the history was rewritten and force-pushed to the submission repository (author is now the GitHub handle only). Any clone made before that push still has the old commits.

## Opus review of plans 06 to 13 (plan 14)

An independent Opus review of the server and client code found, and plan 14 fixed: a duel swing from any distance; a possible lost death panel when a tick came between a killing duel blow and its broadcast (the blow is now broadcast at once, and the page also opens the panel from the snapshot that marks it dead); the fountain click writing the database on every click (removed); no limit on messages per socket (30 per second, burst 60, per avatar; not applied under the test clock); regeneration health lost on a quick reconnect (written when the new socket joins); two tabs of one avatar reconnecting forever (code 4000 no longer reconnects, and reconnects back off 1, 2, 4 s); a WebSocket opened from another site (the Origin header must match when present); very long strings in messages (over 200 characters are refused). The Opus review rated the `respawn`, `view` and message-parsing code fine. Not done: sign-in rate limiting (needs storage) and a re-review after these fixes.
