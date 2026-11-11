# Security and access model

What protects the live game, what each layer does, and what it does not do. Written to be checked against the code (file names are given).

## Layers, outside in

1. **Cloudflare Access (Zero Trust) in front of the whole hostname** (`game.silverjrom.workers.dev`). An allowed email address is asked for a one-time PIN sent to that address; only then does the page, the API or the WebSocket answer. The policy names the allowed emails, so evaluators and testers are added there (see `README.md`, "Add a tester"). Preview URLs are off (`preview_urls: false` in `wrangler.jsonc`), so the only way in is the hostname behind Access. The Access policy lives in the Cloudflare account, not in this repository.
2. **Account sign-up cap.** The secret `MAX_ACCOUNTS` (6 on the live site) stops new accounts past that number (`src/server/signup.ts`, `account.ts`). Each account has at most 2 avatars (`MAX_AVATARS_PER_ACCOUNT`). The cap bounds the cost of a leak of the Access gate: at worst six accounts exist and the free plan is not exhausted by sign-ups.
3. **Account sign-in.** Username and password. Passwords are hashed with PBKDF2-SHA-256 (`src/server/password.ts`, 10,000 rounds, with a random salt) and compared in constant time. A failed sign-in always waits the same time (250 ms) whatever the reason, so the failure kinds cannot be told apart by timing.
4. **Signed cookies.** The account cookie and the character cookie are `HMAC-SHA256` signed with the secret `SESSION_SECRET` (`src/server/cookie.ts`), `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The account payload is prefixed (`account:`) so it cannot be replayed as a character cookie.
5. **The server is the only authority** (`src/world/*`). The WebSocket carries intentions (move here, attack that, buy this); the room decides. Damage, reach, the 0.45 s swing gap, coin pickup, purchases, equipping, duel pairing, death and respawn are all computed from the stored facts. The client cannot say how much damage it did or how much it earns. Any `id`, `characterId` or similar key in a client message is dropped on receipt (`peelClientMessage` in `src/protocol.ts`); the acting character is the one in the verified cookie. Tests that try to impersonate another character with those keys are in `test/worker/*` (for example the fountain test).
6. **Death is server state** (plan 09). A dead avatar (`hp = 0` in D1) cannot move, attack, duel or sip; the browser's panel is only a display of that fact.
7. **Test hooks are off in production.** The `X-Papaya-Clock` header, which fast-forwards the test clock, is only passed to the room when `ALLOW_TEST_CLOCK=1`, which is never set on the deployed Worker (`src/server/index.ts`).

## Secrets and where they live

| Value | Where | Notes |
|---|---|---|
| `SESSION_SECRET` | Cloudflare Worker secret | Signs the cookies. Never in the repository. Rotating it signs everyone out. |
| `MAX_ACCOUNTS` | Cloudflare Worker secret | See the question below. |
| Cloudflare API token | A local file outside the repository | Used by wrangler from the developer's machine. It is broader than it needs to be and **should be rotated** (see limits). |
| GitHub token | Developer's machine only | Restricted to the one submission repository. |
| Test account passwords | git-ignored local files | `.gitignore` covers them; nothing with a credential is committed. |

D1's `database_id` is in `wrangler.jsonc`. It is an identifier, not a credential: it cannot be used without a token on the account.

## Why is the account cap a secret and not plain config?

Honest answer: it did not need to be one. It is not sensitive. I put it in a secret for two practical reasons: it can be changed in the Cloudflare dashboard (or with `wrangler secret put MAX_ACCOUNTS`) without editing the repository or redeploying code, and the public repository then does not publish how many accounts the live site accepts. A plain `vars` entry in `wrangler.jsonc` would have done the first job too, but a code change and a deploy would then be needed to raise the cap, and `wrangler deploy` would overwrite a value set in the dashboard. The cost of the choice is that the live value is not visible in the repository, which this paragraph and the README make up for.

## What is not protected (limits)

- Access is email based: anyone who can read an allowed inbox can enter. Removing an email from the policy ends that access for new sessions; existing sessions last until their Access session expires.
- The WebSocket handler does not check the `Origin` header itself. It relies on Access, the signed cookie and `SameSite=Lax` (a cross-site page cannot make a browser send the cookie on a WebSocket opened from another site under Lax in current browsers, but I did not test every browser). A second check would be cheap to add.
- There is no rate limiting of sign-in or sign-up beyond the account cap and the fixed failure delay. A stolen allowed email could be used to guess passwords at the speed Access allows.
- PBKDF2 uses 10,000 rounds because the Workers Free plan gives 10 ms of CPU per request. That is far below current guidance for password hashing (hundreds of thousands of rounds). On a paid plan the constant should be raised (`PASSWORD_ITERATIONS` in `src/rules/tables.ts`) and old hashes upgraded at sign-in.
- Passwords cannot be recovered or reset (by design).
- The game has no moderation or chat; names are only restricted for uniqueness and blankness.
- Cloudflare's own platform security (Access, D1, Durable Objects) is relied on and not audited here.
- I have not run an independent penetration test. The checks above are from code review and the automated tests; an Opus review covered the earlier slices but not the plan 06 to 09 client code.
