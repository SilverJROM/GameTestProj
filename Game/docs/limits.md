# Limits and open items (honest report)

Read with `docs/balance.md` (game balance limits) and `docs/security.md` (security limits).

## Verified and how

- Automated tests: `npm test` (vitest, 571 tests across unit, worker and integration files). Last full run after plan 09: 570 pass, 1 fails intermittently (`test/worker/duel-request.test.ts`, "lets a decline clear the offer..."): it passes when run alone and fails once in a full run because the offer message can arrive after the reply snapshot. It is a test timing race, not a known game bug, and is not fixed yet.
- `npx tsc --noEmit` reports 8 type errors in `src/client/main.ts` and `src/server/password.ts` (a `LooseCtx` cast, `root` possibly null, a readonly array, and a Uint8Array/BufferSource typing). They were there before plan 09 and do not block bundling or tests. They should be cleaned up.
- A real-browser check of the plan 09 death and duel flow is in `docs/plan05-tools/death-duel-check.mjs` (Playwright on installed Chrome).

## Not verified or not done

- **Free-plan load is unmeasured.** The efficiency work (in-memory tick, throttled saves, precomputed routes, idle close, account cap) is designed to fit the Workers Free limits, but I have no measured CPU, D1 rows or Durable Object request counts from a live session. Cloudflare analytics were not read with the available token unless stated in the final report.
- **No multi-player load test.** Two or three simultaneous players were exercised in tests, not dozens.
- **The coin sound has not been heard by a person** on the deployed site; the code path is tested, the audio is not.
- **A duel swing sent without `walk` has no reach limit** in the server (the client always sends `walk` for clicks). This should be closed.
- **Plan 06 to 08 client code** (menu, walking routes, duel menu, controls) had no independent review; only tests and my own browser checks.
- **Death rule deviation.** The manager's guidance says a dead avatar is still dead on the next Play; the project owner decided that it respawns in town on rejoin. That is implemented and tested, and recorded in `docs/game_reqts.md`.
- **Economy is too short** (see `docs/balance.md`, limit 1).
- **Art provenance is incomplete.** `docs/asset-provenance.md` lists what is known; the sources of the maps, houses, overlays and the coin art lack evidence, and the generator's terms link is not recorded. This must be settled before any claim about asset rights.
- **Tokens.** The Cloudflare API token used for deployment is broader than needed and should be rotated; the Zero Trust team must stay enabled or Access stops working.
- **Git identity.** A commit once carried the developer's real name; the history was rewritten and force-pushed to the submission repository (author is now the GitHub handle only). Any clone made before that push still has the old commits.
