# Scenario Extensions and User Comparison Contracts

User decision dated 2026-09-13. These rules supersede the earlier design in which functional scores or regression results decided whether a candidate was worth activating. Historical reports retain their original conclusions.

- Users choose the baseline, candidate, or further sidebar revision. The host does not compute an overall quality score or automatically select a winner. Passing compilation means only that the scenario's compilation/format checks completed.
- Authorization, file scope, integrity, and provider usage validation remain mandatory. Comparison has a separate budget explicitly covering one request per side. Viewing results and preparing another iteration do not call models.
- A comparison freezes requirements, preferences, model settings, and scenario version; only Skill files differ. Each side records artifact digest, compilation state, timestamps, and duration. Tokens come from the provider ledger.
- Each iteration is an independent traceable task. Feedback creates a parentId link and a new confirmation card. Prior authorization, outputs, failures, and costs are neither deleted nor reused. Unadopted candidates may be references but are not active versions.
- Scenarios own recognition, output instructions, and compilation. Core owns requests, state, accounting, storage, and adoption. Web and general text are built in. Third-party scenarios are installed trusted host code; candidates and Web input cannot register them dynamically.
- Web comparison is a self-contained HTML/CSS/JavaScript page, with no tools or project writes. Existing esbuild compiles CSS/JavaScript; the browser parses HTML fragments. Text validation requires nonempty text. Multi-file builds need explicit trusted execution integration, not arbitrary model-supplied host commands.
- Authenticated Harness HTTP serves previews with HTML sandbox/CSP isolation and separate links. They are not public deployments.
- Request failures, compilation failures, unknown usage, and interruptions remain recorded. After comparison starts, candidate compilation and related usage must complete before adoption. Baseline and further-revision choices remain available. The older review path without comparison is preserved.
- SQLite 6 adds default scenarios and empty comparison/parent fields to historical tasks while preserving old tables, receipts, versions, and accounting. Older binaries require a stopped-host backup for rollback.

## Executable fields

| Definition | Fields and meaning |
|---|---|
| FlowTask extension | `parentId`; pinned `scenario`; read-only `reference`/`referenceFiles`; independent `comparison` or null |
| ScenarioInfo | `id`, `version`, `label`, `kind`; historical default frontend / 1 |
| Comparison | Independent ID, authorization operation/time, deadline, scenario, shared system prompt, budget, status, and two fixed runs |
| ComparisonRun | Side, Skill digest, dedicated sessionId, complete frozen input, status, timestamps, monotonic duration, artifact digest/kind/check details, error |
| Preference extension | `scenarioId`, default frontend; existing task/project/personal precedence within a scenario |

Authority: `src/mainflow-contracts.ts`, `src/comparison-contracts.ts`, and `src/scenarios/contracts.ts`. Types derive from schemas. Artifact bodies are content-addressed files, not repeated in browser snapshots.

## Web operations

Commands reuse the schemaVersion, operationId, expectedRevision envelope. The same operation and payload return the original receipt; reusing an ID with different content fails.

| Operation | Main payload | Preconditions/failures |
|---|---|---|
| flow_compare | taskId, candidateDigest, separate budget | Review only, no existing comparison; verify source, both sealed versions, scenario version, and complete input |
| flow_cancel_comparison | taskId | Running comparison only; abort in-flight work, retain usage and a completed side |
| flow_revise | taskId, feedback, baseline/candidate reference | Review/failed/dispatched with no in-flight work; one direct child per parent; create confirming task |
| flow_choose | Existing choice and exact digest | No adoption during comparison; candidate compilation and related usage required after comparison starts; baseline or stop remains possible |

Feedback cannot broaden authorization silently. The new card displays the complete baseline, reference files, editable paths, and budget. The model returns all changes against the effective baseline, not just a delta against an unadopted reference.

## Accounting and interruption

Comparison ownerId is the comparison ID. The purposes are baseline and evaluation; sessions use `rsi-comparison/<comparisonId>/<side>`. Each side permits one actual request; additional retries fail before dispatch. Any unknown usage blocks further dispatch in that batch.

Charts show fully confirmed total tokens per side. If any usage is unknown, the total is null; confirmed portions may be listed separately. Monotonic duration covers the side's request, compilation, and sealing, excluding user waiting. Skill-revision usage is displayed separately from artifact generation.

Cancellation/restart never deletes spent requests. Restart marks running comparisons failed and incomplete sides interrupted with unknown duration; it does not rerun them. Users can create a later iteration from the retained candidate and decide on fresh spending in its card.

## Preview and adoption

URLs use `/api/rsi-preview?task=<id>&side=<baseline|candidate>` on the current Harness host. After authentication, the endpoint reads a compiled artifact and verifies its digest. It accepts no arbitrary disk path. HTML uses CSP sandbox and network restrictions; text uses text/plain.

Comparison does not change ACTIVE. Even when both artifacts compile, adoption requires a separate user choice. Tokens, time, and model claims cannot activate a version. If the baseline fails but the candidate compiles and related usage is known, the user may adopt the candidate; the UI must retain why the comparison is incomplete.
