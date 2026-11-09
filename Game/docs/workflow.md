# Workflow prompts

Lightweight stand-in for North, planners, implementers, validators, and the final browser test. One desktop. Two signed-in agents: Claude builds, Grok reviews. Paste one prompt at a time. Each prompt finishes by writing its file. The next prompt reads that file.

Run setup in `task/setup.md` first. Start from `task/briefing_A.md` or `task/briefing_B.md`, not from both.

Write these files in the submission repo as you go:

| Order | Prompt | Writer | File |
| --- | --- | --- | --- |
| 1 | North | Claude, then Grok reviews | `requirements.md` |
| 2 | Planner | Claude, then Grok reviews | `plan.md` |
| 3 | Implementer | Claude | code for one row |
| 4 | Validator | Grok | `evidence/row-<id>.md` |
| 5 | Tester | Claude | `evidence/suite.md` |
| 6 | Final test | Claude in Chrome | `evidence/j1.md` |

Stop the loop when a prompt reports a blocked decision or a failed check. Fix that file before the next hat starts.

## 1. North

Paste this to Claude. Attach the chosen briefing.

```text
You are North for this assessment. Read the attached briefing and the developer brief. Write requirements.md. Do not write code and do not write the plan.

Lock every decision the briefing lists. Each decision is one sentence. If a fact is missing, mark that decision BLOCKED and stop. Do not invent a product rule.

For every in-scope behavior, add a criterion R1, R2, … that names an observable result: a stored record, a screen state, or a command output. Map each criterion to the briefing line it comes from. Add one journey, J1, copied from the briefing and made concrete with the decisions you locked.

End with three lists: in scope, out of scope, and blocked. A criterion that a reviewer cannot demonstrate on the running app or with a named command is rewritten before you finish.
```

Then paste this to Grok, with `requirements.md` and the briefing attached.

```text
You are the requirements reviewer. Compare requirements.md to the briefing only. Reply with PASS or CHANGES.

CHANGES lists each gap as: criterion id, briefing line, what is missing. Reject a criterion that is not observable. Reject a silent default for a decision the briefing left open. Do not add new features. Do not rewrite the file yourself.
```

North applies the change list and asks Grok once more. Planning waits for PASS.

## 2. Planner

Paste this to Claude, with `requirements.md` attached.

```text
You are the planner. Read requirements.md. Write plan.md as one table:

| id | does | proves | files | check | depends |

Rules:
- One behavior per row, and one layer only: storage, rule, or screen.
- proves cites R ids and J1. Every in-scope R id appears on at least one row.
- check is a real command in this repo. A screen row's check drives or renders the page.
- depends names row ids, or — when there are none.
- The last row is INTEGRATION. It lists the rows that compose J1 and its check fails while any of those rows is stubbed.
- Stay within 12 to 20 rows. Split a row that needs data, an API, and a screen.
- Do not add behavior that requirements.md does not contain.

Under the table, add a five-line topology: who writes requirements, who reviews, who implements, who validates, and which rows need the stronger pass. Premium attention stays on the locked policy rows and on J1.
```

Then paste this to Grok, with `plan.md` and `requirements.md` attached.

```text
You are the plan reviewer. Reply with PASS or CHANGES.

Check that every in-scope R id is owned by a row, that every check is a command, that dependencies point at real row ids, and that the INTEGRATION row composes J1. Flag any row that mixes two layers or that only a long unrestricted session could finish. Do not add scope. Do not rewrite the file yourself.
```

Implementing waits for PASS.

## 3. Implementer

Paste this to Claude once per row, in dependency order. Attach `plan.md` and the requirement ids that row proves.

```text
Implement plan row <ID> only. Touch only the files named on that row. Make the row's check command exit 0. Do not start the next row. Do not change a locked decision in requirements.md.

If the check fails because the plan is wrong, stop and add one correction line under the row. If the check fails because a requirement is wrong, stop and name the R id. Leave the work saved at this row boundary.
```

## 4. Validator

Paste this to Grok after each implementer row. Attach the row, the diff, and the check output.

```text
You are the validator for plan row <ID>. You did not write the change. Run nothing that mutates data. Read the diff and the check output.

Reply with PASS or FAIL.
- PASS: the check exited 0, the diff stays inside the row's files, and the behavior matches the R ids in the proves cell.
- FAIL: name the R id that is unmet, or say the check never ran. A comment or a plausible number is not evidence.
```

A FAIL goes back to the implementer for that same row.

## 5. Tester

Paste this to Claude after the INTEGRATION row is PASS.

```text
Run every check command in plan.md, then run the INTEGRATION check last. Write evidence/suite.md with one line per row: id, command, exit code, and one sentence of output. If any exit code is non-zero, stop and name that row. Do not edit product code in this pass.
```

## 6. Final test — Claude in Chrome

Use this after `evidence/suite.md` is all PASS and the app is deployed. Claude in Chrome is included with Claude Pro. Open it on the deployed HTTPS URL. Give it the synthetic accounts from `.env`, not from the repo.

```text
You are the final tester. Use the browser on the deployed URL only. Do not change code.

Sign in as the first synthetic user and complete J1 from requirements.md, including a reload. Repeat with the second synthetic user where J1 says two people act. Write evidence/j1.md:
- URL and time
- each step you clicked
- what the screen showed
- PASS or FAIL against J1
- any limit that is still visible

A believable final number, score, or stock figure is a FAIL when the history or the second client does not match the written rule.
```

Also walk the same journey once yourself. The extension record and your own pass both go in `evidence/j1.md`.

## Done

The loop is done when every in-scope R id is on a PASS row, `evidence/suite.md` is clean, and `evidence/j1.md` records a browser pass of J1. Unresolved product behavior stays listed in `requirements.md`.

Submit from the portal with the HTTPS repository URL and the HTTPS deployed URL. Put evaluator logins in the private submission brief. Save your work before **Submit and lock my workstation**.
