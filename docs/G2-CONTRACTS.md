# G2 Preparation and Preference-Driven Revision Contracts

[Documentation](README.md) · [Development rules](../AGENTS.md)

Current comparison/user-choice rules and SQLite 6 are in [EXTENSION-CONTRACTS.md](EXTENSION-CONTRACTS.md). This document retains g2.0–g2.4 execution and compatibility contracts. g2.3 is implemented in `src/mainflow-contracts.ts` with SQLite 5; see the [main-flow report](MAINFLOW-REPORT.md). Earlier preparation alone did not establish full G2 isolation or the complete RSI cycle, and granted no new paid calls.

## g2.3 fields, states, and execution limits

### g2.4 design starting points

The confirmation card offers optional page-purpose and style illustrations with no model calls. Purpose appends to brief; selected style and free text combine into preference. Show the combined input before the existing flow_authorize checks. Unselected cards add nothing; selection/switching does not authorize calls or save preferences. Preserve free input; if combined text exceeds the existing cap, show an error and block submission rather than truncate.

Illustrations help express intent; they are not generated or validated pages. The independent model still decides actual edits. No new persistent schema or closed preference taxonomy is introduced.

- FlowTask binds workspace, source session, starting turn, managed Skill, complete baseline manifest/files, pending requirements, inherited preferences, and previewDigest. The final card binds complete input, verbatim preference, scope, editable paths, budget, and check identifiers to one authorization digest/operationId.
- flow_authorize starts only from confirming. Reject stale revisions, changed source/ACTIVE, or a mismatched preview digest. Send complete files. Support only UTF-8 replacements at existing paths, at most 32 files; no file creation/deletion or executable-bit changes.
- Generation route: DeepSeek-V4-Flash / Low; at most 3 requests including post-clarification generation, 4096 output tokens including reasoning per request, 65536 input bytes, stop at 32000 confirmed tokens, 300000 ms total. Users may lower caps; configuration is not authorization. No tools or automatic retries.
- Output is candidate, clarify, or unchanged, with no unknown fields. Clarification allows two batches of three questions. flow_answer accepts only the current batch and retains deadline/accounting. Broader scope requires ending and reconfirming; costs remain.
- Fixed checks: complete manifest, authorized paths, nonempty files, original SKILL.md metadata, and Python AST/Shell `-n` in fixed Docker. Do not run candidate-provided checkers or fall back to the host when Docker is absent. No scripts means not applicable. Historical page-effect checks were unevaluated, not a fabricated G3 pass.
- States: confirming → generating → checking → review → ready → dispatched, with clarifying, failed, stopped branches. flow_choose requires exact digest and expected old ACTIVE. Unknown usage, partial responses, or failed checks block adoption; baseline continuation revalidates the baseline.
- ACTIVE is scoped to workspace/Skill. Task scope does not change project ACTIVE. Personal scope promotes only confirmed preferences; the Skill version still activates only in the current project. Preserve the source directory.
- Text and resources bind to the same sealed digest. If a session used a different version, create a deterministic linked session carrying current requirements/preferences, not old Skill instructions or tool output. Old bindings remain immutable. Persist queued before delivery and admitted before acceptance; duplicate confirmation cannot duplicate creation/delivery.
- Revision/clarification calls are owner=rsi, purpose=generation; ordinary page work is owner=session. Restart fails unfinished runs but retains authorization, output, candidate, and costs. Review survives. Chosen-but-undispatched tasks require user recovery; admitted work is not retried automatically.
- SQLite 4 → 5 validates old state transactionally and adds empty mainflow tasks/preferences/active. Existing enrollment, analysis, design snapshots, and receipts gain no editing permission. Corrupt data rolls back migration; older binaries cannot read the new version.

## Preference-driven independent revision

User decision, 2026-09-08: one card confirms preference, editable scope, and budget, then generates a candidate. Host checks and separate user adoption precede ordinary task execution. The implementation limits above govern this historical product contract.

### Inputs and ownership

Explicit preferences can directly drive a revision without observation signals or an advice-only analysis. Reuse Harness providers in a separate context. Models interpret preferences, clarify specific ambiguity, and edit candidates. Host code freezes input, reserves calls, validates files, tracks state/checks, and activates versions; no rule table maps every preference to a predetermined rewrite.

| Data | Constraint |
|---|---|
| Target/version | Workspace, task/session, managed Skill, baseline manifest/digest; models cannot choose another target |
| Preferences | Verbatim input, explicit scope, applicable confirmed preferences, clarification answers; not restricted to six categories; model summaries do not replace user confirmation |
| Authorization | Card submission binds complete input digest, paths, model route, checks, budget; observation or preference storage alone cannot create it |
| Candidate | Parent digest, authorized changes, reason; host seals/hash-checks; unchanged files retained and incomplete responses cannot overwrite files |
| Check result | Checker/input references, item statuses, errors/evidence; model claims cannot pass checks |
| Adoption/binding | Reviewed candidate digest, expected ACTIVE, target binding; unapproved candidates cannot enter ordinary execution |

Generation requires complete editable files, supplied directly or through authorized read-only access. Analysis excerpts from prepareInput are not replacement files. Stop on input/file limits rather than truncate. Python/Shell/templates may be authorized, but candidate execution and model-generated checks need verified Docker boundaries; ordinary page Agents cannot execute them early on the host.

Unchanged is a valid model conclusion, not a fabricated new version or improvement. Explain what happens after unchanged, generation failure, or rejection. Freeze actual model/request/output/token/environment limits before a live run; this contract adds no paid batch.

### Interaction and transitions

Confirmation → generation → checks → separate adoption review → ready/ordinary task.

- Before confirmation, show preferences, scope, checks, and budget without dispatch. Enrollment retains its observation-only meaning.
- Clarification stays within the original target/scope and two-batch cap. Broader requirements require new authorization without clearing spending.
- Record content/script checks and historical page checks separately. Incomplete candidates, mandatory-check failure, or unknown usage cannot be adoptable. Isolated check outputs belong to RSI, not early ordinary project execution.
- Review complete diffs, reason, checks, limits, and costs. Release execution resources while waiting; waiting does not extend the budget window.
- Bind text/scripts/resources before the first ordinary request. Revision, clarification, and comparison are RSI costs; ordinary task execution is daily usage.
- Cancel/failure/interruption preserves reasons, candidates, and the ledger, stops dependent requests, and cleans owned resources. Restart does not call a model automatically. Failed/exhausted/rejected candidates leave a choice to continue with the baseline or stop, with no automatic fallback.

Baseline continuation validates the original version, does not retry RSI or reset costs, and charges subsequent ordinary work to its session. Stopping the task cancels RSI and pending task startup, preserving existing files/history and other tasks. This differs from the older observation-only end action, which does not stop ordinary work.

### First binding and existing sessions

A task that will use the candidate waits before its first request. Native `/Skill` expansion may already contain baseline text in pending messages; rebuild those messages and verify that old and new instructions are not both sent. Disk edits or sidebar labels alone do not establish correct binding.

When a session has used the old Skill, use native session creation for a linked session with current requirements, necessary project constraints, confirmed preferences, and provenance. Do not fork the entire old model context or copy old instructions/tools. The linked continuation inherits the same task choice, while independently started tasks reconfirm.

Creation, binding, and dispatch must be recoverably idempotent. Duplicate clicks cannot create multiple sessions or duplicate execution. Missing resources, failed creation, or insufficient context remain recoverable; do not change the old binding or discard required information. Stopping also blocks a not-yet-dispatched linked task.

### Validation and compatibility

Controlled checks cover no calls before confirmation, direct preference input, actual in-scope changes, unchanged files, duplicate operations, malformed/out-of-scope rejection, clarification/failure budgets, cancellation/restart accounting, no ordinary request before adoption, exact text/resource binding afterward, and old-binding preservation.

Six-dimensional preferences, design snapshots, analyses, drafts, enrollments, and receipts retain their meanings. Migrations cannot invent editing or adoption approval. This single-candidate path does not establish all G2–G4 isolation/effect/recovery gates.

## Earlier preparation fields

Authority: `src/frontend-contracts.ts`; commands reuse G1 transactions, revisions, and receipts. Text is bounded; extra fields fail.

| Object | Fields and limits |
|---|---|
| Preference | UUID/revision, project/personal scope, project ID or null, one of six dimensions, confirmed text, enabled; up to 768; one current record per scope/dimension |
| DesignTask | UUID/revision, Skill/workspace/version, brief, collecting/ready/closed, up to two question batches and six answers, frozen snapshot/digest, creation time; up to 256, one open preparation per Skill |
| Answer | Dimension, value/no_preference/skip, text/null, task/project/personal scope; skip/no-preference are task-only |
| FrozenDesign | Brief, Skill version, six ordered effective preferences, source scope/revision; null explicitly marks unspecified/skipped; digest binds the whole snapshot |

Initial preparation has no page-type conditions or automatic semantic conflict detection. Confirmed text may express conditions; the host only merges scopes. Analysis can identify semantic conflicts without overwriting preferences or bypassing mandatory checks. See [FRONTEND-SCENARIO.md](FRONTEND-SCENARIO.md).

## Preparation commands

- design_create checks source/version/workspace and asks at most three missing dimensions locally.
- design_answer accepts all questions in the current unanswered batch only. Save answers and explicitly persisted preferences in one transaction; generate at most one remaining batch. Receipt replay adds no batch.
- design_override changes a previously answered/inherited dimension for this task, including skip/no preference. Current unanswered questions still use design_answer. It changes no persistent preference or question count.
- design_finish freezes confirmed context and enters ready; unanswered optional aesthetics are explicitly unspecified. No model call or revision authorization follows automatically.
- design_close retains answers/snapshots and rejects closure during dependent analysis; cancel or settle first. Closed previews cannot start.
- preference_save explicitly creates/edits/enables/disables project/personal preferences. A scope/project change cannot masquerade as updating the old record.
- preference_remove removes the current record, not historical frozen tasks/receipts; it is not deletion of every historical copy.

Do not repeat confirmed questions. Precedence is task → project → personal → unspecified. Task skip/no-preference overrides inheritance. Preference changes affect collecting/future tasks, never ready snapshots. New conditions after confirmation require a new preparation and do not reset model budgets.

G1 prepare_analysis can include a ready design's complete frozen context and binds its ID/digest. Recheck availability at analysis start and draft save; one-analysis confirmation still applies. A design direction is a suggestion, not a score. prepare_design_analysis also permits a direct ready-design preview with opportunityId=null; it invents no daily event. Both routes share redaction, size, budget, preview, and accounting. The sent redacted text is previewed; the design digest binds the original confirmed snapshot.

## Enrollment and persistence (g2.1/g2.2)

The earlier flow asks before frontend work whether to enroll the selected Skill for the current task. Normal input is primary; manual registration/preparation remains advanced. Enrollment authorizes observation only.

agent/pre-step recognizes explicit frontend Skills or locally matched page requests and pauses through native userQuestions. Show actual available Skills; inject a proposed Skill only after selection. Declining leaves ordinary work unchanged. A mid-run skill tool hook can pause before loading, but cannot prove no model calls occurred earlier. Rules are not general natural-language recognition.

Enrollment: UUID, sessionId, starting turn, workspaceId, included/declined, Skill ID/null, active/ended, creation time; up to 512, one active per session. Do not treat free text, silence, cancellation, or unload as consent. Recheck source/workspace after answering and commit copy/enrollment together. Continuous edits in the same session retain the choice; a new session or manual end asks again. Ending observation does not stop ordinary work.

SQLite 3 → 4 adds empty enrollments and retains requests/receipts/designs. Native unfinished questions do not become restart authorization. Ask only real root Agents; background subagents cannot request broader permission. Missing responders or cancellation block dependent requests.

For historical workspace checks, use loaded session headers or native sessionPersistence.stat for unloaded sessions. Do not load entire conversations or take over sessions. Missing/mismatched workspaces fail; persistence errors remain explicit.

Earlier SQLite 2 → 3 added frontend state and null analysis-design links. Both migrations validate within a transaction, preserve budgets/drafts/receipts, and roll back corrupt/unknown records. Older binaries reject new versions; rollback requires a stopped-host backup or separate directory.

Installation registers the neutral bundled rsi-frontend-design Skill. Confirmed enrollment registers it automatically; manual management remains advanced. Earlier frozen design context must be copied into ordinary tasks; enrollment alone did not inject preferences.

## Earlier acceptance and follow-up

No-cost checks cover unenrolled/changed-source rejection, question limits, skip/no preference, scopes, frozen snapshots, stale writes/idempotency, restart, migration rollback, zero-call preparation, and one-analysis context attribution. Isolated browser tests use fixed responses and verify discovery, questions, saved preferences, frozen context, and preview; close their services afterward. They do not replace Docker or real-generation evidence.

The initial sample assumption was a fictional product landing page with HTML/CSS/a little JavaScript, pending user selection. Before a new execution stage, freeze artifact lists, checks, image/resources, tool boundaries, and request budgets rather than prebuilding unused objects.
