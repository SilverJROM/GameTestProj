# Plan 04 status

Finished 2026-11-11 (PHT). Everything is on branch `update-04`, merged to `main` locally, nothing pushed or deployed.

| Slice | Level | Implements / tests | Commit | State |
|---|---|---|---|---|
| 0 | L1 | Claude (branch, baseline) | - | done |
| A coin stamps, random duel loss, 2-day Bag line | L2 | Sonnet / Opus | 245e929, c20473a, 9f630e3 | done; Opus FAIL x2 then PASS-with-low (recorded) |
| B1 menu, bag icon, Change avatar, Log out | L1 | Grok / Sonnet (Chrome pass) | ae1c405 | done |
| B2 settings, presets, volumes, rebindable keys | L1 | Grok / Sonnet (Chrome pass) | cad4428 | done |
| C1 zone music, 2 s crossfade | L1 | Grok / Sonnet (Chrome pass) | db332fe | done |
| C2 effects (sword, stab, creature) | L1 | Claude (Grok stalled) / Sonnet (unit) | 110b899 | done |
| D best-route walking | L2 | Sonnet / Opus | a6d2ca5, 470f0b8 | done; Opus PASS on re-check |
| E monster spacing, spread, speed | L2 | Sonnet / Opus | 6aa8dcd, 470f0b8 | done; Opus FAIL then PASS on re-check |
| F Chrome-extension pass, GIFs | - | Sonnet | 92cad26 | done (see plan04-evidence.md) |
| G regression, reviews, merge | L2 | Sonnet / Opus | final commit | done |

Tests: `npm test` 52 files, 528 tests passing (one duel-fight test is timing-sensitive on the 2-core machine and passes alone).

## Findings worth knowing
- Pre-existing: `scripts/build-client.mjs` rewrote the generated client on every build, so `wrangler dev` rebuilt and restarted about once a second,
  resetting the game room. Fixed (92cad26). It explains the tiny patrol movement measured in plan 03.
- Grok sent its own milestone check-ins for B1 and B2 (receipts 19 and 20), which it should not have; C1/C2 prompts forbade it.
- Opus lows left open: the first routed click builds the walking graph in about 240 ms (the free plan's CPU budget is 10 ms per request, not measured
  on real Cloudflare); `clampGuava` lets a click at x=1280 or y=720 stand off the map (old code); a boxed-in skeleton drops the chase and wakes again
  next tick; Opus finding B of slice A (guarded lot writes versus the purse, not reachable through the room queue).
- Houses and the fountain do not block walking (only the walls do); the route finder ignores them.
- Large resolution preset is capped by window width only, so it can be taller than the window (scroll).
- The skeleton sound is a placeholder clank; sword/stab are the nearest sounds in the Kenney pack; wolf author name not captured.
- Carried over: test-clock header must be disabled before any deploy; real D1 cost unmeasured; Grok terms evidence for the art and the source of maps,
  houses, overlays and coin are still needed (docs/asset-provenance.md).
- Decision pending: the client receives `lastAtMs` and `groups` for the Bag tooltip (notes said count and soonest only).
