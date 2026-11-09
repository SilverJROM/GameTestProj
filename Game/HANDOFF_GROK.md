# Handoff to Grok: lead the requirements stage

Written by Claude Code on 2026-11-09. You (Grok) now lead requirements for project A. Claude returns for planning and implementation once requirements pass.

## What this project is

A small multiplayer browser game (project A): a Cloudflare Worker with D1 storage, one shared isometric map, a login screen with saved characters, wolf fights, a smith, and duels. A single seeded function `fight(seed, a, b)` decides every fight. The full spec is `/home/candidate/ProjA/tasks/briefing_A.md`. Read it first. Do not reopen its locked decisions (D1–D9).

## Files

| Path | What it is |
| --- | --- |
| `/home/candidate/ProjA/tasks/briefing_A.md` | The source spec. Authority for all game rules. |
| `/home/candidate/ProjA/tasks/workflow.md` | Prompt sequence: North → Planner → Implementer → Validator → Tester → Final test. The North prompt (section 1) and the requirements-reviewer prompt are yours to use. |
| `/home/candidate/ProjA/tasks/setup.md` | Assessment setup notes (subscriptions, CLIs, env). Not needed for requirements. |
| `/home/candidate/ProjA/Game/requirements.md` | Claude's draft: 9 locked decisions, R1–R51, journey J1, blocked list B1–B5. **Not yet reviewed.** |
| `/home/candidate/ProjA/Game/` | Code lives here. It has only `package.json` and `node_modules` so far. No game code exists. |

Note: the workflow files say `task/`, but the real folder is `tasks/`.

## Current state

- Requirements draft written. No review yet. No plan. No code.
- Node 22.22.1 and npm 9.2.0 are installed. In `Game/`: Wrangler 4.158.0, TypeScript 7.0.2, Vitest 5.1.0.
- Game assets (`world-map.jpg`, warrior and axolotl stills) are not on the machine yet. The user will provide them. Screen rows use placeholders until then.
- `Game/` is not a git repo.

## Decisions already made by the user

- Build the game under `ProjA/Game/`.
- Scope is "the full game". The user wants to discuss scope in the requirements stage (see B2).
- Test locally with `wrangler dev` and local D1 first. Deploy to Cloudflare only after the user approves the local pass (R51 is a later step).
- The user wants to discuss the duel initiative formula (B1) in the requirements stage.
- The user approved installing Node and Wrangler.

## Open decisions to settle with the user (from requirements.md)

| ID | Question | Claude's proposal |
| --- | --- | --- |
| B1 | Duel initiative: briefing says `hash32(seed, duel_index) & 1`, D6 says seed + player id + event index. | `hash32(seed, attacker_id, event_index) & 1` |
| B2 | Keep D9's out-of-scope list, or add any of it now? | Keep it out. |
| B3 | How does a session know its character? | Signed cookie with the character id. |
| B4 | Does the attacker's event counter count only duels, or every fight event? | No proposal. Needs a decision. |
| B5 | Names: case-sensitivity and uniqueness. | Unique across the world, case-insensitive, trimmed. |

The user has not answered B1–B5 yet. Ask them, or let them say "your call" and record the choice as an assumption in the file.

## What to do

1. Read `briefing_A.md`, then `Game/requirements.md`.
2. Run the user through B1–B5. Update `requirements.md` with the answers and mark each one locked or an assumption.
3. Check every criterion against the briefing, as the workflow's reviewer prompt does: observable result, mapped to a briefing line, no silent default for an open decision, no new features.
4. Reply PASS or CHANGES. Planning starts only after PASS.
5. Hand back to Claude Code for `plan.md`. Claude will write it from `requirements.md`.

## Ground rules

- Secrets stay out of every file: no card numbers, signup email, billing details, Git credentials, or login passwords.
- Do not commit anything unless the user asks.
- Do not buy anything or use the assessment portal. Those steps belong to the user.
- Keep Claude's numbering (R1–R51, B1–B5, J1) so the plan and evidence files stay traceable. Add new ids at the end rather than renumbering.
