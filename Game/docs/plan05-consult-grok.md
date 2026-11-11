# Free-plan fit: one `WorldRoom`, six accounts, about two hours each

Read-only look at `main`. One Worker, one SQLite Durable Object (`idFromName('world')` in `src/server/index.ts`), one D1 database. All six accounts share that single object. Numbers below use the limits you listed. Two published Cloudflare pages disagree about Durable Object CPU; that disagreement is called out where it changes the conclusion.

Local timings are Node 22 on this machine (`esbuild` bundle of the rule modules, not wrangler). They are not Workers CPU.

## What the hot path actually does

`kaleConstants.tickMs` is 100. While any socket is open, `armOrchard` in `src/world/room.ts` schedules a DO alarm for `Date.now() + 100` whenever any of these is true:

- a fig is walking (`figMoving`)
- any beet has a target (`anyAggro`)
- a beet was watched (`anyBeetWatched`: a connected fig is in that beet's zone, or the beet sits in the widest camera window plus `viewPadPx` 150)
- a connected fig still owns a ground coin (`anyDigDue`)
- a bite just landed, or a yam is due sooner

Standing in green, grey, or the cemetery keeps the 100 ms chain on, because those zones have beets and a watched beet patrols. Standing in town with your own coin still on the ground does too, because the pet dig keeps the tick armed. The once-a-minute coin sweep is the schedule only when none of the above is true (town, not walking, no owned seeds, no chase). An empty room arms nothing.

Each of those alarms calls `storage.setAlarm`. Cloudflare bills **each `setAlarm()` as one SQLite row written**, on top of the request. Patrol movement is broadcast and is not stored. A chase step sets `changed` and `storeCabbage()` writes the whole bed on that same tick (`storage.put` of one key, one more row).

A walking fig produces a D1 patch every tick. `ripenFig` returns `{x, y}` whenever the foot moves (12 px/tick at 120 px/s), `ripenDue` collects it, and `persistPersimmons` calls `saveFacts`. `saveFacts` runs the `UPDATE`, then `getById`, which always re-reads the character, all of that character's `coin_lots`, and the account bag. That is **1 D1 row written and 4 D1 queries per moving fig per tick**. The close handler does not write the foot again. It assumes the tick already did.

`X-Papaya-Clock: ripe` on any socket sets `papayaManual` for the whole room. `alarm()` then returns without arming another alarm. A later `ripen` message fast-forwards up to 10,000 ticks in one call.

The visibility graph is a module-level cache built on the first `planWalk` (`fixedGraph` in `src/rules/route.ts`), which runs inside the DO on the first routed click. Patrol cells are a module-level cache built on the first `radishPatch` / `patrolSpots` for that zone (`zoneCells` in `src/rules/radish.ts`, 10 px grid, map 1280×720, 9,216 candidates, 65 solid wall segments).

## 1. Ranked problems

Shared constants:

- 10 alarms per hot second, and 10 `setAlarm` row-writes per hot second
- 10 D1 character-row writes per second per fig who is walking
- Duration is billed at 128 MB for the whole time a socket accepted with `serverSocket.accept()` is open: `seconds × 128/1000` GB-s. One object, so six sockets do not multiply it.
- Incoming WebSocket messages bill at 20 messages = 1 request. The client never sends `ping`. Outgoing snapshots are not requests.
- Worker request quota (100,000/day) is a different meter from DO requests. Page loads and `/ws` upgrades do not spend the DO meter. Pictures and sounds are static assets.

**Room-hours** (how long the one object is hot) depend on overlap. **Walker-hours** are 6 × 2 h = 12 either way.

| Play shape | Room hot | DO alarm requests | `setAlarm` row-writes |
|---|---:|---:|---:|
| Same 2 h together | 7,200 s | 72,000 | 72,000 |
| Spread over 6 h | 21,600 s | 216,000 | 216,000 |
| No overlap, 12 h | 43,200 s | 432,000 | 432,000 |
| Daily cap |  | 100,000 | 100,000 |
| Hot time that fills the cap | 10,000 s ≈ **2.78 h** |  |  |

A together session is already about 72% of both DO meters, before clicks, joins, and chase saves. Clicks are small: even 20 messages/minute × 6 people × 2 h = 14,400 messages = 720 billed requests. The leftover after a clean 2 h session is about 28,000 requests and 28,000 row-writes, which is **about 45 minutes** of one more hot connection. A tab left in the fields, or in town with a coin still on the ground, spends that in three quarters of an hour. A second session the same UTC day does not fit.

Chase makes the storage meter worse. Every chase or bite tick also `put`s the bed, so a hot combat second is about 20 row-writes, and the cap falls to about **1.4 h** of continuous combat. Half of a 2 h together session spent in a chase is 72,000 + 36,000 = 108,000 row-writes.

### 1. DO requests from the 100 ms alarm

Certain. Cap is about 2.8 hot room-hours per UTC day. The test as described uses 2 h if everyone plays together and then disconnects, and several times that if they play in turns or leave a character standing in a monster zone. Exceeding the cap fails further DO operations until 00:00 UTC. The game stops advancing.

### 2. DO row-writes from `setAlarm`, plus `storeCabbage` during combat

Certain, same arithmetic as the requests, plus one extra row on every tick where aggro, a bite, a kill, or a yam changes the bed. Patrol-only ticks do not `put` the bed. A together session with real fighting goes over 100,000 writes. Idle town with no owned coins is the exception (about one `setAlarm` per minute, ~120 writes per hour).

### 3. D1 row-writes of `x, y` every walk tick

Certain from the code. Budget: 100,000 / 10 = **10,000 walker-seconds ≈ 2.8 walker-hours of continuous walking per day for the whole deployment**, before coins, hp, shop, and sign-up.

12 player-hours × fraction walking × 10 writes/s:

| Fraction of play spent walking | D1 character updates |
|---:|---:|
| 10% | 43,200 |
| 23% | 100,000 exactly, nothing left |
| 35% | 151,200 |
| 50% | 216,000 |

There is no play trace for the fraction. At 120 px/s a long click is a few seconds of walking between stops, so 25–40% is a fair guess for people actually playing, and that guess is over the cap. Add a smaller pile on top: a bite is another character update about once a second per fig in melee; each coin seed is an `INSERT` into `coin_lots` plus a purse update (a seed every 2.25 s while the owner is connected and has coins). Both avatars online doubles the walk writes (the cap is two figs per account).

This meter scales with walkers, so playing “together” does not save it.

### 4. First-use CPU inside the DO, and PBKDF2 on the Worker

Measured here:

| Work | Time | Notes |
|---|---:|---|
| First `planWalk` (builds the graph) | **142 ms** | Project note from plan 04 was about **240 ms**. Same pair cached: 5.0 ms. Straight line: 0.2 ms. Click on a wall (snap): 7.4 ms. |
| `patrolSpots('green')` first | **57 ms** | 3,136 spots. Cached: 0.1 ms. |
| grey, then cemetery | 25 ms, 13 ms | 1,836 and 921 spots. Town has no leeks, so 0 spots and ~0 ms. |
| All three zones, first time | **~95 ms** | |
| `radishPatch` for 21 beets after cells exist | **12 ms** | Loop building. |
| PBKDF2-SHA-256, 10,000 iters | **15.4 ms first, then ~2.9 ms** | Node `crypto.subtle`. Sign-in and account create both do this (`src/server/password.ts`, `PASSWORD_ITERATIONS`). |

Workers Free HTTP CPU is 10 ms. The DO limits page (7 Nov 2026) lists **30 s CPU per DO request** with no Free/Paid split, and the FAQ also says DOs use the same CPU limit as Workers. If the DO is really capped at 10 ms, the first routed click and the first patrol tick are killed, the module cache never sticks, and walking around walls and patrolling never succeed. If the DO really has 30 s, those builds are a one-time hitch of roughly 0.1–0.3 s per cold object, and the steady tick (cached graph, cached cells, 21 beets) is the thing that has to stay under whatever cap is real. Sign-in is definitely a Worker request: a warm hash looks fine at ~3 ms; a cold isolate at ~15 ms can fail the first login of the day. Unconfirmed until a real `cpu_time` log exists.

### 5. `X-Papaya-Clock` on a shared URL

Any client can freeze the room clock or fast-forward up to 1,000 seconds of simulation per message. That is a cheat, and the fast-forward is also a write burst (one D1 `saveFacts` per tick of movement, and the 50-query cap will throw mid-burst). Documented already in `docs/plan03-status.md`. Not a quota problem in normal play. It has to be local-only before any shared deploy.

### 6. Duration, D1 queries, D1 reads

Duration for this test is inside the cap if people disconnect:

- 2 h together: 7,200 × 0.128 = **922 GB-s** (about 7% of 13,000)
- Room occupied 6 h: **2,765 GB-s**
- Room occupied 12 h: **5,530 GB-s**
- One socket left open a full UTC day: 86,400 × 0.128 = **11,059 GB-s** (about 85%)
- Cap at 128 MB: **28.2 h** of one object with a socket open

Switching the tick to an in-memory timer does not shrink this. `accept()` bills the whole connection. A forgotten tab is the way to hit it, and only after the alarm meters are fixed. Six connections still count as one object.

D1 queries: one on-time tick with 6 walkers is about 6 × 4 = 24, under 50. `ripenDue` catches up every missed 100 ms inside the next alarm. Two catch-up ticks with 6 walkers is about 48. Three is about 72 and the invocation fails. A slow D1 round-trip makes this likely, because six sequential `saveFacts` calls (update plus three reads each) can take longer than 100 ms of wall time. Wall time is not CPU, and the alarm wall limit is 15 minutes, so the tick would lag rather than CPU-timeout, then catch up and trip the query cap.

D1 reads: the 5M/day cap is fine on a fresh database. It gets worse only if per-tick `getById` stays and `coin_lots` grows (every pickup is its own row, kept 7 days). Example: 100,000 position saves × 80 lots ≈ 8M lot-rows read. Fixing the write rate removes this.

D1 storage (5 GB), DO storage bytes (the bed is one small JSON value), Worker subrequests on sign-in and `/ws` (a handful), and static assets are not the problem for six people.

## 2. Fix slices

Order is the order to land them. Each slice is safe to ship alone.

### Slice A — precompute the graph and the patrol cells

Build a script (call it from the existing `build.command` in `wrangler.jsonc`, next to `scripts/build-client.mjs`) that runs `fixedGraph` and `zoneCells` once and writes a generated module, for example `src/rules/route-graph.generated.ts` and `src/rules/patrol-cells.generated.ts`. `fixedGraph` and `zoneCells` return those tables.

- Saving: removes a 140–240 ms hitch and a 13–95 ms hitch from the first click and the first patrol tick. Steady play does not get faster. This is what makes the game work if DO CPU is 10 ms.
- Risk: the generated points must match the live builder exactly (floats padded by `ROUTE_PAD_PX`, grid at half-steps of 10). A wall or spawn edit that does not regenerate the file will desync routes and loops.
- Test: existing `test/unit/route.test.ts` and `test/unit/patrol.test.ts`. Add one test that rebuilds in memory and deep-equals the generated nodes, links, and spots.

### Slice B — in-memory 100 ms tick while a socket is open

In `src/world/room.ts`, replace the 100 ms `setAlarm` chain with one chained `setTimeout` (schedule the next tick at the end of the handler so a slow tick cannot overlap). Run the same body `alarm()` runs now: `sproutCabbage`, `ripenWorld`, chase, broadcast. Fold the coin sweep into that loop (every 60 s of the same clock). On the last `close`, clear the timer.

Keep `alarm()` as a 60 s watchdog only: if sockets are still open and the timer is not running, start it and do the sweep. While the timer is healthy, do not call `setAlarm` at all, or call it once a minute for the watchdog. Once a minute is 120 row-writes and 120 DO requests over a 2 h session.

Do not move to the WebSocket hibernation API for this test. Hibernation will not run a 100 ms timer, and duration for 2 h is only ~922 GB-s.

- Saving: about **10 DO requests/s and 10 `setAlarm` row-writes/s** drop to ~1/minute. A 2 h together session falls from ~72,000 to a few hundred DO requests, plus click messages at 20:1.
- Risk: a DO eviction drops `setTimeout`. The watchdog (or the next client message, which should start the timer if it is dead) has to restart it. `accept()` already keeps the object up for the socket, so eviction during play is uncommon. Gameplay speed stays 100 ms. Tests that drive time with `X-Papaya-Clock` and `ripen` stay on that path and must not start the wall timer.
- Test: extend `test/unit/patrol.test.ts` (the empty-room case already stubs `setAlarm`). Assert a connected, non-papaya room does not `setAlarm` every tick, a stepped timer moves a fig and a watched beet, and the last close leaves no timer and no 100 ms alarm.

### Slice C — stop writing feet every tick

In `persistPersimmons` / `saveFacts`, do not flush a patch that is only `x`, `y`, or `place` on every tick. Keep the live foot in memory. Flush that fig when the walk stops, when `place` changes, on disconnect, and at most once a second while still walking. `saveFacts` must not call `getById` for that patch. The close handler currently skips the write on purpose (`room.ts` around the socket `close` listener). A throttled flush has to write there, or a disconnect loses the last second of position.

Hp, xp, coins, and gear keep writing immediately.

- Saving: walk writes fall from 10/s/fig to at most 1/s/fig. At a 35% walk fraction that is 12 × 3600 × 0.35 = **15,120** character updates per day, plus bites and coin inserts. That sits under 100,000 with room for a bad day. Query count per tick falls from ~4 per walker to about 0 on most ticks, so a catch-up tick no longer threatens the 50-query cap. Lot-row reads fall with it.
- Risk: a crash in the last second reloads an older foot. Acceptable for this test. Two overlapping flushes must stay on the existing per-room bag queue only where coins are involved. Position updates of different figs can stay sequential and simple.
- Test: a worker or integration test on the papaya clock that walks for several ticks and expects one D1 update per flush interval, plus an update on the final stop and on `pullFig` / socket close. Existing pickup, shop, and hit tests still see immediate purse and hp writes.

### Slice D — throttle `storeCabbage`

`storeCabbage` on aggro change currently runs every chase tick. Write the bed on kill, yam sprout, disconnect, coin-seed add/remove, and at most once a second while a chase is in progress. Patrol-only ticks already skip the put. Keep doing that.

- Saving: combat drops from +10 row-writes/s to +1/s. Combined with slice B, a 2 h session is on the order of a few thousand DO row-writes even if someone is always in a fight.
- Risk: a crash mid-chase reloads beets from up to 1 s ago. Targets and yams must still flush on the events that matter (death, sprout, last socket close), or a killed beet can reappear.
- Test: `test/worker/chase.test.ts` and `test/unit/patrol.test.ts`. Assert many patrol ticks produce no `put`, and a chase of N ticks produces about N/10 puts plus one put on the last close.

### Slice E — papaya clock is local-only

Gate `PAPAYA_CLOCK_HEADER` on an env binding (for example `PAPAYA_CLOCK=on`) in `WorldRoom.fetch`. Omit it from production `wrangler.jsonc`. Set it in the vitest/miniflare bindings and in local `.dev.vars` so `scripts/e2e-two-client.mjs` and the worker tests keep working. Strip the header in `forwardFig` when the flag is off, so a client cannot turn the flag on by talking to the Worker.

- Saving: none of the quota. Removes a remote freeze and a 10,000-tick write bomb.
- Risk: forgetting the flag in CI makes every socket test run on the wall clock and time out. The flag default must be off.
- Test: one test that a socket without the env flag ignores the header and does not set `papayaManual`. Existing suites stay green with the flag on.

### Slice F — optional idle close

If a socket sends nothing for a long stretch (20–30 minutes), close it. Duration is the only meter this protects. A full UTC day with one tab open is already ~85% of 13,000 GB-s, so this is margin, not the first fix.

- Test: a unit test on the close path. Do not change combat rules.

### Slice G — PBKDF2 only if a real log says so

Do not lower `PASSWORD_ITERATIONS` on the Node numbers alone. The stored string already carries the iteration count, so a lower count applies to new hashes and old hashes still verify. If Worker `cpu_time` for `POST /api/signin` is over 10 ms, drop the count (1,000–2,000 is the usual next step) and re-measure. Raising it on the free plan will make sign-in fail.

## 3. Measure on real Cloudflare before calling it safe

One short deploy, Workers logs plus the account’s DO and D1 graphs. A few minutes is enough for the rates. The daily totals follow by multiplying.

1. DO CPU cap. Log `cpu_time` for the first routed click and the first tick that builds a zone, before slice A. If either invocation dies with `exceededCpu`, the cap is 10 ms and slice A is mandatory. If they succeed, record the milliseconds anyway.
2. Warm sign-in and cold sign-in `cpu_time` for `POST /api/signin` (10,000 iterations).
3. One minute of one character walking: D1 rows written, D1 queries in the alarm, and alarm wall time. Confirm the per-tick write is 1 row and the re-read is about 4 queries, and whether wall time exceeds 100 ms.
4. Dashboard row-writes for that minute. Confirm each `setAlarm` counted as 1 row, separate from `put`.
5. Duration GB-s over a 10-minute socket. Expect about 10 × 60 × 0.128 = 77 GB-s.
6. Whether one `db.batch` of 3 statements counts as 1 or 3 against the 50-query cap (the coin sweep and expire-on-join use a batch).

## 4. Recommendation

**Not viable as it stands.** A together two-hour session of six people spends about 72,000 of 100,000 DO requests and the same number of DO row-writes, and it spends the entire D1 write budget once walking is more than about a quarter of play time. A leftover hot tab or a second session the same day fails the DO. Combat `put`s can push row-writes over the cap inside the first session.

**Viable on the free plan after slices A–E**, for this size of test, with the measurements in section 3 done once:

- In-memory tick (slice B) is the change that makes the DO request and `setAlarm` meters safe. Expect a few hundred DO requests and, with the watchdog, ~100 row-writes from alarms in two hours.
- Position flush at 1 Hz or on stop (slice C) is the change that makes D1 writes safe. Expect on the order of 15–40k character and coin rows in a full day of this test, against 100,000.
- Chase flush at 1 Hz (slice D) keeps combat from adding another 10 row-writes/s.
- Precomputed graph and cells (slice A) are required if the DO CPU cap is 10 ms, and worth landing anyway so a cold object does not stall the first click for 140–240 ms.
- The clock header (slice E) is required before anyone but you can open the URL.

Duration does not need a code change for a two-hour session that disconnects (~922 GB-s). Slice F is the cheap guard if laptops stay logged in overnight. Leave PBKDF2 at 10,000 until a Worker log shows a sign-in over 10 ms.

After A–E, the residual risks are a DO eviction losing the in-memory timer (covered by the 60 s watchdog), up to one second of foot and beet position lost on a hard crash, and a tab left open all UTC day using ~85% of duration. None of those is the current failure mode. The current failure mode is the 100 ms alarm.
