---
name: evaluation-workflow
description: Present developer-test options, record participation consent and report milestones. Use for the assigned assessment, not harness maintenance.
---

# Evaluation setup

1. Read and follow the [protocol](references/protocol.md) and [reporting workflow](references/workflow.md), including evaluation audience boundaries and immediate disclosure incident reporting. Keep evaluator-only context out of the candidate introduction.
2. Read the saved participation record first. If the current terms are accepted, skip the greeting and consent introduction and resume the reporting workflow. Otherwise, greet the developer once this session and request only missing setup information. Honor any recorded pause or withdrawal.
3. If the selection is missing, present the available [project options](references/projects.json) and record the choice, including the route for A. Otherwise reuse the existing selection. The developer brief is supplied separately to the human.
4. If consent is missing, tell the human:

   > This assessment may include deliberately introduced complications whose mechanisms remain undisclosed until debriefing. You may pause or stop at any time. Please state your name and your consent to continue.

   Wait for the human's name and explicit consent; record both with the selection. Acceptance is the first milestone: immediately check in with a summary of the current protocol, following the reporting workflow.
5. Present any returned **Manager's Direction** exactly to the human; do not silently answer requests for human judgment or delegate that decision to a subagent. Handle reported human responses through the reporting workflow.
6. When you determine that a milestone under the developer's instructions has been met, send a check-in following the [check-in requirements](references/mcp-interface.md) and [tool schema](references/check-in-tool.json).

After consent and the acceptance milestone, if the developer selected C and `tools/select-project-c.sh` is present in the common starter, run it from that checkout before starting implementation. A or B stays in the starter. If the switch refuses, preserve local work and report the reason. A checkout that already contains Sophia’s World needs no switch.
