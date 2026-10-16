# Fixed questions over sealed repository source

2026-10-16. Extension of [sidebar authorization](POLICY-AUTHORIZATION-CONTRACTS.md), fixed responses only. This contract precedes implementation. The editable object remains literal repository-evidence-policy instructions.

The subsequent [manual pack gate](POLICY-MANUAL-QA-CONTRACTS.md) adds explicitly reviewed human-authored packs for other sealed snapshots. The built-in pack and historical commands below retain their original semantics.

## First supported source and questions

Use one host-authored `repository-source-qa-v1` pack with three fixed cases: `symbol`, `call-chain`, `error-path`. Its source is the three ordinary JavaScript files in `fixtures/repository-qa-v1/`, captured through the existing real-worktree preview/seal path. Select their full repository-relative paths (`fixtures/repository-qa-v1/checkout.js`, `pricing.js` and `unused.js` under the same directory). Match the entire sorted path/content manifest byte-for-byte, including the decoy file; the registered checkout root can differ. No code is executed when authorizing or evaluating. Unsupported or changed manifests fail before batch creation or model dispatch; never substitute the pack's files for the selected snapshot. Supporting another repository requires another reviewed host pack/version, not inferred ground truth or a candidate-provided answer.

The reviewed path/content manifest has an independent pinned SHA-256 in the host definition. Installed example files are a convenience for capture/preparation, not live grading authority. The helper refuses altered examples; changing them cannot make a different snapshot eligible or change an already sealed comparison. Existing valid source snapshots continue using their original questions/answers even if an installed example later changes. This manifest identity is separate from the exact source-snapshot digest, which also binds its repository root.

- Symbol: identify the `total` implementation actually imported by checkout, rejecting the same-name unused implementation.
- Call chain: trace `submit → checkout → total` and the successful calculation, with evidence from both defining/calling files.
- Error path: identify the invalid-quantity guard, exact thrown error, propagation and catch/return behavior, with evidence for both throw and catch.

The host fixes each question, exact structured fact/value pairs, required citation ranges and required source reads. The existing answer schema and full-task checker remain authoritative. These are manually reviewed facts for this exact small program, not an automatic static analyzer or proof of arbitrary repository semantics. A controlled execution of the trusted fixture during development checks the authored facts; candidate/source code is never executed by the evaluator.

## Authorization, conditions and evidence

Add only optional `caseId: symbol | call-chain | error-path` to `policy_evaluate`. Omission retains `repository-source-v1` and its unchanged first-line semantics. A present case selects `repository-source-qa-v1` with source ID, case ID and digest over the fixed pack/expected answer and complete conditions. The command still binds workspace/active approval, generation, baseline/candidate, exact source ID/digest and an independent cumulative budget. Unknown fields, evaluator/answer overrides and mismatched receipts are rejected. Each case is one separately authorized paired batch; there is no automatic three-case suite or aggregate winner.

Both runs receive the exact same question, full selected manifest, tools, route and unchanged per-side limits. Only policy bytes/run IDs differ. Preserve budgets: multi-file questions need more tool round trips and can exhaust the approved request/input/tool/time limits. The UI displays the chosen question type and separate batch budget before confirmation. Selecting a case, viewing results or generation alone never runs evaluation or raises a budget.

Require native search plus reads of every case-required file, successful matching tool results, source text carried into continuation, normal turn completion, confirmed shared-ledger usage, distinct child processes/homes and verified cleanup. Facts and citations are checked against frozen host answers and observed numbered source lines. A correct answer without full tool execution is incomplete. A complete wrong answer/citation fails quality; users still decide adoption under existing integrity/usage rules. Candidates cannot change questions, answers, required reads, budgets, permissions or the active pointer.

The generator prompt remains baseline + requirements + independent development example. No pack question, expected answer, selected source, previous evaluation result, database or tools enters the proposer request. Only the host/fixed response adapter accesses held-out answers. Workers receive the question and frozen source/tools, never the evaluation spec or answer pack. Runtime fingerprinting covers the reviewed manifest identity and host definition; evaluation rederives the exact spec/conditions without loading live example content.

## Compatibility and recovery

SQLite stays at unreleased version 7. Add one evaluation-spec variant and the optional command field; do not rewrite old first-line/casebook batches, receipts, sessions or terminal usage rows. Old commands omit `caseId` without defaults; duplicate commands return original receipts without replay. Startup and every dispatch validate exact source/intent; source-evaluation sessions retain their original batch/source checks. Older strict v7 builds may reject new rows; downgrade only from the complete stopped-host backup.

Reuse the existing one-host-ledger/two-child executor, cancellation, persisted deadlines, resource ownership and startup interruption. Unknown usage remains null and blocks further batch dispatch. Stop/controller loss keeps partial work and spent requests; restart never replays it. Missing/corrupt source, changed host pack definition, stale choice/version/source or altered case/spec fails closed. Cleanup failure remains visible and cannot pass. No new paid route or spending authorization.

## Acceptance

Check all three cases through real snapshot capture, scoped generation and separately authorized independent native full tasks. Verify authored facts against the trusted fixture, same paired conditions, no held-out material in actual generator/worker payloads, decoy/wrong/unsupported source refusal, immutable old rows, exact-case receipt conflicts, wrong/missing citations and facts, tool-free/incomplete evidence, cumulative limits, unknown usage, stop/controller loss/restart without replay and owned-resource release. Exercise the case selector/confirmation in the native sidebar with fixed responses. Preserve original history and the pre-existing Harness patch.
