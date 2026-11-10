You are the implementer for slice 0 of /home/candidate/ProjA/Game/docs/plan02.md (read the "Topology" and "Investigation results" sections first). Work in /home/candidate/ProjA/Game on the git branch update-02. Do NOT run git commit, git add, git switch, or any other git write command. The reviewer commits after reviewing your diff.

Task: five tests fail on the clean branch, before any change. They are:
- test/integration/duel.test.ts > G5 duel flow > refuses in town, declines without change, glows on accept, settles at 0, and ends in town
- test/integration/room-core.test.ts > G3 room core flow > joins two sockets, walks to the green, sees 7 monsters per zone, and keeps a purchase and a sip across a reconnect
- test/worker/duel-fight.test.ts > "pays half the loser coins rounded down: 9 pays 4 and keeps 5, and no xp moves"
- test/worker/duel-fight.test.ts > shared attack clock with a real wolf > both "a duel swing at 0 blocks a monster swing at 400 ms ..." and "a monster swing at 0 blocks a duel swing at 400 ms ..."

Observed errors: "expected 'town' to be 'green'", "expected [522.0, 484.4] to deeply equal [900, 560]", "expected {...} to match object { place: 'town', x: 300, y: 440 ...}", and "state never reached". They probably come from update 1 (the town wall with a gate, the monster patrol, new attack gaps) making old position and timing assumptions in the TESTS out of date.

Rules:
1. Diagnose each failure. If the test is stale against the update 1 rules (see docs/update01_plan.md and src/rules), fix the TEST ONLY so it checks the current rules. Use the rules tables and region helpers in src/rules instead of hard-coded numbers where possible.
2. If a failure shows a real product bug, do NOT change product code. Stop on that test, leave it failing, and describe the bug in your final report.
3. Touch only files under test/. Do not weaken an assertion just to make it pass; keep what each test is meant to prove.
4. Run each of the three test files with `npx vitest run <file>`, then the full `npm test` once at the end.
5. Final report: for each of the five tests say what was wrong, what you changed, and the final pass/fail. Then list the files you changed.
