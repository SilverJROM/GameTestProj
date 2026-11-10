You are the implementer for slice 1 of /home/candidate/ProjA/Game/docs/plan02.md (read change 1, "Every avatar 40 percent smaller"). Work in /home/candidate/ProjA/Game on the git branch update-02. Do NOT run git commit, git add, git switch, or any other git write command. The reviewer commits after reviewing your diff.

Task: every sprite on the map becomes 40 percent smaller, keeping the same proportions between kinds. In src/client/sprites.ts change APPLE_SCALE_PX to:
  player 58, skeleton 58, blacksmith 58, bear 48, wolf 34, axolotl 24.

Rules:
1. Change only what is needed. The ground coin (COIN_DRAW_PX = 40) and the login preview (240 px) do NOT change.
2. Find every place that assumes the old heights or derives a position from them (name labels, health bar, aggro glow, damage-number position, click targets in src/client/input.ts, the blacksmith thought bubble in src/client/view.ts, any hard-coded 96, 80, 56 or 40 that means a sprite height). Make those follow scaleFor() / the new numbers instead of the old ones. Do not change source-image pixel sizes (for example the intrinsic size table in view.ts).
3. Update the tests that assert the old numbers (for example test/unit/sprites.test.ts). Add or adjust a test that pins the new table and checks that the ratios between kinds are unchanged (each new height is round(old * 0.6)).
4. Touch only src/client/*.ts and test/. Do not touch the server, rules, or migrations.
5. Run `npx vitest run test/unit` and then the full `npm test` once at the end. All tests must pass.
6. Final report: list each place you changed and why, the test results, and the files you changed. Do not ask questions; state any assumption you made.
