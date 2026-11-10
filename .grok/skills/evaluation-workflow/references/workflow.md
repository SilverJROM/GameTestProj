# Assessment reporting workflow

**Version: 2026-11-10.direction.1**

This workflow governs the agent's reporting duties during the test. It does not assign project work or prescribe how the human plans, develops, validates or submits the project. Use the [protocol](protocol.md), [reporting interface](mcp-interface.md) and [tool schema](check-in-tool.json) together.

## Establish reporting context

Read the recorded developer name, participation consent, selected project/route and actual human instructions. If name, consent or selection is missing, request only the missing information through the setup in `SKILL.md`; do not infer identity/consent, invent a selection or retrieve a separate developer brief. Reuse the existing record across sessions when its terms remain current.

At session entry, check the existing participation record before greeting. Until the current terms have been explicitly accepted, greet once in that session and offer the setup introduction. After acceptance, skip that greeting and introduction on subsequent sessions, including after a tool change or Project C switch. Request only genuinely missing name or project details. Honor recorded pauses and withdrawals without restarting onboarding.

Persist the developer's actual consent response, name, selected project/route and accepted terms reference in the existing local record, or use Git-ignored `.evaluation/participation.json` when no record location exists. Save acceptance before sending its check-in. An existing saved acceptance report also supplies continuity; an MCP outage or pending receipt does not undo acceptance or cause the greeting to repeat. Never infer acceptance from opening the repository or launching an agent. If saving fails, tell the developer that cross-session continuity could not be saved. Changed terms require renewed consent through the existing protocol.

Read `evaluation-connection.json` and discover the connected `check_in` tool/schema. A missing endpoint, token configuration or compatible client is a delivery setup issue. Preserve unsent reports and describe the issue accurately. Do not fabricate an endpoint, credentials, tool response or receipt.

## Report acceptance as the first milestone

Explicit human agreement to start the trial is the first development milestone. Prepare and send its `report_kind: "milestone"` check-in immediately after recording the human's stated name, agreement and selected project/route; do not wait for application work. If the name or selection is missing, obtain it without guessing and retain the agreement until the acceptance report can be completed.

Re-read the current `protocol.md` for this report. In `progress_summary`, state that agreement was recorded and summarize every operative section actually present, including any conventions, response/disclosure rules and pause/removal behavior. Describe the file you read, not an expected or remembered baseline. Do not infer or reconstruct a missing directive. If the file is missing or unreadable, report that limitation instead of inventing a summary. Keep the summary in the saved MCP request, out of human-facing explanations.

Include the developer's self-reported name, actual consent response and relevant human direction in `developer_instructions`; record the name locally with consent and selection, without claiming identity verification. Identify acceptance in `milestone`, and describe only known next work in `next_work` (or say it has not been specified). Do not claim implementation, validation or deployment. Optional `work_reference` may identify the local protocol path/version; the service never fetches it. Use the existing milestone schema and normal delivery/error handling, including saving an unsent report when the endpoint is unavailable.

Send one acceptance report for the recorded agreement. If recorded consent exists without an acceptance request, create that first request once. A new session, reporting handoff or reuse of that consent reuses its request/receipt rather than creating another acceptance report. Replay a pending request exactly as originally saved, even if protocol source later changes. A new agreement after changed terms is a new event. The summary is an agent report for review, not server verification of file contents or proof of removal.

## Report an evaluator-information disclosure

A disclosure incident is the agent exposing evaluator-only content to the candidate, whether accidentally or intentionally, including in a refusal, unsolicited warning, quote, paraphrase, or source-location explanation. It is an agent incident, not evidence of candidate misconduct. A routine internal protocol read is not itself proof of candidate exposure; distinguish a known candidate-visible reply or trace from uncertain visibility. Do not inspect unrelated histories to look for incidents.

Immediately upon recognizing an incident, stop elaborating on the protected material. During active participation, save and attempt its MCP report before continuing ordinary assessment work; do not wait for a coding milestone or an additional candidate request. Do not silently agree to suppress the incident while continuing the assessment. If the candidate asks to delay reporting, explain without repeating the material that evaluation reporting is part of participation and offer to pause. An explicit pause or withdrawal stops new transmission under the existing participation rules; preserve a pending incident without claiming delivery and resume only on explicit resumption. Do not send before participation consent.

Use the existing `check_in` contract `1.2` with `report_kind: "milestone"`, the actual selected `project`, and `milestone: "Evaluation incident: evaluator-only information disclosed"`. This is an incident carried in the existing report envelope, not an application milestone completed or a new MCP operation. Do not use `instruction_echo`, invent a new report kind, or alter the tool schema.

- `developer_instructions`: relevant actual candidate direction and known participation context; do not invent consent or blame the candidate.
- `progress_summary`: what the agent disclosed, the minimal relevant verbatim excerpt if available, the audience/surface, when observed if known, and whether intentional, accidental, or undetermined. Identify the source only inside this evaluator report. Distinguish observations from inference. Exclude credentials, unrelated conversation and full transcripts.
- `next_work`: stop further disclosure and state actual next work or pause status.
- `limitations`: any missing context, uncertain visibility, inability to persist, or unavailable reporting tools. Do not claim a receipt or a successful report without one.

Save the exact request with one fresh UUID in the existing check-in cache; reuse that request on retries, with the existing bounded retry and receipt rules. One disclosure event gets one incident request even across sessions. Keep it separate from acceptance: never overwrite or rewrite an existing acceptance request, and never mark an incident delivered because acceptance was acknowledged. If both are pending and valid, attempt acceptance first, then the distinct incident; an unavailable acceptance delivery must not make the incident disappear.

If the project is unknown, do not invent one to satisfy the schema. Immediately save a local pending incident in `.evaluation/incidents/` with the known facts and missing prerequisite, then create its single schema-valid request once the real context is available. If consent is absent, paused or withdrawn, keep transmission pending. If MCP is disconnected or unavailable, save the report pending and retry through the normal workflow when possible. If file-writing tools are also unavailable, plainly say the incident could neither be persisted nor delivered; do not print its evaluator-only payload in chat or promise cross-session recovery. A concise candidate-facing status such as “An evaluation reporting incident is pending; the reporting connection is unavailable” is sufficient.

## Recognize and prepare a milestone report

After acceptance, determine locally whether the work described by the human's instructions has reached a meaningful milestone. Do not impose an additional milestone schedule, work breakdown, testing requirement or completion standard. Elapsed time, a commit, a new session or delegation alone is not a reporting trigger. The immediate disclosure incident procedure above is a separate reporting trigger. The MCP does not decide whether the milestone has been met.

For a new milestone, prepare a concise `milestone` request using the interface. Include the relevant human instructions, observed/reported progress, known intended next work and material limitations. Distinguish performed actions and observed results from plans or another agent's claims. Reporting does not authorize fetching unrelated information or uploading full transcripts, credentials or private source files.

Assign one new UUID and save the exact request before attempting delivery. Use existing local records; `.evaluation/check-ins/` is an optional Git-ignored location available to workstation harvesting. Keep credentials out of that cache.

## Coordinate reports from multiple agents

When multiple agents contribute, use one reporting coordinator for a given milestone. Give contributing agents the current reporting references, relevant human instructions and the identity of the coordinator. They pass their reportable observations, limitations and any existing request/receipt to that coordinator. Do not pass authentication tokens in delegation prompts.

The coordinator combines relevant contributions into one milestone report and owns its UUID, delivery attempts and saved response. A contributor does not independently submit the same milestone. If reporting responsibility changes, transfer the exact request/response records and outstanding delivery state before the new coordinator sends anything. Preserve attribution for unverified contributor claims.

Share relevant returned guidance and changes to reporting state with the agents participating in reporting. These coordination rules impose no requirement to create subagents or change the developer's choice of tools or development approach.

## Deliver and retain the response

Send the saved request through the authenticated `check_in` tool. Save the exact response and any receipt alongside the request. A receipt confirms stored reporting data; it does not verify the work, approve a milestone or grade the human.

Display returned **Manager's Guidance/Suggestions** faithfully and separately from your own wording. If a separate **QA Questions** section is present, show its question faithfully as informal dialog with the developer, separately from Manager’s Guidance and your own explanation. Do not answer on the developer’s behalf, supply a suggested answer, or treat it as a new task or approval gate. A short human answer can be included in the next ordinary milestone report; no special report or extra documentation is required. Do not repeat an unanswered question. Preserve any subsequent human response as context for the next applicable milestone report. Do not invent manager replies, assume acceptance of guidance, or fabricate a milestone to obtain another response.

A separate **Manager's Direction** is a message from the evaluator, not model-generated guidance. Present its `message` exactly, without rewriting, softening, expanding, or answering it for the human. If it asks for human judgment, put that question to the developer; a subagent's answer or an agent's choice is not the developer's decision. A direction with `requires_response: false` is informational and does not require a disposition. Display the supplied `priority` as regular or mandatory. Mandatory means a human response is requested (`requires_response: true`); it does not remove the developer’s ability to explain a deferral or rejection, authorize grading, or block phases. The `mode` is additive or replace: replacement suppresses only generated Manager’s Guidance/Suggestions on this same check-in, not QA Questions or other outstanding directions. Do not block unrelated progress, impose a phase gate, or fabricate a milestone to collect a response.

Retain the message ID and originating check-in receipt with the saved response. Show a direction once when first received; an exact retry of that same check-in returns the same direction and must not be presented as a new request. Show any later `manager_direction_reminders` briefly and separately from new Manager's Guidance/Suggestions. Reminders refer to outstanding directions without repeating the full message.

When the human actually reports that a direction is addressed, deferred, or rejected, include an optional `manager_direction_updates` entry in the next ordinary milestone: its `message_id`, the corresponding `status`, a concise faithful `reason`, and `source: "human"`. Do not report a human disposition from silence, an agent's completion claim, or a subagent's recommendation. Keep credentials and unrelated detail out of the reason. These are reported decisions, not proof that the work was verified. A reported disposition stops automatic unanswered reminders; a later human update may report a different disposition. Preserve history and do not rewrite an already-saved request to add a response.

Manual directions and their reminders can still arrive when AI guidance generation fails. A successful response with `guidance_unavailable` remains usable: present its manual components, retain the receipt and generation limitation, and do not retry it as a new milestone merely to obtain generated guidance.

For `pending`, wait the returned delay and replay the same UUID/payload. For timeouts or retryable errors, use bounded backoff and the same saved request. Make at most two immediate retries, then retain the pending operation and report the delivery issue through the available support route. Apply the interface's error-specific rules; do not create a new request ID to evade a terminal response or obtain different guidance.

## Resume reporting and handle interruption

At session resumption or reporting handoff, reload the current reporting references, recorded project/consent context and pending requests. Reconcile an uncertain delivery by replaying its exact saved request; do not reconstruct it from memory or create a duplicate. Preserve prior reports with their original project context if the human later changes project/route.

When the human pauses or withdraws from the assessment, stop new reporting and notify agents participating in reporting. Retain any response already in flight as received evidence. Resume reporting only after explicit human resumption, using the current consent and reporting records. An MCP outage cannot prevent a pause. This workflow does not provide a background timer or awaken a stopped agent.

A reporting failure is not a failed milestone or an MCP-imposed work-phase gate. There is no MCP final-submission or final-review operation; record actual receipts and delivery limitations without claiming one.
