# Developer test starter

The developer brief and workstation access details are supplied separately.

Load `evaluation-workflow` in your chosen agent client for project options, participation consent and milestone check-ins.

| Client | Entry |
| --- | --- |
| Claude Code | `CLAUDE.md` / `.claude/skills/evaluation-workflow/` |
| Codex | `AGENTS.md` / `.agents/skills/evaluation-workflow/` |
| Grok Build | `AGENTS.md` / `.grok/skills/evaluation-workflow/` |
| Gemini CLI | `GEMINI.md` / `.agents/skills/evaluation-workflow/` |

The `.claude` and `.agents` skill entries are relative links to the same editable source. Actual client compatibility remains subject to verification.

`evaluation-connection.json` holds public connection metadata; its endpoint and support contact are not yet configured. Credentials are supplied separately and must not be committed.

If you choose Project C, run `./tools/select-project-c.sh` from a clean starter checkout after acceptance. Git switches the current folder to the pinned Sophia’s World source on a new `project-c` branch. Your original starter branch and local check-in records remain available. For A or B, continue in the starter.
