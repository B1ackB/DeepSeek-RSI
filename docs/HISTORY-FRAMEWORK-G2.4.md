# Archived Design Through g2.4

This is the historical plan, not current product requirements. See [FRAMEWORK.md](FRAMEWORK.md) and [EXTENSION-CONTRACTS.md](EXTENSION-CONTRACTS.md). On 2026-09-13 the user replaced score-driven acceptance with compilation, manual choice, and sidebar iteration. The English translation preserves the earlier decisions, proposed limits, and unverified assumptions below.

# DeepSeek RSI Plugin Plan

Historical update: 2026-09-08. g2.3 subsequently implemented combined preference/budget confirmation, independent candidate generation/checks, manual adoption, and page dispatch; see [MAINFLOW-REPORT.md](MAINFLOW-REPORT.md) for SQLite 5 and evidence. Earlier g2.0–g2.2 installation/preparation records are historical. The g2.3 development stage did not upgrade the user's running profile or add paid calls.

[Documentation](README.md) · [Development rules](../AGENTS.md) · [Core contracts](CONTRACTS.md) · [Source review](SOURCE-REVIEW.md) · [Local Harness](HARNESS-LOCAL.md)

At the planning snapshot, G0 integration and G1 observation/analysis existed. The user selected frontend design, lightweight proactive questions, and project memory, with G2 preparation underway; complete isolated candidates and G3–G5 were not established. Implementation follows ponytail full, tabs, and Gate-specific executable contracts. Unverified Harness APIs require experiments.

The first approved integration batch used a dedicated Skill, OrbStack, V4-Flash / High, at most eight requests with 4096 output tokens each, a 100000 confirmed-token stop threshold, and twenty minutes. See CONTRACTS section 8 and G0-REPORT for actual accounting. This was not a complete optimization budget or permission for another batch.

Source research corrected an earlier omission: SkillOpt already had plugins/dsh. Its Python CLI wrapper did not establish native Session collection, Web review, executable-Skill isolation, or full accounting. The plan therefore chose a native plugin instead of treating the wrapper as a complete RSI product.

Goal: an independently maintained, installable personal plugin. Users confirm preferences and authorize Skill text/script revisions, review checks, separately adopt, then begin the ordinary page task. Daily observation remains an auxiliary opportunity source. Fixed evaluation would supply evidence; rewriting a Skill or liking one page would not prove general capability improvement.

Static source findings, product decisions, proposed engineering choices, and experimentally verified integration are separate categories throughout this plan.

## 1. Confirmed product requirements at the planning date

| Topic | Historical decision |
|---|---|
| Delivery | Independent repository, external DeepSeek Harness plugin, personal use |
| First scenario | Frontend design/preferences; repository analysis B, log analysis D, testing/diagnosis C later |
| Editable object | Authorized SKILL.md, references, Python/Shell helpers |
| Opportunity discovery | Local observation; model analysis only after a user click |
| Direct preference edits | One card confirms preferences, paths, budget; no observation signal prerequisite |
| Clarification | Up to three questions per batch, two proactive batches per task; skip/close, no repeated valid answers; model questions consume the budget |
| Preference scope | Explicit task requirements first; project persistence by default, personal only by explicit choice; frozen runtime snapshot |
| Objective | Explicit preferences are valid objectives; otherwise suggest evidenced choices/tradeoffs including capability, cost, brevity |
| Edit authorization | Once per bounded optimization task, binding Skill/scope/objective/limits; multiple revisions inside scope |
| Activation | Separate user confirmation after evaluation, never automatic during search |
| Ordinary page handoff | Wait for candidate checks/adoption, then bind before first page request |
| Existing sessions | Create a linked session if old Skill was used; carry requirements/preferences, preserve old binding |
| Unadopted candidate | Failure, exhaustion, or rejection leaves baseline/stop choices; no automatic fallback |
| Source files | Preserve by default; overwrite requires explicit separate consent |
| Evaluation | Fixed frontend requirements/checks, explicit preference feedback, confirmed real-task regressions; lists still to freeze. Later B uses pinned repositories/labeled questions |
| Correctness | Mandatory checks pass and required-answer accuracy does not decrease; improvement in accuracy is not required for brevity |
| Execution | Local Docker first, remote Linux later |
| Rounds/time | At most three rounds, one candidate each, sixty minutes including baseline, generation, evaluation, retries, cleanup |
| Early stop | Two complete rounds without objective progress; other limits/failure/cancel can stop sooner |
| Usage | Request count, per-call output cap, cumulative-token stop threshold; confirmed/unknown visible |
| Realtime UI | Separate current Harness and RSI accounting with phase/in-flight/budget detail |
| User budget | May lower within host caps |
| UI | Main-page right sidebar; G0 settings panel is only an integration probe |

One managed Skill per optimization. Joint Skills, runtime/controller changes, evaluator changes, and permission changes were outside the first version.

## 2. Frontend design first

Start with a neutral design Skill, generate pages, receive feedback, and ask limited preference questions. [Frontend boundaries](FRONTEND-SCENARIO.md) defines questioning and project memory. Early fixed questions only appeared after explicit preparation and missing dimensions; the full target flow remained staged work.

The later confirmed direct flow sends preferences/current Skill to a separate model, with host-owned authorization/scope/budget/checks/adoption. One card combines preference/edit confirmation; adoption stays separate and the first page task waits. The six historical preference categories are not an exhaustive input taxonomy. See [direct revision](G2-CONTRACTS.md#preference-driven-independent-revision).

Frontend evidence was planned around usable pages, required content/interactions, explicit aesthetic comparison, and new-page regression. Preference changes and procedure improvements are recorded separately. Repository questions below do not become aesthetic scores.

### 2.1 Later scenario B: Repository analysis

Tasks locate files/symbols, explain calls, trace configuration/overrides, identify failure branches, and cite a pinned commit. Editable behavior includes search/read order, stopping rules, answer structure, snippet extraction, and deduplication helpers.

| Objective | Primary measure | Also show |
|---|---|---|
| Localization accuracy | Fixed-question correctness, key symbols/relations | Citation validity, time, tokens, calls |
| Token efficiency | Complete matched-task usage | Correctness, cache, time, calls |
| Brevity | Required information, length, depth | Required-answer accuracy, final-answer and total tokens, omitted optional content |
| Speed | Repeated complete-task duration | Correctness, tokens, calls |
| Maintainability | Evidenced duplication/structure changes and human review | Behavior regression, static checks, performance changes |

Fewer lines or tool calls are not automatically better. Do not hide correctness losses in weighted scores. An answer limited to implementation location, short conclusion, and required citations may satisfy brevity without improving capability. Optional background/repetition need not remain.

Shorter final output, lower complete-execution tokens, and better task capability are distinct claims. Brevity may pass while total usage does not decrease, provided the report says so. A token-efficiency objective still requires full accounting. Never omit required verification/conclusions to manufacture savings.

## 3. Target user flow

This was a target, not a claim of complete implementation; g2.2 only had enrollment and suggestion analysis.

1. Submit a frontend task and choose enrollment; same-session edits retain the choice. Existing enrollment remains observation-only.
2. Enter natural-language preferences. One sidebar card shows scope, mandatory requirements, baseline, editable files, route, checks, and total budget. Submission authorizes bounded revision.
3. Freeze/revalidate input and send complete Skill/preferences/requirements to a separate model. Direct objectives need no prior analysis. Clarifications share the original budget.
4. Edit an independent authorized copy, seal it, run checks/evaluation. Models cannot change authorization, budgets, checkers, or ACTIVE.
5. Use frozen evaluation input. Incomplete baseline/candidate evidence cannot imply comparison/pass. Legal files alone do not establish a correct or preferred page.
6. Separately approve the exact candidate; bind text/resources before the first page request. Unbound sessions may bind; previously old-version sessions get a linked context without old instructions, preserving the original.
7. Feedback may drive another in-scope candidate or a later task; each activation is separately approved. Source export remains separate.

Observation → opportunity → confirmed analysis → objective/authorization remains auxiliary. Saving preferences, analyzing, or expressing liking is not edit permission. Broader objectives/scope need renewed confirmation with old spending retained.

On generation/check failure, exhaustion, or rejection, retain the baseline/evidence and wait for baseline continuation or stop. Baseline continuation uses the revalidated initial version; stop cancels RSI and pending page startup without deleting existing files. No automatic fallback/regeneration.

## 4. Repository and modules

Keep DeepSeek-RSI independent. The Harness fork supports source debugging and minimal patches, not routine RSI implementation. One package contains host, browser, and installation configuration; responsibilities need not become separate packages/services.

| Responsibility | Owns | Does not own |
|---|---|---|
| Harness integration | Mounting, events, Skill loading, Web | Candidate superiority |
| Observation/analysis | Local signals, bounded evidence, clicked analysis | Editing/activation |
| Controller | Authorization, state, budget, cancel, serial scheduling, recovery | Model-editable rules |
| Accounting/projection | Real request ledger, phase ownership, live snapshots | UI/model-reported billing |
| Generation | Authorized candidate edits from reference/objective/feedback | Approval, private answers, ACTIVE |
| Docker | File/process world, limits, artifacts, cleanup | Business acceptance |
| Evaluation | Frozen tasks, execution, computed checks | Direct activation |
| Versions/evidence | Immutable content, provenance, diffs, approval/history | Model self-certification |
| Web | Review, actions, later rollback/export | Unvalidated host state writes |

No marketplace, remote scheduler, generic multi-agent framework, or team permissions in v1.

### 4.1 Source-informed choices

Use TypeScript host/Web in one package; Python/Shell stay in Skills/fixed execution images. Do not embed EvoSkill, SkillOpt-Sleep, Memento, or another Agent Loop.

Reuse model providers, credentials, Agents, Skill providers, Session logs, and Web connections. Own deduplication, durable authorization/state, immutable versions, fixed evaluation, accounting, and adoption. Load with the user-started host; no daemon, nightly cron, or login startup.

Historical scheduling proposal: one global executing optimization and one candidate per round, with daily sessions still available. Mark or pause speed comparisons under contention. Generate from the best complete reference for at most three rounds; no GEPA/Pareto/frontier dependency. Correct tasks can still seek brevity/cost improvements.

Proposed file responsibilities, not prebuilt scaffolding:

```text
src/
	index.ts       # lifecycle and host registration
	contracts.ts   # authority, state, evidence
	store.ts       # local transactions and objects
	observe.ts     # cursors, signals, deduplication
	run.ts         # analysis, candidates, budget, cancellation
	evaluate.ts    # fixed tasks and acceptance
	docker.ts      # file/process execution and cleanup
	usage.ts       # attempt ledger and ownership
	skills.ts      # sealing, providers, activation, rollback
	client/        # native sidebar
evals/frontend/  # page tasks/checks to freeze; repository sets later
```

Use tabs; decide filenames/dependencies in G0, without speculative factories/packages.

## 5. Harness integration

Pinned commit: d347e703908d0406b7a7ef80e3a0e594d86b2215, not a universal compatibility promise. Record a reproducible build and dependencies.

| Entry | Static source basis | Verify |
|---|---|---|
| Installation | dsh plugin, bundle, patches | Package/directory install, remove, restart |
| Web | dsh.client, settings.plugins.tab | Factory build format, transport, validated actions |
| Skills | Providers, scope layers, change events | Name precedence, session pins, resource paths |
| Observation | Session logs, agent/tools events | Incremental cursors, attribution, no duplicate prompts |
| Worker | Agent setup and scoped capabilities | Pin Skill/tools before first call |
| Execution | Replaceable fs/subprocess world | Docker files/processes, streams, cancel |
| Usage | llm/stream, TokenUsage, results | All retries/compression, pre-dispatch accounting, realtime projection |
| User actions | Native Web/approval/commands | Durable cross-turn authorization, stale-approval rejection |

ctx.approval.request requires an active turn and cannot alone implement durable background-task authorization. Store explicit RSI authorization, accepting user intent through the existing Web channel and enforcing it on host writes.

External browser bundles need Harness's module-factory format; internal helpers were not a published external preset. G0 verifies adaptation rather than promising zero integration cost.

First prove package→Web→persistence, events→Skill identity, provider→fixed version/resources, and actual attempts→ownership/usage. Probe Docker early. Retry policy IDs or Session steps are not globally unique request IDs. Verify compression/subcall/retry attribution. Unattributable RSI calls cannot dispatch; daily accounting gaps do not expand RSI's authority over ordinary tasks.

## 6. Trust and Docker boundaries

Trusted controller/model integration/private evaluation answers stay on the host. Model-driven file/process operations enter Docker. Reuse the native Agent Loop with a restricted execution world; no bypass through local tools, plugin self-editing, arbitrary MCP, network, or other host capabilities.

Tools.restrict alone is not complete isolation: scope registration/composed tools can interact. Verify actual inventories, monotonic guards, and every execution entry.

| Content | Generation | Evaluation |
|---|---|---|
| Baseline/reference | Read-only | Read-only |
| Candidate | Separate writable copy | Sealed read-only |
| Pinned reference repository | Read-only copy | Read-only copy |
| Output/temp | Separate bounded writable area | Fresh writable directory each run |
| Private answers/evaluator/database | Not mounted | Not mounted |
| Original Skill/HOME/credentials/socket | Not mounted | Not mounted |

No container network; host makes model calls, so no API keys enter scripts. Use non-root, read-only root, dropped capabilities, and CPU/memory/process/output/time limits, calibrated on initial tasks and owned by host configuration.

Pin images/dependencies. Environment installation is trusted preparation, not candidate-controlled online package installation. New dependencies require a changed environment contract and cannot silently alter comparison conditions.

Clean the entire task container, not merely docker exec's host process. Label ownership and only recover/clean verified owned resources. Containers are an execution boundary, not proof against every escape; test file/network/resource/process risks.

Candidate tests and synthetic tests are untrusted execution too. They can guide debugging but cannot change host-owned checks/answers/acceptance. Unconfirmed synthetic tasks cannot enter the formal dataset.

Seal only authorized regular files/directories; reject symlinks, special files, escapes, and oversized content. Digest paths, bytes, and executable bits, not only SKILL.md. Stop writers, seal, revalidate, then mount read-only.

## 7. Managed Skills and source files

Organize original provenance, managed copies, and immutable versions. Record canonical source/scope/hash/manifest; do not edit originals on import. First-version scope is workspace-local. Display version names are not identity; authorization/evaluation/adoption bind content digests.

One active version per scope, deterministic same-name precedence, and fixed session text/resource versions are required. New/unbound sessions may bind the current version before first use; previously bound/resumed sessions retain theirs. Page tasks can wait for adoption before binding. Missing versions fail explicitly. A host-persisted per-Skill exclusion was proposed for optimization/adoption/export conflicts.

Source overwrite is a separate action showing target, exact version, and full diff. Recheck the source digest immediately before write; external changes require fresh review. Keep backup/operation journal. Multi-file replacement has crash windows and reader coordination needs; do not claim cross-filesystem atomicity. Enable export only after recovery tests; active managed versions do not depend on export.

## 8. Data and persistence

Native storage-domain has serialized single-record KV writes, not a cross-table transaction API. Its SQLite backend does not make independent API calls atomic. Use one plugin-owned local SQLite database, preferably node:sqlite, without server databases/queues or direct native-private-table access.

Proposed layout was `<DSH_HOME>/rsi/{state.sqlite,objects/<digest>,runs/<id>,exports/<id>}`; actual implementation retained the historical g0.sqlite filename. Keep data outside the source repository, and do not mount version objects together with private evaluators.

| Object | Content |
|---|---|
| ManagedSkill | Source/hash/workspace, ACTIVE, observation |
| Opportunity | Session/event, version, rule, deduplication, state |
| Analysis | User trigger, visible evidence, model route, suggestions, usage |
| Authorization | Action, baseline, paths, objective, required/optional information, preference conditions, evaluation contract, budget, revocation |
| OptimizationRun | Authorization, reference, round, deadline, ledger, status/stop reason |
| UsageRecord | Unique attempt/provider IDs, exclusive owner, session/phase/round association, route, time, usage/completeness/revision |
| SkillVersion | Digest, parent, manifest, provenance, sealed state |
| Evaluation | Version/repository/image/dataset/model settings, per-run/aggregate results, preference/acceptance |
| Activation | Approval, candidate, report digest, expected ACTIVE, result |

Host persistence is authoritative; model/browser data are proposals/projections. Write and validate content before committing references. Unreferenced crash leftovers may be cleaned, never treated as valid versions. Use idempotency plus expected state/version to reject stale clicks and duplicate callbacks.

Transactions bind authorization/task creation, reserve attempts before dispatch, update authoritative usage, validate adoption/report/expected ACTIVE and switch its pointer, and preserve unknown spending during recovery. In-process serialization is insufficient. One RSI writer per DSH_HOME; a second host cannot take over running work. SQLite does not cover files/Docker, so validated-object references and recoverable cleanup bridge those boundaries.

## 9. Historical state machines

Optimization: OBSERVED → ANALYSIS_REQUESTED → PROPOSED → AUTHORIZED → BASELINING → ITERATING → REVIEW_READY → COMPLETED, with CANCELLED/BUDGET_STOPPED/FAILED/INTERRUPTED exits. Complete qualifying candidates may remain reviewable after stopping; incomplete candidates are diagnostic only.

No complete baseline, insufficient budget, or unscorable infrastructure failure prevents comparison. A genuine wrong/incomplete Agent answer is a valid low score, not infrastructure failure or permission to weaken candidate checks.

Candidate: DRAFT → SEALED → VALIDATING → EVALUATING → SEARCH_ACCEPTED / REJECTED / INVALID. Acceptance distinguishes measured improvement from preference satisfaction. A complete accepted candidate may become the next reference; satisfied preferences can stop search. Final regression/held-out checks precede READY_FOR_USER and explicit ACTIVE adoption.

ACTIVE stays separate from references. Failed edits do not affect daily versions. Approval binds candidate, evaluation contract/report, expected ACTIVE, and authorization; changed fields invalidate it. Library accepted flags, self-scores, and candidate tests never activate directly. Worker tools cannot expose adoption/export/authorization/budget/evaluator mutations.

## 10. Historical evaluation and scenario adaptation

Frontend design was first; fixed content/interactions, same-task/preference comparison, feedback, and new-page regression were described in FRONTEND-SCENARIO section 3. Exact datasets/thresholds remained unconfirmed. The following repository design was for later B; budget/version/accounting principles were shared.

### 10.1 Dataset proposal for B

Use small pinned, manually verifiable TypeScript/Python repositories, controlled first and real open source later. Cover entry points, calls, configuration precedence, errors, tests, and negative cases where implementation is absent. Label required files/symbols/relations, acceptable alternatives, and critical mistakes separately from optional explanation.

Only user-confirmed expected answers against a frozen repository enter real-task regression. Completed history, self-reported success, and silence are not labels. Freeze development/held-out splits before optimization; hide held-out answers. A failed final check must not leak answers into further revisions in the same task.

Freeze dataset size, repetitions, improvement/noise thresholds or preference conditions after baseline measurement and before candidate generation. Do not relabel omitted required content as optional after seeing results. These are experimental settings, not validated universal numbers.

### 10.2 Fixed conditions

Pin Harness, provider/model/reasoning, Skill digest, repository, dataset, tools, image, and resources. Use fresh sessions/output directories. Compare complete Agent tasks; microbenchmarks are supplementary. Match tasks/repetitions, balance run order, record cache/environment, and avoid concurrent performance runs competing for resources.

### 10.3 Historical acceptance

1. Authorized structure/paths, valid references/entry points, bounded dependencies.
2. Loadable/runnable Skill, convergent cancellation/timeout, readable artifacts.
3. Real citations, required relationships, no forbidden effects.
4. Required-answer accuracy at least baseline across complete cases/repetitions; verbosity is separate.
5. Frozen user objective: brevity can preserve capability; token claims need complete accounting; maintainability needs static/human evidence.
6. Final regression/held-out checks bound to content before adoption review.

Prefer deterministic path/symbol/structure checks. Disclose semantic judge identity/version/uncertainty; host computes aggregates. Search compares with the best reference and final reporting also compares against initial ACTIVE. Dataset nonregression is not a universal guarantee. Below-noise results are unproven improvement, even if the confirmed brevity preference is satisfied.

Retain failures and distinguish supported edit hypotheses from metric changes. Genuine bad answers/artifacts are low scores, not excuses to rerun until success. Only missing infrastructure/scoring inputs/attribution make evaluation invalid; retries still cost budget.

### 10.4 Example B experiment

Proposed Skill: repository implementation localization and concise explanation, with Python extraction/deduplication and Shell search helpers. This was a proposed description, not an existing user Skill.

Start with a controlled small repository, then the pinned local Harness. Do not scan unrelated projects/personal files.

| Question type | Example | Required answer | Optional |
|---|---|---|---|
| Entry | Where do external plugins mount? | File, symbols, call relation | Ecosystem overview |
| Configuration | Environment key or local credential precedence? | Read path, precedence, citation | Installation history |
| Data | Is cached input included in inputTokens? | Field relation, conversion, citation | Every provider's background |
| Error | Where is retry decided? | Event, branch, stop condition | All unrelated errors |
| Negative | Does storage API support cross-table transactions? | Explicit negative plus contract basis | Alternative database essay |
| Resources | How do relative Skill scripts resolve? | Actual provider/resource chain | Skill authoring tutorial |

These are unlabeled examples, not certified answers. Preserve the task/label denominator. G2 can demonstrate a small pipeline; G3 needs separately frozen evidence. Capacity example: six development and three held-out questions, twice each, at most three candidates: `6×2×(1+3) + 3×2×2 = 60` Agent runs, including baseline/best held-out runs. One run can contain many model requests; this is not sixty API calls or an approved cost plan.

Estimate actual requests/input/output/cache/time plus analysis/generation/judges/failures. If sixty minutes/budget is insufficient, shrink scope before generation, not by dropping difficult cases mid-run. Deliver pipeline evidence without improvement claims when evidence is inadequate.

### 10.5 Acceptance examples (not measurements)

| Goal/result | Historical interpretation |
|---|---|
| Equal required accuracy, answer 800→180 characters, total tokens unchanged | Brevity preference satisfied; no total-token savings claim |
| Equal accuracy, complete usage decrease above frozen threshold | Reviewable token improvement with all calls/details |
| Lower accuracy but higher mixed score from brevity | Reject; soft objective cannot offset correctness |
| Less duplication, regression passes, no measured speed change | Review structural diff; no capability/speed claim |
| Missing baseline/usage/scorable citation | Insufficient evidence; no improvement certification or automatic adoption |

A changed file with tied scores and no satisfied objective was not acceptable under this historical plan.

## 11. Historical budgets, retries, cancellation

Analysis has a separate small budget and grants no edit permission. Optimization binds at most three rounds/sixty minutes plus model limits. Generation failures cannot evade the round cap. Count no-progress only for complete valid evaluations that neither improve the selected objective nor satisfy preferences. Equal accuracy with better brevity/cost is not no-progress. If the baseline already meets the goal, suggest reuse.

All generation, retries, reruns, compression, diagnosis, and cleanup consume time; every paid attempt consumes request capacity. Estimate baseline/candidate/final-check capacity before authorization. Enforce request/output caps and stop additional calls at the confirmed-token threshold. Unknown/unattributable RSI usage pauses further work. Input/cache/reasoning relationships follow the pinned adapter, never unverified addition. Top-level Agent steps do not count all retries. Network uncertainty cannot imply free replay.

Reserve attempt identity/owner/capacity before dispatch. A crash around dispatch retains uncertain attempts as unknown. Serial RSI calls reduce exposure but cannot guarantee a hard provider-bill ceiling. Cancellation stops queued work, disposes workers, removes owned containers, retains evidence, and verifies release; already-running provider calls may still cost money.

### 11.1 Realtime accounting

Display during execution, not only afterward. Separate current daily session from selected RSI analysis/optimization. RSI phases include analysis, baseline, generation, evaluation, final checks, judges, compression, and retries.

One ledger, exclusive attempt ownership. Session association is tracing, not duplicate aggregation. Subcalls/retries/compression inherit host-assigned ownership. Unresolved records remain separate and nonzero-unknown.

| UI field | Meaning |
|---|---|
| Confirmed tokens | Authoritative attributed usage; label partial totals |
| Input/output | Separate uncached/cache input and available output/reasoning without double-counting |
| Phase/round | Analysis/baseline/generation/evaluation/final check and request detail |
| Request state | Running/completed/failed/cancelled, in-flight/unsettled counts |
| Budget | Requests/limit, confirmed tokens/threshold, time remaining; unknown usage affects remaining capacity |
| Freshness | Snapshot sequence/time, connection/settlement state |

Update on start/usage/end/interruption through native Web snapshots. Local healthy-connection target: received usage rendered within one second, not provider per-token reporting. The inspected adapter emits usage near stream completion. Show pending usage while running, never character estimates disguised as exact tokens. Any future estimate must be separately labeled and replaced, not added again.

Each real attempt has one authoritative record. Duplicates/reconnect/recovery/parent-child aggregation cannot count it twice; revisions replace snapshots. Refresh restores host totals. The UI and enforcement read one ledger, and closing the browser does not disable limits. Optimization overhead and per-task execution cost are separate; cheaper output does not prove amortized optimization cost recovery.

Scope is selected session and RSI task, not account-wide billing. Changing sessions updates the daily card. RSI caps do not consume daily budgets or cancel ordinary tasks; Harness owns daily controls.

## 12. Recovery

| Failure | Expected behavior |
|---|---|
| Candidate script error | Fail/log; ACTIVE unchanged |
| No improvement | Reject; next round from best reference |
| Docker absent | Preflight failure, never host fallback |
| Timeout/exhaustion | Stop new work, clean; retain complete reviewable candidate |
| Browser closes | Continue only within valid authorization/deadline; restore UI later |
| Host crash/unload | Persist interruption, verify resources/evidence, no uncertain paid replay |
| External source edit | Keep provenance, re-review import/export conflict |
| Stale adoption click | Reject changed digest/expected ACTIVE |
| Interrupted activation | Transaction determines one ACTIVE; unreferenced content cannot activate |
| Interrupted source overwrite | Recover from journal/backup, no speculative merge |

On restart, mark interrupted and let the user choose recovery after rechecking authorization, remaining budget, environment, and version. Never reset spending. Suspected daily regression prompts review/rollback; it does not automatically switch versions.

Close test-owned hosts, containers, and helpers after success/failure/cancel unless asked to keep them, and verify release. Do not stop unrelated services. This development rule differs from a user-run host continuing an authorized task after browser closure. Pending/failed cleanup cannot be reported complete.

## 13. Web interface

The user requested a main-page right sidebar on 2026-09-08. G0's settings tab/markers/probes were integration-only. G1 implemented the entry, observation, previews, directions, and drafts; see [G1-REPORT.md](G1-REPORT.md).

Four planned sections: managed Skills/provenance/ACTIVE/source status; deduplicated opportunities with ignore/snooze/analyze; authorized task progress/budget/realtime usage/cancel; version diffs/results/objective tradeoffs/failures/adoption/rollback/separate export. Label capability, cost, and preference results independently.

Desktop behavior: RSI opens by default without a saved preference, remembers collapse/expand, and shares the region with native tool details via tabs. The original details slot was singular and absent for blank sessions. G1's minimal root shell.panel patch enabled coexistence/no-session access; the original pinned commit did not contain it. Expose only implemented actions.

Observe relevant managed-workspace logs, not the whole disk or a second unbounded trace. Save references and bounded summaries; observation can be disabled and derived records cleared under explicit operations. Analysis sends visible bounded related context through native credentials, excluding obvious secret fields without claiming perfect redaction.

Five initial signal types: script failure, retry cluster, repeated read, repeated/large output, explicit brevity/cost preference. Deduplicate by workspace/version/rule/event and retain ignored/snoozed decisions. Calibrate caps/cooldowns from use; credential AUTH/Docker errors suggest environment issues, not immediate Skill defects.

Offer two or three evidenced directions with required information, proposed scope, potential benefits, uncertainty, and estimated cost. An overly long answer alone does not support faster execution or lower total-token claims.

## 14. Historical delivery Gates

| Gate | Input/scope | Acceptance | Stop on |
|---|---|---|---|
| G0 | Pinned host, package/Web/provider/worker/storage/usage probes | Reproducible install, identity/binding, accounting, transactions, Docker feasibility | Required Agent Loop changes, missing events, host bypass |
| G1 | Events/signals/analysis, durable authorization, snapshots, live usage | No unclicked calls/unauthorized edits/duplicate prompts; timely actual usage | Unverifiable task/Skill attribution |
| G2 | One authorized Skill, fixed image, one candidate, file/process adapters | File/network/resource limits, timeout/cleanup; unchanged source/control store | Any host-authority bypass or unresolved cleanup |
| G3 | Frozen frontend tasks/checks/preferences, paired outputs, explicit feedback, new-page regression | Required content/function, version-bound feedback, reproducible full accounting; no generalization from one page | Untrustworthy checks/feedback/usage; aesthetics cannot offset mandatory failures |
| G4 | Iterations, budgets, exact adoption, recovery | Exact approval, unchanged ACTIVE on failure, old bindings, complete disjoint usage/recovery | Reusable stale approval, reset budget, omitted usage, conflicts |
| G5 | Install/Web/export/recovery/docs | Clean full flow, separate source-write authorization, recovery | No reproducible end-to-end evidence |

G0 is a small interface experiment. G2 establishes one authorized candidate, G3 fixed-set effect evidence, G4 iterative/manual adoption, G5 install/export delivery. No single demo represents all Gates. Test actual risks: bypass, container authority, stale approval, mixed versions, aggregation, omitted costs, crash recovery; do not mirror trivial copy changes with tests.

## 15. Later extensions

B repository analysis uses sections 2/10. D logs adds labeled logs, false-positive/negative checks, streaming/resources. C testing/diagnosis adds frozen faults, test cost, correct localization/reproducibility, with private evaluators immutable. Remote Linux follows a stable local execution contract and explicit authentication/transport/integrity; no speculative remote service. Workflows, joint Skills, or executable plugins require independent scope decisions; RSI does not imply controller self-edit permission.

## 16. Engineering questions at the planning date

Verify external Web build/transport; provider precedence/pre-load binding/restored resources; Docker FS/Subprocess/tool integration; complete retry/compression/cache accounting; dataset/repetition/threshold capacity within an hour; multi-file export crash recovery and readers.

These are experiment questions, not user preference questions. Avoid unmeasured completion percentages. Freeze model/budget/image/dataset configuration before the relevant Gate. G0 later supplied minimal evidence in [G0-REPORT.md](G0-REPORT.md); it did not prove a complete optimization platform or isolation surface.

## 17. Source references

The original pinned links are preserved below. PenguinHarness informed workflow ideas, not a copied platform or permission enforcement through Skill text. [SOURCE-REVIEW.md](SOURCE-REVIEW.md) contains related-project call chains and limits.

- [B1ackB/deepseek-harness / docs/architecture.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/docs/architecture.md)
- [B1ackB/deepseek-harness / apps/cli/reference/README.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/apps/cli/reference/README.md)
- [B1ackB/deepseek-harness / packages/skill/skill/src/index.ts](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/skill/skill/src/index.ts)
- [B1ackB/deepseek-harness / packages/core/agent/src/index.ts](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/agent/src/index.ts)
- [B1ackB/deepseek-harness / packages/core/tools/README.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/core/tools/README.md)
- [B1ackB/deepseek-harness / docs/cookbook/adding-a-settings-card.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/docs/cookbook/adding-a-settings-card.md)
- [B1ackB/deepseek-harness / packages/client/ui-settings-plugins/README.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/client/ui-settings-plugins/README.md)
- [B1ackB/deepseek-harness / packages/interaction/user-approval/README.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/interaction/user-approval/README.md)
- [B1ackB/deepseek-harness / packages/llm/llm/src/types.ts](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm/src/types.ts)
- [B1ackB/deepseek-harness / packages/llm/llm-deepseek/src/translate.ts](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm-deepseek/src/translate.ts)
- [B1ackB/deepseek-harness / docs/subsystems/sandbox.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/docs/subsystems/sandbox.md)
- [B1ackB/deepseek-harness / packages/storage/storage-domain/README.md](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/storage/storage-domain/README.md)
- [B1ackB/deepseek-harness / packages/storage/storage-sqlite/src/index.ts](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/storage/storage-sqlite/src/index.ts)
- [B1ackB/deepseek-harness / packages/llm/llm-retry/src/index.ts](https://github.com/B1ackB/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/packages/llm/llm-retry/src/index.ts)
- [Prism-Shadow/penguin-harness / plugins/continual-learning/hooks/stop.mjs](https://github.com/Prism-Shadow/penguin-harness/blob/b5b21977116d31c4ac396afae50feaf391be3a07/plugins/continual-learning/hooks/stop.mjs)
- [Prism-Shadow/penguin-harness / plugins/agent-tuning/skills/agent-optimization/SKILL.md](https://github.com/Prism-Shadow/penguin-harness/blob/b5b21977116d31c4ac396afae50feaf391be3a07/plugins/agent-tuning/skills/agent-optimization/SKILL.md)
- [Prism-Shadow/penguin-harness / packages/server/src/services/benchmark-service.ts](https://github.com/Prism-Shadow/penguin-harness/blob/b5b21977116d31c4ac396afae50feaf391be3a07/packages/server/src/services/benchmark-service.ts)

## 18. Historical requirements coverage

Coverage means a planned owner/check, not implementation completion.

| Requirement | Plan | Validation |
|---|---|---|
| Independent native plugin | Sections 4–5 | G0/G5 install/remove/restart |
| Frontend first, B/D/C later | Section 2, frontend document, section 15 | G3 pages/preferences/new-page regression |
| Lightweight questions/project memory | Frontend sections 1–2 | Question limits, skip/deduplication, cost, scope/snapshot conflicts |
| Skill text/scripts/references | Sections 6–7 | G2 paths/script execution |
| User objective: brevity/efficiency/etc. | Sections 2/10 | Separate G3 acceptance |
| Local observation and clicked analysis | Sections 3/11/13 | G1 deduplication and request causality |
| Select direction before editing | Sections 3/8 | G1 no unauthorized edits |
| Bounded multi-round authorization | Sections 8/9/11 | G4 tamper/revoke/stale checks |
| Three rounds/sixty minutes/two no-progress rounds | Section 11 | G4 failures/retries/cleanup cannot evade limits |
| Lower user budgets | Sections 1/11 | G1/G4 host caps |
| Local Docker then remote Linux | Sections 6/15 | G2 files/network/cancel/cleanup |
| Fixed evaluation/confirmed real regressions | Frontend section 3 and section 10 | G3 frozen tasks/preferences and isolated checkers |
| Correctness/nondecreasing accuracy before efficiency | Section 10 | G3 no mixed-score compensation |
| Equal capability with better brevity allowed | Sections 2/10.5 | Separate preference and capability evidence |
| Separate adoption | Sections 7–9/13 | G4 digest-bound ACTIVE transaction |
| Preserve source/separate overwrite | Sections 7/12 | G5 conflict/backup/recovery |
| Separate realtime daily/RSI tokens | Sections 8/11.1/13 | G1 calls; G4 retry/compression/reconnect |
| Harness Web workflow | Sections 5/13 | G0 entry/G5 full flow |
| Close test-owned processes | Section 12 | Every validation cleanup |

Proposed engineering baseline: one package, one SQLite, immutable file objects, one serial optimization, one scoped provider, one Docker adapter. Add remote services, wider search, or engines only for measured needs. Inputs to settle per Gate were the first Skill, manually labeled formal tasks, approved request/token limits, and local Docker. Example numbers were not spending authorization.
