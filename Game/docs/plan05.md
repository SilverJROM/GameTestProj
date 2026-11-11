# Plan 05: make the app fit Cloudflare Free, lock it down, deploy (PLAN ONLY, not started)

Written 2026-11-11 (PHT). Based on two independent reads: `docs/plan05-consult-opus.md` (Opus, measured in Node) and
`docs/plan05-consult-grok.md` (Grok 4.7). Both reach the same verdict: **not viable on Free as it is, viable after slices A to E.**

## Why (daily Free quotas, 6 accounts, about 2 h each, one shared room)
- The 100 ms Durable Object alarm chain: 72,000 DO requests and 72,000 alarm row-writes for a together session (cap 100,000 each); 216,000 if sessions are spread out.
- A position save to D1 on every walking tick (10 a second) plus a full read-back: about 216,000 row-writes (cap 100,000) and 12M reads on day 1 (cap 5M), growing as coin lots pile up.
- First routed click about 115 to 240 ms CPU and first patrol tick about 95 to 185 ms (Free CPU is 10 ms; unclear whether that applies to Durable Objects).
- The `X-Papaya-Clock` header lets any client freeze or fast-forward the world.
- Duration (13,000 GB-s) is fine unless a tab stays open all day.

## Slices
| # | Slice | Level | Notes |
|---|---|---|---|
| 1 | `X-Papaya-Clock` only when an env flag is on (off in production, on for tests and `.dev.vars`); the Worker strips the header otherwise | L1 | requested first |
| 2 | Build-time precompute of the route graph and patrol cells (generated modules plus a test that they equal a fresh build) | L2 | removes the 100 to 240 ms cold hitches |
| 3 | Replace the 100 ms alarm chain by an in-memory timer while sockets are connected; alarm only as a 60 s watchdog and the coin sweep; client ping every few seconds | L2 | biggest quota saving; game speed unchanged |
| 4 | Position saves: keep the foot in memory, flush on stop, zone change, every 1 to 2 s while walking, on disconnect and on death; no read-back after a save | L2 | up to about 1 s of position lost on a hard crash |
| 5 | `storeCabbage` at most once a second during chases; immediately on kill, sprout, coin and last close | L2 | |
| 6 | Idle sockets closed after 20 minutes | L1 | guards the duration meter |
| 7 | Account cap: at most 6 accounts (a count check on sign-up), 2 avatars each | L1 | D1 "max it for 5 to 6 accounts" |
| 8 | Access lock to the two allowed emails (see decision 1) | L1/L2 | |
| 9 | Deploy: create D1, apply migrations 0001 to 0005, set `SESSION_SECRET`, deploy, 30 minute measured session on Free, rotate the token | L2 | needs the go |

Optional later: coin lots kept in memory so the minute sweep costs almost nothing; PBKDF2 stays at 10,000 rounds unless a real Worker log shows over 10 ms.

## Data persistence
D1 and Durable Object storage survive deploys. The world starts empty once; after that no deploy resets it (no epoch bump, migrations only add).
