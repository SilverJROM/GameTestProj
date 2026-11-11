# Balance case

How to reproduce: `npm run balance` rewrites `docs/balance-tables.md` (every number below comes from it) from `src/rules` through the deterministic sim in `src/sim/sim.ts`. `npm run sim -- --seed 7` still runs the three small scenarios, and `npm test` checks the sim (`test/unit/sim.test.ts`). Nothing in the sim rolls dice: the game has no random hit or damage, so a seed only orders actions that fall due in the same 100 ms tick. Results are therefore exact for the modelled behaviour, not statistical samples.

## What the rules are (short)

- Six levels. Base health 70 to 140, base strike 4 to 12 (`src/rules/tables.ts`). Swords add strike (+2/+4/+7, 18/40/70 coins), armor adds maximum health (+12/+24/+40, 16/36/64 coins). Armor never reduces a hit.
- Three zones. Wolves (green, 20 HP, hit 5, 4 coins, 2 xp), bears (grey, 45 HP, hit 9, 10 coins, 5 xp), skeletons (cemetery, 72 HP, hit 12, 18 coins, 10 xp, attack on proximity).
- Player swing gap 0.45 s. Death is real: the avatar stays dead where it fell until the player picks Respawn in town, and still lands there on the next Play.
- Duels (fields only, request + accept): both fighters use level 3 base health and strike plus their own sword and armor, on a separate duel health bar. The loser dies where it fell and pays half its purse (rounded down) to the winner. No xp moves.
- Coins expire 7 days after pickup, oldest spent first. The fountain in town heals for free.

## Choices that matter (PvE)

Section 1 of the tables.

- Zone choice is a real choice and is gated by gear and level. A bare level 1 character dies on the first skeleton (0 kills) and 25% of bear fights. The same character with short sword and leather survives bears (0.3 deaths per 100 fights), but a level 3 character in the cemetery still dies in 25 to 50 of 100 fights whatever it wears up to long sword and chain. Level 5 with chain, or better, survives skeletons (0 deaths). So the cemetery is a level-5 target, the bear zone a level-1-with-gear or level-3 target, and the green is safe for everyone.
- Reward grows with risk: about 40 coins per minute in the green, 87 to 96 in the grey, 150 to 160 in the cemetery (with the pickup and walking overhead). Wolf income does not grow with gear (it is limited by pickup and walking, not by the fight), which is a deliberate cap: gear pays off by opening the next zone, not by speeding up the green.
- Recovery: the fountain heals for free, so the real decision is "retreat at 40% or press on". Standing and fighting kills a gear-less level 3 character after 9 wolves, 2 bears and 1 skeleton; retreating below 40% brought deaths to 0 in the green and (with a short sword and leather or better) in the grey. In the cemetery a level 3 character still dies in 25 to 50 of 100 single fights, because one skeleton does about 12 damage every 0.75 s, so retreating cannot save a build that loses the first exchange.

## Choices that matter (PvP, and PvP against PvE)

Section 3 and 4 of the tables.

- At duel level 3, level is removed from the equation, so the only thing that decides a duel is what the players farmed. Sixteen builds: win rate rises monotonically with gear, from 0% for bare to 100% for great sword + plate. There are no rock-paper-scissors cycles, which means no build counters another: the counterplay is not in the build but in what each player is willing to risk (below).
- Gear value per coin: sword first. A short sword (18 coins) is worth more win rate per coin (1.11) than any armor piece (0.37 to 0.42), and the great sword alone (70 coins) is as efficient (1.10) as the short sword. Armor is the poor-value slot on its own and is bought mostly as a second purchase. Nine pairs of builds are strictly dominated at equal or lower cost (for example chain alone against short sword alone); the table lists them. That is a finding, not a bug in the sim: a player who buys armor before a sword is making a weaker choice.
- Counterplay that exists in the game: (a) a duel needs request and accept, so a weaker player can refuse; (b) it is only offered in the fields, never in town, so town is always safe; (c) walking into town ends it and moves no coins; (d) the loser keeps level, xp, gear and half the purse, and respawns free. The cost of losing is bounded by the purse, so a wise player spends or banks coins before they walk into the fields with a rich purse. The 7-day expiry limits hoarding, but is a weak control (see limits).
- PvP does not steal progress from PvE. The loser keeps gear and level, so a lost duel costs half the purse (about 1 to 2.5 minutes of wolf farming for a purse of 100 to 200, 0.3 to 0.6 minutes of skeleton farming). A winner gains the same. The duel rewards farming (better gear wins), but a rich losing player is not ruined.
- Monsters and duels share the same field. A duelist is still a target for monsters; the dead state is the same one (stays where it fell), and any coin pickup, pet or chase on a dying avatar is stopped. That is covered by the worker tests (`test/worker/duel-fight.test.ts`, `test/worker/aggro.test.ts`, `test/integration/hunt.test.ts`).

## Progression and coin flow (sustained play)

Section 2 and 5 of the tables. With the rules' coin pickup time plus an assumed 3 s walking per kill, one active player earns about 40 coins per minute in the green and 160 in the cemetery. The cheapest useful kit (short sword + leather, 34 coins) takes under a minute, a top kit (great sword + plate, 134 coins) 3.3 minutes in the green or 0.8 in the cemetery. A greedy player reaches level 6 and the top kit in about 3 to 3.5 minutes (7.5 to 8 minutes if every kill costs 15 s of overhead).

## Honest failures and limits

1. **The progression is far too short.** The whole ladder fits into a few minutes of play (table 5). That means the long game has no goal after the first session and coin expiry (7 days) never binds: nobody holds coins for a week when the dearest item costs 70. The rules were tuned to be easy to test, not to hold a player for hours. If this game were to be kept, the first change would be to multiply prices and xp costs by about 10 and shorten the monster respawn. I have not changed the numbers, because that would invalidate the data the existing tests and the published rules rest on, and it is the owner's design decision.
2. **Top gear dominates duels** (great sword + plate wins 100% against every other build). Choices exist up to that point, but once both fighters own the top kit, the duel is decided only by the tie-break (the fighter whose swing arrives first). There is no armor reduction, no block, no dodge, no weapon variety beyond strike and health, so there is no counterplay inside a duel beyond walking into town.
3. **The tie-break is arrival order in the live game.** Equal builds are decided by whose message the room handles first, and it favours the lower-latency player. The sim uses a seeded shuffle instead, so its "30% to 30%" for identical builds is the tie-break, not a result about skill.
4. **The sim models a hunt as one monster at a time and ignores** monster respawn (5 s, never binding with 7 per zone), pathing and chase distances, several monsters at once, pets, player-versus-player-while-hunting, ping, and the actual fountain walk. The 3 s walk per kill is an assumption; table 5 shows how the milestones move for 0 s and 15 s.
5. **The sim has no measured data from real players.** One tester played 20-25 minutes on the live game; that is anecdote, not evidence, and I did not instrument it.
6. **A dead avatar's lost income is not priced.** The cost of dying is the walk back from the cross and the lost fight time; I did not measure it, and it is small, so the penalty for dying is weak in PvE.
7. **Cheating is not part of the balance case.** Hits are decided on the server (damage, reach and the swing gap are checked there); what a client can lie about is covered in `docs/security.md`.
