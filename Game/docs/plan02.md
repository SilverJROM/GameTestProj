# Plan 02: smaller avatar, accounts, EXP and coin fix, faster pet, shop and bag UI, closer zoom

This document is `docs/plan02.md`.

Status: **REVISED with your answers to Q1–Q6, waiting for your review.** No game code has been changed for this plan. Implementation starts only when you say go. Section "Decisions" lists what you settled and the few small things I chose myself.

Same rules as `docs/update01_plan.md`: everything not mentioned here stays as it is. Numbers live in `src/rules/tables.ts` only. Map numbers are pixels on the 1280×720 map.

## What I found in the current code

- **Avatar size:** the player is drawn 96 px tall (`APPLE_SCALE_PX.player` in `src/client/sprites.ts`).
- **Login:** `POST /api/login` takes a name and a gender, and creates or returns one character by name. There are no accounts. The cookie holds only a character id (`src/server/login.ts`, `session.ts`, `cookie.ts`). The `characters` table has no owner column (`migrations/0001_init.sql`).
- **EXP and coins:** investigated in the running game, see "Investigation results" below. The server is correct. The page's Bag and Blacksmith panels show a frozen copy of the numbers from the moment they were opened.
- **Pet speed:** `pearTimings.coinPickupSeconds` is 4, and each coin is picked up one after another, so a wolf's 4 coins take 16 s. See question Q7.
- **Shop and bag:** both are plain HTML lists (`#quince-smith`, `#olive-sheet` in `src/client/index.html`, filled in `src/client/main.ts`). They do not match the approved mockups in `docs/mockups/index.html` (sections 10 and 11) and `docs/mockups/screenshots/approval-shop-buy.png`, `approval-inventory.png`, and `approval-town-smith.png`.
- **Zoom:** `viewBox` in `src/client/camera.ts` takes 75 percent of the zone box on the tighter axis, then widens to fill the 16:9 canvas. In town that shows 787 × 443 px, which is about 121 percent of the town's width and about 91 percent of its area. That is why it feels zoomed out.

## Investigation results (EXP, coins, gear)

I ran the real game (`wrangler dev` with local D1, driven in Chrome with Playwright) and recorded what the server sent and what the page showed. The script was a throwaway outside the project, and nothing in the repo was changed.

**EXP and coins**

| Check | Result |
| --- | --- |
| Kill a wolf at level 1, no gear | Server sent XP 0 → 2 (the wolf's `xp` is 2). **Server is correct.** |
| Bag open during the kill | Still showed "Experience 0 / 10". It never updates. |
| Click Bag again to refresh | Not possible. The open panel covers the Bag button, and the panel has no Close button. |
| Coins after the kill | Purse went 0 → 1 → 2 → 3 → 4 at 3.8 s, 7.9 s, 11.8 s, 15.9 s. **Server is correct,** but slow: one coin per 4 s. |
| Bag after all 4 coins landed | Still showed "Coins: 0". |
| Blacksmith panel after a purchase | "Your coins" shows the amount from before the purchase (200 after buying a sword that left 182). Buy buttons do not re-check what you can now afford. |

**Cause:** `onBag` and `onSmith` in `src/client/main.ts` write the panel text once, when the panel opens. The snapshot handler (`onSnapshot`) never rewrites an open panel. There is also no always-visible XP or coin readout, so during play there is nowhere to see the numbers change. The earlier suspicion (snapshots not carrying XP) was wrong: every snapshot already includes the player's `character`.

**Gear**

| Check | Result |
| --- | --- |
| Short sword (Strike +2) | Bag Strike 4 → 6. In a real fight, hits were 4 before and 6 after. |
| Great sword (Strike +7) | Bag Strike 11. Real fight hits: 11. |
| Leather / Plate (Max HP +12 / +40) | Max HP 70 → 82 → 110. Correct. |
| Current HP when armor is bought | **Does not rise.** Bought at 40 HP: it stayed 40 / 110. The rule (`purchase`) only clamps health down, so max HP grows and current HP does not. |
| Wolf bites with Plate | Still 5 per bite. By the rules, armor adds max HP only and never reduces damage. Not a bug, but worth knowing. |
| Replacing gear | Plate after Leather cost 64 coins and the Leather's 16 is not returned (stated in the shop note). |

**Existing tests:** 5 tests fail today, before any change by me, and fail again on a second run, so they are not flaky. They are in `test/integration/duel.test.ts`, `test/integration/room-core.test.ts`, and `test/worker/duel-fight.test.ts`. The failures look like position checks (a fig expected in the green is in town, a position is off by the wall) that the update 01 wall rules probably made out of date. I have not investigated them further. See slice 0.

## Changes

### 1. Every avatar 40 percent smaller

All heights in `APPLE_SCALE_PX` (`src/client/sprites.ts`) are multiplied by 0.6 and rounded, so every character keeps the same size relative to the others:

| Kind | Now (px) | New (px) |
| --- | --- | --- |
| Player | 96 | 58 |
| Skeleton | 96 | 58 |
| Blacksmith | 96 | 58 |
| Bear | 80 | 48 |
| Wolf | 56 | 34 |
| Axolotl (pet) | 40 | 24 |

- Walk, attack, and pickup stills use the same height as the stand still of that kind, as they do now.
- Anything placed from a sprite's height follows it: the name label, health bar, aggro glow (it is sized from the head position), damage numbers, and the click target. Tests that assert the old numbers are updated.
- The ground coin (`COIN_DRAW_PX`, 40) is not an avatar. It stays 40 px so it can still be seen and clicked at the closer zoom.
- The login preview keeps its 240 px height, since it is a form picture and not a map sprite.
- Because the camera zooms in at the same time (change 5), a player ends up about 116 px tall on screen in town, down from about 156 px today.

### 2. Accounts, with two avatars each

**Data (migration `0002_accounts.sql`):**

- New table `accounts`: `id`, `username`, `username_key` (trimmed, lowercased, UNIQUE), `password_hash`, `salt`, `created_at`.
- `characters` gets `account_id`, `NOT NULL`, indexed.
- **Fresh start (your Q4 answer):** the migration deletes every existing character, and the saved world (monsters, ground coins, pending pickups, event log) is cleared too. Nothing from before accounts is kept or tracked. From then on, a character, its coins, gear, and XP exist only through an account. I check how the room stores its world before slice 6 and clear all of it, then run the reset on local D1 only.
- A character name stays unique across the whole world (the current `name_key` rule). Deleting an avatar frees its name.

**Passwords:**

- Hashed on the server with PBKDF2-SHA-256 from WebCrypto (available in Workers), a random salt per account, and a constant-time compare. No password is stored or logged in plain text.
- Username: 3–20 characters, letters, digits, dash, underscore. Password: at least 8 characters. There is no email, so **a forgotten password cannot be recovered.** The login form says so.
- Failed sign-ins get one generic message ("Wrong username or password") and a short delay, so the form does not reveal which usernames exist.

**API (new routes, all JSON):**

| Route | What it does |
| --- | --- |
| `POST /api/account` | Create an account from username and password, sign in, set the account cookie. |
| `POST /api/signin` | Check username and password, set the account cookie. |
| `POST /api/signout` | Clear both cookies. |
| `GET /api/avatars` | The signed-in account's avatars (up to 2): name, gender, level. |
| `POST /api/avatars` | Add an avatar (name, gender). Refused when the account already has 2. |
| `DELETE /api/avatars/:id` | Delete one of the account's own avatars, with its coins and gear. |
| `POST /api/play` | Pick one of the account's avatars and enter the world as it. Sets the character cookie. |

- The account cookie is signed with `SESSION_SECRET`, the same way as today. The existing character cookie stays and is only issued by `/api/play`, after checking that the avatar belongs to the signed-in account.
- Every avatar route reads the account from the cookie. An id sent in the body or URL is checked against that account and never trusted on its own, so one account cannot play or delete another's avatar.
- The two-avatar limit is enforced on the server in one conditional insert, so two quick requests cannot make a third.
- Deleting the avatar that is currently in the world also closes its live connection and removes it from the world.

**Screens (replaces the current single login form):**

1. **Sign in / Create account:** username, password, two buttons. An error line under the form.
2. **Your avatars:** two slots. A filled slot shows the name, level, and a stand-still preview, with **Play** and **Delete** (delete asks for a confirmation click). An empty slot shows **Add avatar**, which opens the existing woman/man + name form with the stand-still preview.
3. A **Sign out** link on screen 2. Playing from screen 2 enters the map as before.

Resume: signing in on any day lists the same avatars with the coins, gear, level, XP, place, and position already stored. Nothing about the world save changes.

### 3. EXP, coin count, and pet speed

**3a. Cause: confirmed** (see Investigation results). The server needs no change for EXP or coins.

**3b. Fix: make the panels live.**

- The Bag and Blacksmith panels re-render from the latest numbers on every snapshot while they are open. No new server message is needed.
- Both panels get a Close button (change 4), so you can always get out of them.
- A regression test opens the Bag, kills a wolf, and checks that "Experience" and "Coins" change without closing and reopening it.

**3c. Always-visible numbers:** a small HUD, top left under the health bar, shows `Lv N`, `XP x / y`, and `Coins n`, updating live as XP and coins arrive. The Bag still shows the full sheet. At the level cap the XP line shows the total with no "/ next".

**3d. One coin per kill, with a value (your Q7 answer):**

- A kill drops **one** coin icon at the monster's spot, not one per point of value. The coin carries a `value`: the monster's `coins` from the table (wolf 4, bear 10, skeleton 18). The ground picture stays the same coin icon.
- You are free to walk away as soon as the monster dies. The pet goes to the coin wherever it lies, picks it up, and the whole value lands in the purse at once. Then the pet comes back and follows you again.
- Pickup time is `pearTimings.coinPickupSeconds`, changed from 4 to **2.25 s** (inside your 2–2.5 s range). It now covers the whole value, not one point.
- When the coin lands the HUD coin count jumps by the value and a gold "+4" floats up for one second.
- Code: `CoinSeed` and `CoinSnapshot` get a `value`; `hurtBeet` (`src/world/monsters.ts`) creates one seed with that value; `stepPickups` (`src/world/pets.ts`) adds `value` instead of 1; the client reads the value for the float. Tests in `test/worker/pickup.test.ts` and `test/integration/hunt.test.ts` that count 4 seeds and +1 per seed are rewritten. I will grep for any other place that assumes 4 seconds or one coin per point.
- Only the killer's pet takes it, as today. If the owner leaves the game before the pet gets there, the coin waits, as today.

**3e. Armor and hit points:** this is now part of the equipment change (change 6). Equipping armor raises Max HP and leaves current HP where it was. Unequipping lowers Max HP and clamps current HP down to it. A test pins both.

### 4. Blacksmith and Bag screens like the mockup

- The contract is `docs/mockups/index.html` sections 9, 10, and 11 and the approval shots named above.
- **Blacksmith:** a centered panel titled "Blacksmith" with a Close button, "Your coins: N", a **Weapons** group (short, long, great sword) and an **Armor** group (leather, chain, plate). Each row shows name, effect, price, and a **Buy** button, or a greyed "Need N coins". The note under the list: "Buying replaces the sword or armor you wear. Coins are not returned."
- **Bag / Inventory:** a centered panel titled "Inventory" with Close, "Coins: N", the warrior portrait on the left, and on the right: Level, Health (now / max), Strike, Experience (now / next), then the Sword and Armor slots with their bonus. The explanatory note from the mockup is kept.
- The thought bubble above the blacksmith and the **Bag** button stay where they are. Esc and Close both close a panel. The portrait uses the player's own gender still.
- Styling moves into `index.html` CSS using the mockup's colors and spacing. The buy and bag logic in `main.ts` and `view.ts` is reused, not rewritten.

### 5. Closer zoom with a zoom-out slider

- **Default view: 60 percent of the current section.** The window is sized so `width × height = 0.60 × the zone box area`, at the canvas's 16:9 shape. It stays centered on the player and clamped to the map, as today.
- **Zoom-out: up to 75 percent.** A vertical slider on the right edge of the screen, labelled "Zoom", moves the view between 60 percent (default, slider at the closer end) and 75 percent (widest). It is not possible to zoom out past 75 percent or in past 60 percent.
- The view size for each section (16:9, rounded):

| Section | Zone box (px) | At 60% (default) | Scale | At 75% (widest) | Scale |
| --- | --- | --- | --- | --- | --- |
| Town | 650 × 590 | 640 × 360 | 2.00 | 715 × 402 | 1.79 |
| Cemetery | 556 × 256 | 390 × 219 | 3.28 | 485 × 273 | 2.64 |
| Green | 900 × 605 | 762 × 429 | 1.68 | 852 × 479 | 1.50 |
| Grey | 848 × 530 | 692 × 390 | 1.85 | 774 × 436 | 1.65 |

  Today's town view is 787 × 443 at scale 1.63, so the default is about 23 percent closer.
- The slider is an HTML control over the canvas. Pressing it does not send a walk click to the map.
- The chosen zoom is kept in the browser (`localStorage`, in a try/catch, so the game still works if it is blocked) and the next visit starts there. The first time, and in a private window, it starts at 60 percent.
- The same fraction applies in every section, so walking from town to the green keeps your chosen zoom.
- Click-to-map conversion already goes through `viewBox`, so clicks stay correct at any zoom.
- Changes: `camera.ts` (`viewBox` takes a zoom value, `VIEW_SHARE` is replaced by `ZOOM_CLOSE = 0.60` and `ZOOM_FAR = 0.75`, defined in `tables.ts`), `index.html` (the slider), `main.ts` (reads the slider into the camera). `test/unit/camera.test.ts` and the `check-map-size.mjs` numbers are updated.

### 6. Items you own: buy, equip, unequip, drag (your Q8 answer)

Today buying replaces the worn piece and throws the old one away. This changes to a real bag.

**Rules**

- **Buying** spends coins and puts the item in your bag. It does not equip it. You can own all six items. You cannot buy an item you already own (the row says "Owned"). Items cannot be sold, as today.
- **Equipping** puts one owned item into its slot: swords go in the Sword slot, armors in the Armor slot. An item already in that slot goes back to the bag.
- **Unequipping** returns the worn item to the bag.
- **The bonus belongs to the equipped item.** Strike is the level's base strike plus the equipped sword. Max HP is the level's base HP plus the equipped armor. Nothing else changes in `strike()` or `maxHealth()`.
- **Hit points:** equipping armor raises Max HP and leaves current HP unchanged. Unequipping armor lowers Max HP and clamps current HP down to it. Equipping a sword or armor does not heal.
- You can equip and unequip anywhere. It takes effect on your next hit or bite.
- Level-ups work as today: the new base HP is added to current HP, clamped to the new Max HP.

**Data (in migration `0002`)**

- New table `character_items`: `character_id`, `item_id`, with a UNIQUE pair, so one of each item. Deleting an avatar deletes its items.
- `characters.sword` and `characters.armor` stay and hold the **equipped** item id, or `NULL`. The server refuses to set either to an item the character does not own.
- The fresh start (change 2) means there is nothing to convert.

**Server (new client messages, checked against the socket's own character, as `buy` is)**

| Message | What it does |
| --- | --- |
| `buy {itemId}` | Existing message. Now adds to the bag instead of equipping. Town only, as today. |
| `equip {itemId}` | Owned item into its slot. Refused if not owned. |
| `unequip {slot}` | `sword` or `armor` slot back to the bag. |

Each of these saves the character and sends the new numbers to the page in the next snapshot. The character message gains an `items` list (the owned item ids).

**Screens**

- **Blacksmith panel:** the Buy button adds to the bag, shows "Owned" for items you have, and keeps the "Need N coins" state. The note under the list changes to: "Buying puts the item in your bag. Equip it from the Bag."
- **Bag panel:** the mockup layout from change 4 with one addition under the stats: a row of the items you own (a small tile with the name and its bonus, such as "Long sword +4 strike"). The Sword and Armor slots on the right are drop targets.
  - **Drag** a tile onto its slot to equip. Dragging the wrong kind of item onto a slot does nothing and the tile snaps back.
  - **Drag** an item out of a slot back onto the item row to unequip.
  - Because the mockup has no item row, I add one new section to `docs/mockups/index.html` and a new approval picture before building it. You approve that picture first.
  - Click is a fallback: clicking a tile equips it, clicking a worn slot unequips it. This keeps the panel usable on a touch screen or if dragging fails.
  - Stats on the sheet (Strike, Health) update live as you equip and unequip.

**Tests**

- Unit: `strike()` and `maxHealth()` with each sword and armor equipped and not equipped.
- Worker: buy adds to the bag and does not change Strike; equip and unequip change Strike and Max HP; equipping an unowned item, or a sword into the Armor slot, is refused; buying an owned item is refused and costs nothing; items survive a reconnect; a second socket cannot equip for another character.
- Armor and HP: equip Leather at 40 / 70 gives 40 / 82; unequip gives 40 / 70; unequip with HP above the new max clamps it down.
- Browser (Playwright): drag Long sword onto the Sword slot, check the Bag shows Strike 8 and a real fight hits for 8; drag it out and check Strike returns to 4.

## Topology (who does what)

| Role | Who | What they do |
| --- | --- | --- |
| Requirements and plan | You and Claude | This document. You approve it. |
| Implementer | Grok 4.7 (`grok-4.7`, run headless with `grok -p`) | Builds one slice at a time, only the files that slice names. Does not commit. |
| Reviewer and tester | Claude Sonnet 5.5 | Reads the git diff for the slice, runs `npm test`, and for slices you can see in the browser, drives the real game. Replies PASS or FAIL with the reason. |
| Commit | Claude, after PASS | One commit per slice, so only reviewed code is committed. |

Loop for each slice: Claude writes the slice instruction → Grok implements → Claude reviews the diff and tests → FAIL goes back to Grok with the reason, PASS gets committed and the next slice starts. If a slice fails three times, Claude stops and reports instead of carrying on.

Browser testing: the Claude Chrome extension is not connected to this session, so by default the browser checks run through Playwright on the installed Google Chrome, the same way as the update 01 screenshots. If the extension gets connected, I use it for the same checks.

Git: work happens on a fresh branch `update-02` cut from `main`. Nothing is pushed (push is disabled on this repo) and nothing is deployed.

## Order of work (one commit per slice, as in plan 01)

| Slice | What | Check |
| --- | --- | --- |
| 0 | Repair the 5 tests that already fail (they predate this plan) | `npm test` all green before any change |
| 1 | All avatar heights × 0.6 | `npm test`, sprite tests updated |
| 2 | Zoom: 60 percent default, 75 percent max, slider | `npm test`, camera tests, slider UI test |
| 3 | One coin per kill with a value, pickup 2.25 s, gold "+N" | pet, hunt, and pickup tests rewritten |
| 4 | Failing test: open Bag, kill a wolf, numbers must change | test fails first |
| 5 | Live Bag and Blacksmith panels, Close buttons, HUD (3b, 3c) | UI tests, Playwright check |
| 6 | Migration 0002, password hashing, account routes | worker tests incl. forged-id and 3rd-avatar cases |
| 7 | Avatar routes and delete | worker tests |
| 8 | Sign-in, avatar list, add and delete screens | UI tests |
| 9 | New mockup section for the item row and drag, and approval picture | you approve the picture |
| 10 | Item bag data: `character_items`, buy-to-bag, equip, unequip messages | worker tests (change 6) |
| 11 | Blacksmith panel from the mockup, with "Owned" | UI tests |
| 12 | Bag panel from the mockup, item row, drag and click to equip | UI tests, Playwright drag test |
| 13 | Screenshots of the running game in Chrome | `docs/mockups/screenshots/running-*.png` |

Tests run with `npm test` (Vitest). The browser pass uses Playwright with the installed Chrome, as in plan 01. I run `wrangler dev` with local D1, apply migration 0002 locally only, and do not deploy.

## Decisions

Settled by you:

| # | Decision |
| --- | --- |
| Q1 | All avatars shrink by 40 percent and keep their relative sizes. |
| Q2 | Default view shows 60 percent of the current section. A slider on the right zooms out to at most 75 percent. |
| Q3 | Pet pickup takes 2.25 s. |
| Q4 | Delete all existing characters and the saved world. Tracking starts only with accounts. |
| Q5 | Passwords are at least 8 characters, with no recovery. |
| Q6 | Deleting an avatar is permanent, with a one-click confirmation. |

Settled after the investigation:

| # | Decision |
| --- | --- |
| Q7 | One coin icon per kill, worth the monster's coin value. You can walk away, the pet picks it up in 2.25 s and follows you again (change 3d). |
| Q8 | Items are bought into a bag, then equipped and unequipped by dragging. The bonus belongs to the equipped item (change 6). |

Small choices I made, which you can change:

- Equipping armor raises Max HP and does not raise current HP. Unequipping clamps current HP down.
- You can own each of the six items once, and equip or unequip anywhere, not only in town.
- A gold "+N" floats up when the pet delivers a coin.
- Clicking an item tile is a fallback to dragging.

- "60 percent of the section" means 60 percent of the section's **area** at the 16:9 shape, since 60 percent of both width and height cannot fit a 16:9 screen in most sections.
- The slider is a vertical control on the right edge. I did not add mouse-wheel zoom.
- The ground coin stays 40 px (see change 1).
- Zoom is remembered in the browser only, not on the account.

Nothing is started until you say go.
