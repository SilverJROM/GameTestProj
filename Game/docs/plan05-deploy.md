# Plan 05 deploy notes (nothing has been deployed)

Settings (Cloudflare secrets, set with `wrangler secret put NAME`; never in files that are committed):
- `SESSION_SECRET`: a new long random string (not the local one).
- `ALLOWED_EMAILS`: comma separated invited emails (the two the developer named). Empty means sign-up is open, so it must be set.
- `INVITE_CODE`: the code in `docs/plan05-tools/invite-code.local.txt` (git-ignored).
- `MAX_ACCOUNTS`: 6.
- `ALLOW_TEST_CLOCK` must NOT be set on the deployment.
- `IDLE_CLOSE_MS` is optional (default 20 minutes).

Steps (each needs the developer's go): `wrangler d1 create game-db`, put the id into wrangler.jsonc, `wrangler d1 migrations apply game-db --remote`
(0001 to 0006), set the secrets, `wrangler deploy`, then a 30 minute measured session. Data persists across deploys (D1 and Durable Object
storage); do not bump WORLD_EPOCH or MONSTER_LAYOUT, and migrations only add.
