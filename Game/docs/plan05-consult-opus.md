# Free-plan review of Game (WorldRoom + D1): consult answer

This is read-only analysis. No repo files were edited, and wrangler and vitest were not run. Timings come from esbuild bundles of the real `src/` modules, run in Node 22 on a Xeon 8488C. The scripts are in `/tmp/consult-bench/`.

## 0. What I measured and counted

| Item | Result |
|---|---|
| `route.ts` visibility graph, first routed click (`planWalk` cold) | **115-140 ms** (your 240 ms is plausible on a slower core). Warm routed `planWalk` takes about 1.0 ms. A clear straight line takes about 1.6 ms, because `snapOffWall` can call `routeWaypoints` several times. |
| `radish.ts` zone cells, first `stepAggro` (builds 21 patches on a 10 px grid, 128x72 cells x 3 zones, each with `nearWall` over 65 walls) | **105-185 ms** |
| Steady tick (6 figs walking + `stepAggro`, 21 beets) | median 0.09-0.11 ms, p99 1.6-2.0 ms. The max (50-90 ms) was the cold graph build landing inside a tick. |
| Whole worker bundle module init | 6 ms (309 KB). Fine. |
| PBKDF2-SHA-256, 10k iterations (Node WebCrypto) | about 2 ms warm, 17 ms first call. Probably fine on Workers too, but measure there. |
| Cabbage bed JSON | about 2.7 KB, so one DO KV row per `put` |

### Storage calls per action, from `room.ts`, `core.ts`, `combat.ts`, `pets.ts`, `db.ts`

- **Every 100 ms tick, for every fig that moved** (`ripenDue` gives one patch per fig per tick), `persistPersimmons` calls `saveFacts`. That is `UPDATE characters` plus `getById`, which runs `SELECT characters` + `readCoinLots` (**all** of that avatar's lots) + `listBag`. Result: **4 D1 queries, 1 row written, 1 + L + ~5 rows read**, where L is the avatar's coin-lot count. All of it is awaited one call after another inside `alarm()`.
- A coin patch (pickup, kill reward) adds one more `readCoinLots`, then a batch of INSERT lot + UPDATE. That is about 3 rows written once you count the `coin_lots_character` index, plus the `getById`.
- **Every pickup INSERTs a new lot** (`planLots`), and lots live 7 days. So L grows without bound: about 100 per 2 h session, about 700 after a week of daily play. That makes every position write read hundreds of rows.
- Being bitten writes `{hp}` to D1 on every bite (about 1 per second while fighting).
- **DO storage** `storeCabbage()` (1 put) runs on:
  - every tick where `stepAggro.changed` is true, which includes **every chase step** (`changed = true` on each move), so up to 10 per second;
  - every landed player swing (`strikeOnce`, at most about 2.2 per second);
  - every yam sprout;
  - kill and pickup bed changes;
  - socket close with aggro.

  Idle patrol does not write.
- **Every alarm** calls `setAlarm` (forced). `armOrchard(false)` also calls `getAlarm` on each move, attack and swing, up to 3 times per swing.
- **Alarm chain condition**: the alarm fires every 100 ms whenever any of these is true: a fig is moving, any beet has aggro, a beet swung, **any connected fig stands in green/grey/cemetery or has a beet in view** (`anyBedWatched`), or a dig is due. In practice that is almost all play time outside town.
- **Minute sweep**: per connected fig, an `expireCoinLots` batch + `readCoinLots` (L rows).
- **Join**: `expireCoinLots` + `getById` in the DO (4 queries), plus `requireSession` (also `getById`) in the Worker.
- The client sends messages **only on clicks** (no heartbeat), so incoming WS traffic is tiny.

## 1. Free-plan problems, ranked, with daily estimates

Assumptions: 6 players x 2 h, one avatar each. A player is walking about 50% of the time and fighting (aggro or swinging) about 40%. The 100 ms alarm chain is live about 85% of the time the room is occupied. About 100 kills per session. Two occupancy cases:

- **A**: all six play in the same 2 h window (7,200 s of room occupancy).
- **B**: sessions spread out (about 12 h of occupancy). Real use is probably 4-8 h, somewhere between A and B.

### P1. D1 rows read (limit 5M/day): over by about 2x on day 1 and 30x+ by day 7. Blocker.

- Position writes: 6 x 7,200 s x 0.5 x 10 per second = **216,000 `saveFacts` calls per day**. This holds in both A and B, because it is per fig.
- Each call reads about 6 + L rows.
  - Day 1 (average L about 50): 216k x 56 ≈ **12M rows read**.
  - Day 7 (L about 700): 216k x 706 ≈ **150M rows read**.
- Add the minute sweep: 6 x 120 x (L + a few) ≈ 0.5M rows on day 7.
- Once the limit is hit, D1 queries fail until 00:00 UTC. Joins (`getById`), purchases and kills all break.

### P2. D1 rows written (limit 100k/day): about 235k per day, over by about 2.4x. Blocker.

- 216k from positions (1 row each).
- Bites: 6 x 7,200 x 0.4 x 1 per second ≈ 17k.
- Kills and pickups: 600 x ~4 ≈ 2.4k.

### P3. DO requests (limit 100k/day): about 62k in case A, about 370k in case B. Blocker unless everyone always plays together.

- Alarms, case A: 7,200 s x 0.85 x 10 per second ≈ **61,200**.
- Alarms, case B: 43,200 s x 0.85 x 10 ≈ **367,000**.
- WS messages: about 1 click per 2 s, so 21,600 messages / 20 ≈ 1,100. Connects add about 50.
- Case A uses 62% of the quota on one evening. A second session that day, or a 4-8 h spread, goes over.

### P4. DO storage rows written (limit 100k/day): probably over.

- `setAlarm` on every alarm: if it is billed as a row written (I believe it is, but I am not certain), that alone is **61k (A) or 367k (B)**.
- `storeCabbage`: about 3 per second while a player fights, so 6 x 7,200 x 0.4 x 3 ≈ **52k**.
- Total: about 113k (A) to about 420k (B).

### P5. D1 queries per invocation (limit 50) and latency inside `alarm()`.

- One tick runs about 4 queries per walking fig, one after another. Six walking figs means 24 queries.
- If the DO-to-D1 round trip is 10-50 ms (D1 has one primary region and the DO sits near the first user), a tick takes 0.25-1.2 s. `ripenDue` then catches up several ticks at once and emits **one write per fig per caught-up tick**. 3 ticks x 6 figs x 4 = 72 queries, which exceeds 50 and throws. A throw also skips `armOrchard`, so the chain then relies on alarm retries.
- A minute sweep landing on the same tick adds 2 queries per fig.
- Even below 50, movement visibly stutters because ticks back up behind D1 latency.

### P6. CPU spikes of 100-240 ms in one event: graph build and radish build.

- These run on the first routed click (`onMove` → `orderGuava` → `planWalk`) and on the first watched tick (`stepAggro` → `radishPatch`).
- They run again after every DO eviction or deploy.
- That is 10-25x the 10 ms Free CPU budget, if that budget applies to DO events. I am not sure it does (see section 3). Either way it is avoidable work.

### P7. Security and quota: `X-Papaya-Clock` is honored from any client.

- The Worker (`forwardFig` in `src/server/index.ts`) forwards it unchanged. Browsers cannot set WS headers, but any script can.
- Once `papayaManual = true` it **never resets** for the life of the DO:
  - every `alarm()` returns at once, so the world freezes for everyone;
  - `prune` (instant kill) and `ripen` are unlocked.
- `ripen` with steps up to 10,000 runs 10,000 ticks in one event. That is about 1 s of CPU and potentially thousands of `saveFacts` calls (thousands of D1 queries).
- This lets one person cause a denial of service and burn quota.

### P8. DO duration (limit 13,000 GB-s/day): OK, but an open tab is a risk.

- The sockets are non-hibernating (`accept()`), so the DO is billed wall-clock at 128 MB while anyone is connected.
- Case A: 7,200 x 0.125 = 900 GB-s. Case B: about 5,400 GB-s.
- **One tab left open for 24 h costs 10,800 GB-s.** Add an idle disconnect.

### P9. Minor

- PBKDF2 at 10k iterations is about 2 ms in Node. Likely fine; measure it on Workers.
- `/` and `/client.js` are Worker requests rather than free static assets. Negligible at this scale.
- Worker requests (100k/day) are not a concern.

## 2. Fix plan, in slices (ordered by value; slices 1-3 are the minimum)

### Slice 1: lock down the test clock (P7)

- **Change**:
  - In `src/server/index.ts` `forwardFig`, always `headers.delete(PAPAYA_CLOCK_HEADER)` unless `env.ALLOW_TEST_CLOCK === '1'`.
  - In `WorldRoom.fetch` (`src/world/room.ts`), also require `this.env.ALLOW_TEST_CLOCK === '1'`.
  - Add `ALLOW_TEST_CLOCK?: string` to both env interfaces.
  - The worker tests already pass `vars:` to `unstable_dev` (for example `test/worker/move.test.ts:317`). Add `ALLOW_TEST_CLOCK: '1'` there and in the sim/e2e scripts that use the header.
  - Never put the var in `wrangler.jsonc`.
  - Optionally lower `oliveStepCap`.
- **Saving**: closes the DoS and the CPU/quota bomb.
- **Risk**: low. Tests that forget the var go silently onto the wall clock and turn flaky.
- **Test**:
  - A worker test without the var: the header is ignored (a `prune` message does nothing; the alarm still ticks).
  - A test with the var: current behavior.

### Slice 2: stop writing positions to D1 on every tick, and drop the read-after-write (P1, P2, P5)

- **Change**:
  - In `room.ts`, `persistPersimmons` separates **durable facts** (level, xp, coins/coinsDelta, gear, maxHp, death/respawn place) from **volatile facts** (x, y, place on walk, hp from bites).
    - Write durable facts at once, as today.
    - Mark volatile facts dirty in memory and flush them per fig:
      - on arrival (`guavaArmed` turns false),
      - on a zone change,
      - every 30 s while dirty,
      - on socket close (the close handler currently relies on the tick write and does **not** write; it must flush),
      - before `pullFig`.
  - Coalesce multiple patches for one fig in one tick into one UPDATE.
  - In `src/server/db.ts`, `saveFacts` no longer calls `getById`. Only the coin path needs `coinExpiry`. Return `nextExpiry` from the lots it already read in `coinLotStatements` (adjusted by the planned add/shrink), or keep the lots in memory (slice 5).
- **Saving**:
  - D1 writes drop from about 235k to about 5-8k per day.
  - D1 reads drop from 12-150M to well under 100k.
  - Ticks no longer wait on D1, which removes the stutter and the 50-query risk.
- **Risk**: medium.
  - A DO eviction or crash loses at most 30 s of position or hp. Acceptable.
  - The hp-on-death path must still write at once.
  - Duel and buy code reads `fig.facts` from memory, so nothing depends on D1 freshness, but check `restoreQuince`/`getById` users. They would read a stale x/y/hp, so make `restoreQuince` keep x/y/hp from memory (today it already copies only purse and gear fields).
- **Test**:
  - Unit-test a fake `CharacterDb` that counts statements: a 10 s walk gives ≤ 2 UPDATEs and 0 SELECTs.
  - Worker tests: after a close, the D1 row has the final x/y; after a death, hp/place are written at once.

### Slice 3: replace the 100 ms alarm chain with an in-memory loop while sockets are connected (P3, P4)

- **Change** (`room.ts`):
  - Add `private tickTimer: ReturnType<typeof setTimeout> | null`.
  - `startLoop()`: if not running and `figSockets.size > 0` and there is activity (the same predicate `armOrchard` uses today), schedule `setTimeout(tick, tickMs)`.
  - `tick()` runs today's `alarm()` body: sprout, `ripenWorld`, persist (now cheap), `stepChasers`, broadcast. It uses a re-entrancy guard and schedules the next tick from `Date.now()` so it does not drift. When idle it stops, and moves and attacks restart it.
  - Call `startLoop` everywhere `armOrchard(false)` is called today.
  - The alarm is used **only** for the coin sweep (and optionally the next yam due time) and is set at most once a minute.
  - Cache the alarm time in a field instead of calling `getAlarm`.
  - On last socket close, clear the timer.
  - Wrap `tick` in try/catch so one D1 failure does not kill the loop.
  - **Insurance for the CPU-budget question in section 3**: have the client send `{type:'ping'}` every 3-5 s while the tab is visible, and make the server answer pings with nothing (or a tiny message). Each incoming message resets the DO's per-event CPU budget and costs 1/20 of a request: 6 x 7,200 / 4 / 20 ≈ 540 requests per day.
- **Saving**:
  - DO requests drop from 62k-370k to about 2-3k per day (minute alarms at most 720, plus about 1.1k WS messages, plus pings and connects).
  - `setAlarm` writes drop from 61k-367k to at most 720.
- **Risk**: medium.
  - The papaya test clock must keep working. Keep the manual path; the loop simply does not run when `papayaManual`.
  - Errors thrown in timers do not get alarm retries.
  - Make sure there are not two loops after reconnects.
  - Duration is unchanged: the DO already stays resident while sockets are open.
- **Test**:
  - Worker test: with one connected walker, `getAlarm()` is ≥ 50 s out (minute sweep only) while the position still advances in snapshots.
  - Empty room: no timer and no alarm.
  - Existing move/chase/aggro tests on the papaya clock still pass.

### Slice 4: precompute the static map data at build time (P6)

- **Change**:
  - Add `scripts/build-map-data.mjs`, run from the existing wrangler build command next to `build-client.mjs` and with the same write-only-if-changed rule.
  - It imports `route.ts`/`radish.ts` via esbuild (as `/tmp/consult-bench` does) and writes `src/rules/map.generated.ts` with:
    - the route `nodes` and `links`;
    - per zone and per spawn index, the `RadishPatch` (home, radius, stops). 21 small objects; the cells and spots arrays are only needed to build stops and for `patrolSpots` in tests.
  - `fixedGraph()` and `radishPatch()` read the generated tables first and fall back to building.
  - Optionally have `radishPatch` precompute only stops, and leave `patrolSpots` lazy for tests.
- **Saving**: removes the 100-240 ms CPU spikes on every cold DO.
- **Risk**: low. Stale data after a map edit, so add a unit test that asserts the generated tables deep-equal a fresh runtime build (it fails until someone reruns the script).
- **Test**: that equality test, plus timing `planWalk` cold under 5 ms in Node.

### Slice 5: coin lots and the minute sweep (P1 tail)

- **Change**:
  - Keep each connected fig's lots in memory: load them at join, and update them on gain and spend from the planned statements.
  - The minute sweep computes the next expiry from memory and calls `expireCoinLots` only when `nextExpiry.atMs <= now`.
  - Optionally merge gains into the same lot per hour (`UPDATE … amount = amount + ?` when a lot with the same hour bucket exists). That caps lots at about 2-3 per day instead of about 100 per session. It is a rules decision, because expiry gets rounded to the hour. Ask the user before doing it.
- **Saving**: the sweep goes from 6 x 120 x 2 queries reading up to about 0.5M rows per day to near zero. Joins also read fewer rows.
- **Risk**: low-medium, because the in-memory lots must stay consistent with duels (`saveFactsPair`) and purchases. Re-read lots after those, as `refreshBag` already does.
- **Test**: the coin-expiry worker tests stay green, plus a counting-DB test showing that an idle minute issues 0 queries when nothing expires.

### Slice 6: debounce DO storage writes for the cabbage bed (P4 tail)

- **Change**:
  - `storeCabbage()` becomes `markBedDirty()`.
  - Flush at most every 5 s from the tick, at once for seed changes (coins on the ground have value), on last socket close, and in `pullFig`.
  - Chase steps and swings only mark dirty.
- **Saving**: about 52k DO rows per day drops to about 5-9k.
- **Risk**: low. After a crash, monsters may be up to 5 s stale.
- **Test**: count `ctx.storage.put` over a 10 s fight: ≤ 3.

### Slice 7: idle disconnect (P8)

- **Change**: the server closes a socket after 15 minutes with no client message other than pings. The client shows "Paused, click to reconnect". A hidden tab stops pinging.
- **Saving**: caps duration per forgotten tab.
- **Risk**: low.

### Optional

- Serve `index.html`/`client.js` from `assets/`. Negligible saving.
- Leave PBKDF2 at 10k. Moving away from it on Free gives nothing.

## 3. What must still be measured on real Cloudflare

1. **Whether the 10 ms Free CPU limit applies to DO events, and how timers are charged.**
   - My understanding of DO docs: the CPU budget resets on each incoming request, WS message or alarm, and `setTimeout` callbacks run against the current budget.
   - If Free DOs really get 10 ms, a 10 Hz loop at about 0.1-0.3 ms per tick drains it in a few seconds without incoming messages. That is why slice 3 includes the client ping.
   - I am unsure of the exact Free DO CPU number (10 ms vs 30 s) and of how timer CPU is attributed.
   - **Measure**: `wrangler tail` or the dashboard for `exceededCpu` and the per-invocation CPU of the WorldRoom, with one walker and no clicks for 2 minutes.
2. **DO-to-D1 latency**: p50/p95 of one D1 query from the DO, given where D1 and the DO end up placed. This decides whether even the remaining durable writes should be fire-and-forget or batched.
3. **Whether `setAlarm`/`getAlarm` count as DO storage rows written/read** on SQLite-backed DOs. I believe `setAlarm` counts as one row written; I am not certain.
4. **Rows-written accounting for `ctx.storage.put`** on the SQLite KV (1 row, or more with internal indexes) and for D1 inserts with secondary indexes (I assumed +1 row per index touched).
5. **PBKDF2 at 10k iterations on Workers** (CPU time on `/api/signin`), and Worker CPU for `/ws` (`requireSession` + forward).
6. **Whether the 50 D1 queries per invocation applies per DO event** (alarm, WS message, timer callback) and whether timer callbacks count against the last event's budget.
7. **The 20:1 WS-message ratio for non-hibernated sockets.** I believe it applies to all incoming WS messages.
8. **Real usage numbers** after one test evening from the dashboards (DO requests, duration, rows; D1 rows): to check my activity guesses (50% walking, 40% fighting, about 100 kills per session).

## 4. Recommendation

**As it stands, the code is not viable on Free.** D1 reads and writes go over on the first day: about 12M reads and 235k writes. DO requests and DO storage writes go over as soon as sessions do not overlap exactly. A single client can also freeze the world through `X-Papaya-Clock`.

**With slices 1, 2 and 3 (plus 4 for cold-start CPU), Free is comfortably viable for 5-6 accounts:**

| Quota | Estimate | Share of limit |
|---|---|---|
| DO requests | about 2-3k/day | 3% |
| DO duration | about 900-5,400 GB-s | under 45%, add slice 7 for forgotten tabs |
| DO rows written | about 10-60k without slice 6, about 10k with it | |
| D1 rows written | about 5-8k | under 10% |
| D1 rows read | under 0.5M (under 0.1M with slice 5) | |
| CPU per event | about 0.1-2 ms after slice 4 | |

**Minimum to be safe:**

1. Slice 1, the header lockdown.
2. Slice 2, no per-tick D1 writes and no `getById` after writes.
3. Slice 3, the in-memory tick with alarms only for the minute sweep, **plus a client ping every 3-5 s**.
4. Slice 4, precomputed graph and patrol data.

Add slice 6 if `setAlarm`/`put` turn out to be cheap but fights are long. Add slices 5 and 7 before running more than a week.

Before inviting players, do one 30-minute measured session on Free and check items 1-3 of section 3.
