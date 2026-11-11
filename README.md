# Game: a multiplayer isometric hunt-and-duel world (project A, persistent economy)

A small shared online world that runs in the browser. You sign in, make an avatar, walk the map, hunt wolves, bears and skeletons for coins and experience, buy swords and armor at the forge, and duel other players. Everything is kept on the server: the world, your coins, your gear, and whether your avatar is alive.

- Live game: https://game.silverjrom.workers.dev (behind Cloudflare Access, see "How to access and test")
- Code: https://github.com/SilverJROM/GameTestProj
- Stack: one Cloudflare Worker, one Durable Object (`WorldRoom`, the live world), a D1 database (accounts, avatars, items, coin lots), plain TypeScript and a canvas client. No game framework.
- Route: **persistent economy** (one shared ongoing world; state survives a reload).

The game lives in the `Game/` folder (run all commands there). Documents in `Game/docs/`: `game_reqts.md` (the rules, current), `balance.md` and `balance-tables.md` (balance case and the generated numbers), `security.md` (access model), `limits.md` (what is unverified or open), `asset-provenance.md` (art).

## How to access and test the live game

1. Open https://game.silverjrom.workers.dev.
2. Cloudflare Access asks for an email address. Enter an address that is on the allowed list. A six-digit one-time PIN is emailed to it; type the PIN. (Only allowed addresses get a PIN. Credentials are never kept in this repository; the project owner gives them to evaluators privately.)
3. The game's own page asks for a **username and password**. Choose "sign up" the first time. Passwords are hashed and cannot be recovered.
4. Create an avatar (pick woman or man, type a unique name). Each account has up to two avatars. Press Play.
5. The live site accepts at most **20 accounts** in total. If sign-up says the limit is reached, ask the owner to raise it (see below).

To test duels you need two browsers (or two windows with different accounts, for example one normal and one private window).

### Add a tester (a new allowed email)

You need to be the owner of the Cloudflare account.

1. Cloudflare dashboard, then **Zero Trust**, then **Access controls** (or **Access**), then **Applications**.
2. Open the application named **game test (invited emails)**.
3. Go to **Policies**, edit the Allow policy, and under **Include** add a rule **Emails** with the tester's address. Save.
4. The tester opens the game URL and receives a PIN at that address. No redeploy is needed.

To allow a whole organisation instead of single addresses, add a rule **Emails ending in** with the domain. A domain rule does not cover subdomains, so add each one separately. The live policy currently allows the project owner's address, one invited address, and everyone at `roompoint.app` and `mailer.roompoint.app`.

Opening the app to any email is not recommended: a one-time PIN only proves control of an inbox, so a throwaway inbox passes it. Strangers could fill the 20-account cap and use up the Workers Free daily limits.

To remove access, delete the address or domain from the same rule.

### Raise or lower the account cap

```bash
cd Game
npx wrangler secret put MAX_ACCOUNTS     # type the new number, for example 12
```

It takes effect on the next request. (`MAX_ACCOUNTS` is a secret so that it can change without a code deploy; see `docs/security.md`.)

## Game guide

### Controls

| Action | How |
|---|---|
| Walk | Left click the ground. The avatar takes the shortest route around walls; the town and cemetery gates are open. |
| Hit a monster once | Left click it (walks to it and swings once). |
| Fight a monster to the end | Right click it (walks to it and keeps swinging until it dies). |
| Heal | Stand in or next to the glowing fountain in town: +5 health per second, free. |
| Shop | Left click the forge in town. Buying puts the item in the Bag; equip by dragging or clicking it in the Bag. |
| Bag | The Bag button. Shows coins (and which expire soon), worn gear, level, health, strike, experience. |
| Challenge a player | Right click the player, then Duel. You can Cancel while it waits. |
| Fight your duel partner | Left click (one swing) or right click (swing until one falls) on them. |
| Camera | Medium view by default; the zoom slider zooms in (to about 173 px of map) or out (to about 554 px). Monsters only move while someone can see them. Menu button: settings and sound. |

### The world

- **Town** (lower left): start, forge, fountain. No monsters, no duels.
- **Green fields** (lower right): wolves. Safe for beginners.
- **Grey ground** (upper right): bears, better pay.
- **Cemetery** (upper left): skeletons, which attack anyone who comes within 100 pixels. Best pay, deadly early.

### Progress and money

- Levels 1 to 6; experience comes only from monsters, and the first two levels are quick (24 and 50 xp: 12 and 25 wolves) while the rest takes hours (900, 2,200, 4,400 xp per level). Max health is the level's base plus your armor; strike is the level's base plus your sword. Armor does not reduce damage.
- Levelling up shows a bright glow and a rising "Level N" plate over your avatar.
- Every avatar has a pet picked at random when it is made: dog, cat or tiger cub (30% each) or axolotl (10%). The pet follows you and fetches coins.
- A kill drops a coin; your pet fetches it (a short pickup) and the coin is added to your purse.
- Forge: short sword 900, long sword 2,000, great sword 3,500 (more strike); leather 800, chain 1,800, plate 3,200 (more max health).
- Coins expire 7 days after you get them (spent oldest first). The Bag warns two days ahead.
- The bag of items belongs to the account and is shared by its two avatars (one piece is worn by one avatar at a time).

### Death

Death is real. If your health reaches 0 (a monster or a duel), your avatar **stays dead where it fell**; others see a cross. You see a death panel, and after about a second a **Respawn** button, which puts you back in town at full health with your level, experience, gear and coins. Everything in progress stops (a monster chase, a duel, your pet's fetch). If you leave while dead, you come back in town at full health.

### Duels

Only in the fields, by request and accept. Everyone fights as a **level 3** character (92 health, strike 6) plus their own sword and armor, so what you farmed decides the fight, not your level. Your real health and experience are not touched. The loser dies where they fell and pays half their coins (rounded down) to the winner. Walking into town ends a duel.

Full rules: `docs/game_reqts.md`. Balance case: `docs/balance.md`.

## Set up and run it yourself

Needs Node.js 20 or newer (22 was used), npm, and git. Cloudflare account only for deploying.

```bash
git clone https://github.com/SilverJROM/GameTestProj.git
cd GameTestProj/Game          # if the repository root is the Game folder, stay in the root
npm install
```

### Run locally

```bash
# one-time: a local secret for signing cookies (this file is git-ignored)
echo 'SESSION_SECRET=any-long-random-string-for-local-use' > .dev.vars
# one-time: create the local database tables
npx wrangler d1 migrations apply game-db --local
# start the game
npx wrangler dev --port 8787 --local
```

Open http://localhost:8787, sign up, and play. Locally there is no Access screen and sign-up is open. Wrangler runs the client build first (`scripts/build-client.mjs`, `scripts/build-precompute.mjs`).

### Tests and simulations

```bash
npm test                 # vitest: unit, worker (real Worker and Durable Object) and integration tests
npm run sim -- --seed 7  # the three small rule scenarios, deterministic for a seed
npm run balance          # rewrites docs/balance-tables.md from the rules
```

On a small machine run one test file at a time (`npx vitest run test/unit/sim.test.ts`); the worker tests each start a Worker.

### Deploy to Cloudflare (Workers Free plan is enough)

```bash
npx wrangler login                              # or export CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
npx wrangler d1 create game-db                  # copy the database_id it prints into wrangler.jsonc
npx wrangler d1 migrations apply game-db --remote
npx wrangler secret put SESSION_SECRET          # a new long random string
npx wrangler secret put MAX_ACCOUNTS            # the live site uses 20
npx wrangler deploy
```

Do not set `ALLOW_TEST_CLOCK` on a deployment (it is a test hook). Then protect the hostname: Zero Trust, Access, Applications, add a **Self-hosted** application for your `*.workers.dev` hostname, with an Allow policy listing the emails, and the one-time PIN login method. Migrations only add tables, and data survives deploys.

The Free plan limits that shaped the code: 10 ms CPU per request (so password hashing is only 10,000 PBKDF2 rounds), 100,000 requests a day, and D1 row limits. The room therefore ticks in memory, saves positions at most every 1.5 s, and closes idle connections.

### Project layout

```
src/rules      the numbers and pure rule functions (tables, logic, regions, route, coins); used by the game and the simulations
src/world      the live room: Durable Object (room.ts), movement, combat, monsters, pets, duels
src/server     Worker entry, sign-up and sign-in, cookies, D1 access
src/client     the browser game: canvas, input, panels, sound
src/sim        deterministic simulation; scripts/ holds the command line and the balance study
migrations     D1 schema (0001 to 0006)
test           unit, worker and integration tests
docs           requirements, balance, security, limits, plans
```

## Known limits

Short version (details in `docs/limits.md`, `docs/security.md`, `docs/balance.md`): the pacing is modelled but not measured with players, top gear dominates duels, Free-plan load is not measured on a live session, password hashing is deliberately light.

## Repository layout and starter files

- `Game/` is the whole project: source, tests, migrations, simulations and documents.
- The remaining top-level files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/`, `.agents/`, `.grok/`, `tasks/`, `tools/`, `evaluation-connection.json`) come from the assessment starter. They are not part of the game, and no credentials are kept in them.
