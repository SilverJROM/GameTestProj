# Assessment reporting interface

**Application contract 1.2 · Tool definition: [check-in-tool.json](check-in-tool.json)**

This reference governs the reporting agent's use of the MCP. It assigns no project work or development process.

The only candidate tool is **`check_in`**. Discover its actual name/schema in the connected client; prefixes are client-specific. The JSON tool definition is authoritative for field shapes and limits. This application version is separate from the MCP wire-protocol version.

## Connection

Read the repository's [connection metadata](../../../../evaluation-connection.json) and the separately supplied connection details. Transport is **Streamable HTTP over HTTPS**. The operator supplies the actual `mcp_uri`, support contact, and a separate revocable MCP token for your run through the secure handover channel. Null configuration is not a usable endpoint.

Configure your client to send `Authorization: Bearer <run token>` on every request, using its private credential/environment mechanism. Do not put the token in repository files, URLs, check-in arguments, or agent prompts. The read-only GitHub PAT is only for cloning; GitHub sign-in and OAuth discovery are not used by this service. A client must support configured bearer headers. Only the MCP SDK client has been exercised locally; actual Claude/Codex/Grok/Gemini client versions still need verification. Contact support if your chosen client cannot send the required header; do not invent an OAuth flow.

The tested SDK uses MCP protocol `2025-11-25`; the application payload version is `1.2`. These are distinct version numbers.

Authentication binds the caller to one evaluation run. A request contains no candidate ID, run ID, credential, or evaluator role. The service returns its run ID in a receipt; it is an identifier, not an access token. Participation agreement remains local and separate from service authentication.

## Request kinds

This reference instructs you, the reporting agent. Use application contract **1.2**; older request versions are rejected. The same authenticated `check_in` tool accepts two distinct report kinds:

- `milestone`: your report that a milestone determined from the human's instructions has been met. Requires the selected project and the progress fields below; may receive Manager's Guidance/Suggestions.
- `instruction_echo`: an additional schema-supported report containing matching human/agent excerpts and a local overlap estimate. This interface defines its payload only; it does not direct prompt screening, refusal or use of this report kind. Requires `instruction_echo` and no milestone/progress fields. Include `project` only when the human's selection/route is known; otherwise omit it. The service durably records and acknowledges this report without a model call, similarity judgment, or grade.

Both require `contract_version`, `request_id`, and `report_kind`. Persist the exact request before sending. Excerpt fields must preserve the actual matching passages; omit secrets and unrelated material, and disclose any necessary redaction in `reason`. Keep the full original exchange locally. The server does not compare the excerpts or independently verify your estimate.

| `instruction_echo` field | Meaning |
| --- | --- |
| `human_prompt_excerpt` | Actual incoming matching passage; 1–8,000 characters |
| `agent_instruction_excerpt` | Actual earlier direction you issued to that applicant; 1–8,000 characters |
| `estimated_overlap_percent` | Integer 50–100: your estimate of the copied/closely paraphrased share of the substantive human prompt |
| `reason` | Concise observed overlap and missing human framework; 1–2,000 characters |

An accepted instruction-echo report immediately returns `no_guidance` with a receipt and `Acknowledged.`. It remains reportable without a Claude key or generation budget and while milestone generation is pending; run authentication, expiry/revocation and report rate/storage limits still apply. Its receipt acknowledges storage only. Missing connection/authentication or report-limit failures use the normal pending/retry/support handling; do not invent successful delivery.

## Milestone request

| Field | Meaning |
| --- | --- |
| `contract_version` | Exactly `1.2` |
| `report_kind` | Exactly `milestone` for the fields in this table |
| `request_id` | Fresh UUID for a new report; persist and reuse on retries |
| `project` | `{ "id": "A", "route": "persistent_economy" }`, A with `compact_4x`, `{ "id": "B" }`, or `{ "id": "C" }` |
| `milestone` | What the local agent judges met under the developer's direction; at most 240 characters |
| `developer_instructions` | Relevant direction or a faithful summary, at most 8,000 characters |
| `progress_summary` | What the agent reports doing, at most 12,000 characters |
| `next_work` | Intended next work, at most 4,000 characters |
| `decisions`, `validation`, `limitations` | Optional arrays, up to 12 nonempty entries of 2,000 characters each |
| `work_reference` | Optional reported source/deployment reference, at most 2,048 characters; never fetched |
| `manager_direction_updates` | Optional array of up to 20 reported human dispositions, with unique `message_id` values; see Manager’s Direction below |

### Acceptance milestone

The first report follows explicit agreement to start the trial and uses the same `milestone` shape. Put the self-reported developer name, actual consent response and relevant human direction in `developer_instructions`; identify acceptance in `milestone`; put a faithful summary of the current `protocol.md` in `progress_summary`; and use only known next work in `next_work`. The selected project/route is still required. Include conventions and disclosure rules that are actually present, and report missing/unreadable source as a limitation; do not reconstruct absent content. Keep that summary in the MCP payload rather than chat. See the [reporting workflow](workflow.md) for consent reuse and exact replay.

The service stores this as an ordinary reported milestone. It does not compare files, determine whether a directive was removed, or add an assessment/approval phase.

Unknown fields are rejected. Empty/whitespace-only required text is invalid. Total serialized argument JSON is limited to **65,536 UTF-8 bytes**, even when each field fits its character limit. Include material limitations; optional fields do not authorize misleading omission. Send concise relevant context, not full transcripts, code, credentials, or unrelated files.

```json
{
  "contract_version": "1.2",
  "report_kind": "milestone",
  "request_id": "1cbd709a-106d-4da4-ae2f-55da37574e30",
  "project": { "id": "B" },
  "milestone": "First human-directed work slice completed",
  "developer_instructions": "Implement the agreed slice within the boundaries I specified.",
  "progress_summary": "Implemented the authorized slice; broader work remains.",
  "next_work": "Continue with the next work authorized by the human.",
  "validation": ["Ran the local checks agreed for this slice."],
  "limitations": ["No independent review or deployment verification is claimed."]
}
```

This is a fictional example; use a new UUID and the actual work in a real report.

### Disclosure incident compatibility

The reporting workflow also uses the existing `milestone` envelope for an agent disclosure incident, labelled `Evaluation incident: evaluator-only information disclosed`. All normal required fields, including the actual project, and all payload limits still apply. It is not a claim of completed application work. There is no dedicated incident tool or new `report_kind`; do not use `instruction_echo` for this purpose. A missing project or inactive participation leaves a local pending incident, never a fabricated selection or consent. Follow the workflow for immediate handling, exact request retention and receipt verification.

## Results

Every result has `contract_version`, `request_id`, and `status`. Accepted reports have a `receipt` with `run_id`, monotonically assigned `sequence`, and `received_at` in RFC 3339 form. These identify stored reports; they do not verify milestones, work, or human authorship.

| Status | Fields and interpretation |
| --- | --- |
| `guidance` | Receipt plus `guidance.title` exactly **Manager's Guidance/Suggestions** and `guidance.message`; display the message faithfully |
| `no_guidance` | Receipt plus `message`: `Acknowledged.`; no approval or waiting requirement |
| `pending` | Receipt plus `retry_after_seconds` between 1 and 120; generation is unfinished, replay the same request after that delay |
| `error` | `error.code`, safe `message`, and `retryable`; receipt when an accepted report has a terminal generation/budget failure. An invalid/missing request UUID may be returned as null. |

The final saved result remains stable for the request. `pending` may later become a terminal result; it is not a second report. The service should return matching structured content and a serialized JSON text block for clients that do not expose structured results. Tool execution failures use `isError: true`; HTTP authorization and malformed MCP messages can fail before an application result exists.

## Retry and error meanings

- `invalid_request`, `unsupported_contract`, `payload_too_large`: report rejected; fix the reported problem before using a new UUID.
- `idempotency_conflict`: the same run/request UUID already has a different payload. Recover the original request and its result; do not hide the conflict by creating another report.
- `temporarily_unavailable`: retryable with the original UUID/payload. An absent receipt does not prove the server never accepted a timed-out request.
- `generation_failed`, `budget_exhausted`: accepted report with a receipt and terminal nonretryable error. Retain it and use the support route. The same UUID must not trigger another model call; a new UUID must not be used to evade the limit.

Use the same UUID and exact field values/array order on a retry; JSON object-key order and formatting are immaterial. Omitted optional fields and explicit empty arrays are distinct payloads. Make at most two immediate retries, with backoff or the returned delay, then preserve the pending operation for later reconciliation. Authorization failures require restoring the connection, not guessing credentials.

The service stores reports and returns guidance only. It provides no assignment, phase-control, artifact-review, milestone-approval, final-submission, or manager-chat tool. It never fetches `work_reference` URLs. Follow the [reporting workflow](workflow.md) for report coordination, delivery records, interruption and resumption.

### Optional QA Questions

Successful `guidance` and `no_guidance` responses may also include `qa_questions: {"title":"QA Questions","questions":["What pointed you to that cause?"]}`. There is at most one question; the section is omitted when none is needed. Display it separately and faithfully. Let the human answer naturally, without answering for them or blocking work. Include any answer in the next ordinary report. `no_guidance` means no manager guidance; it can still contain a QA question. Report inputs, receipts, retries and saved responses are unchanged. An older locally cached strict output schema will reject this additive field: refresh MCP tool discovery and use the updated reference schema. Existing reports must not be resent under new IDs for a question.


### Optional Manager's Direction

Successful `guidance` and `no_guidance` responses may carry a separate `manager_direction` with the fixed title **Manager's Direction**, a UUID `message_id`, exact evaluator `message` (1–2,000 characters), `requires_response` boolean, `priority` (`regular` or `mandatory`), and `mode` (`additive` or `replace`). Display the exact message to the human, independently of model-generated guidance. Do not rewrite it, silently answer it, or have a subagent decide a matter of human judgment. Informational regular messages (`requires_response: false`) need no response. Mandatory messages always request a human response; display that priority clearly, but do not infer automatic compliance or forbid a reasoned deferral/rejection. Replacement mode suppresses only the generated Manager’s Guidance/Suggestions for this check-in; the exact manual message and any QA Questions remain independently visible. Additive mode allows both sections. A direction does not block progress or establish an assessment phase or grade.

One queued message is assigned to the next accepted new milestone report for this run. Instruction-echo reports, invalid requests and retries of older check-ins do not consume it. A saved terminal response is immutable: its retry can contain the original full direction again, but this is the same inclusion, not a new message. Preserve the message ID and receipt and avoid presenting a replay twice to the human.

Later successful responses can carry `manager_direction_reminders`, an array of brief reminders with `message_id`, original `check_in_sequence`, `priority`, and `message`. Preserve mandatory priority in the reminder label. These remind the human about directions awaiting their reported response; new guidance may continue alongside them. Do not restate the full original message as a new requirement.

In a later ordinary milestone, report an actual human disposition with `manager_direction_updates: [{"message_id":"<the received UUID>","status":"addressed","reason":"<the human’s concise explanation>","source":"human"}]`. Allowed statuses are `addressed`, `deferred`, and `rejected`; `reason` must be nonblank and at most 2,000 characters. One update per message ID is allowed in a report, at most 20 total. These fields are forbidden on instruction-echo reports. Only refer to a direction already included for this run. Do not infer a human response, impersonate the human, or use an agent's own decision as the source. A reported disposition stops automatic unanswered reminders; a later ordinary report may carry a subsequent human update. No special check-in or extra document is required.

If generated guidance fails, a successful manual response can carry `guidance_unavailable: {"code":"generation_failed"}` or `{"code":"budget_exhausted"}`. Present the manual direction/reminders and retain the generation limitation; this is not a failed manual delivery or a reason to submit a duplicate report. Pending/error responses do not carry manual components.

Refresh MCP tool discovery when using an older cached strict output schema. The discovery description includes the human-presentation rule; updating the maintained starter does not itself change an existing candidate checkout. An inclusion receipt proves only that the direction was included in a saved response returned by the service, not that the human saw or read it. A network loss may leave receipt at the client uncertain until exact replay.
