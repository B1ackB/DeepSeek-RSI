# Shared Policy Batch and Fixed Task Evaluation

Date: 2026-10-15. Scope: two independent native SDK children in one durable batch per fixed repository case; frozen evaluator/input, cumulative accounting, uncertain usage, interruption and cleanup. No paid requests, live database/profile changes, new dependency, general runner framework, policy generation or adoption UI.

[Contract](POLICY-CONTRACTS.md) · [Saved evidence](evidence/policy-comparison/README.md) · [Earlier persistence gate](POLICY-PERSISTENCE-REPORT.md)

## Implementation and authority

`scripts/policy-comparison.ts` coordinates the existing native child fixture. SQLite uses exclusive locking and ordinary open performs recovery, so the controller hands connections off sequentially rather than opening the same database concurrently or introducing a new RPC service. It seals versions, freezes one batch with two runs and starts baseline. It closes its connection before SDK startup. The worker uses an explicit existing-v7-batch handoff and verifies the exact active run, policy, runtime and deadline; it records attempts with the existing observer. It cannot authorize or finish this shared batch through the task's tool capabilities. After verified exit/cleanup, the controller reconnects, persists evidence, finishes the run and starts candidate under the same cumulative limits.

Every child has a separate home, profile, workspace, session and PID. Only bounded snapshot search/read are available. The parent records the owned home before launch; the worker records its PID before any model dispatch. Ownership cannot be reassigned. Only model-readable literal policy bytes differ in a normal comparison. Route, question, snapshot, tool implementation, per-run limits and checker identity remain fixed. Failure injection modes are test-only controls and do not support performance claims.

`src/policy-evaluation.ts` contains six fixed cases: direct symbol, cross-file call chain, error path, misleading same-name source, insufficient evidence and instruction-like source data. Each case uses its own paired batch; budgets do not pool across six cases. Authorization contains `repository-evidence-v1`, case ID and a digest of the fixed conditions/facts. Changing those checks or inputs is rejected. Expected facts are not exposed through snapshot tools.

The answer is structured claims with values and source line ranges. The external checker verifies expected facts, valid paths/ranges, required source coverage and actual observed excerpts. It accepts different tool sequences. Infrastructure also requires complete native turns, real allowed tool results reaching continuation, exact request/ledger identity, confirmed successful attempts, independent workers and cleanup. Wrong facts/citations are `failed`; missing tools, unknown usage, interruption or unverified cleanup are `incomplete`. Scripted expected-value matching is a bounded technical check, not a semantic judge or evidence of real-model improvement. No result selects or activates a policy.

Evidence retains bounded native events/final response, request envelopes, dispatch IDs and parent cleanup observations in the same batch row. Each run is at most 2 MiB. Different evidence cannot replace a retained run. The host derives evaluation results; the caller cannot submit a passing score. Results bind the exact authorization, evidence and ledger digest. Repeating evaluation is idempotent; changed inputs reject the prior result. A future adoption path must revalidate that binding.

## Persistence, failure and recovery

The new spec/evidence/evaluation and resource fields are optional additions to the existing v7 batch JSON. No table or database-version change is needed. Historical v7 rows have no evaluator authorization and cannot be reclassified as evaluated; terminal serialized rows remain unchanged. Existing v6 migration checks and old Skill contracts remain in the suite. No historical user database was opened.

Per-run and cumulative request/token limits apply at each durable reservation. The parent actively closes a hanging worker at the earlier run/batch deadline. Unknown usage stops further dispatch and prevents launching remaining work. Failure on the second side retains baseline evidence and costs. Startup recovery preserves reservations, unknown totals, terminal outcomes and owned-resource locations; it never restarts either side or refreshes authorization.

Normal cleanup requires native SDK close, exited PID, zero registered Agents/forbidden effects and removed owned home. A missing disposal receipt retains the home, returns an incomplete result and explicit `unverifiedResources`, and prevents candidate launch. The test inspects and then removes that exact owned directory after proving its PID exited.

A controlled test kills the controller process after durable dispatch into a hanging adapter. The pinned native SDK server exits on stdin EOF. Reopening the controller database marks both remaining runs interrupted and preserves unknown usage, resource PID/path and absence of cleanup evidence. The home is deliberately reported as unresolved, not silently deleted by opening SQLite. The test verifies process exit and then removes its recorded home. General automatic orphan deletion or killing historical PIDs is not implemented; uncertain resources remain inspectable and cannot pass evaluation. A power/OS failure or a different native runtime needs separate cleanup verification.

## Validation

Node 25.8.1, pinned Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`, existing right-panel patch unchanged:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:comparison
```

The full check passes both TypeScript configurations, **45 tests** and build. Ten new paired tests exercise all six cases, both-side process separation and shared accounting, request/token stops before/within candidate execution, unknown usage on either side, child loss, controller loss/EOF, wrong answers/citations, tool-free answers, cancellation/deadline, frozen evaluator/evidence, old-v7 compatibility and missing cleanup receipts. The new tests launch 36 child runtimes; existing native policy tests launch 15 more. Responses and usage are synthetic; real paid calls: zero.

The standalone paired symbol case records six requests, four trusted tool results and 90 synthetic tokens in one persistent batch. Its child homes are removed; the new controller database/result is retained in a unique ignored cache directory, and a sanitized evidence copy is saved under `docs/evidence/policy-comparison`. Earlier reports/evidence and unrelated waiting/cancellation changes are retained.

Policy generation, a held-out/repeated real-model evaluation, user adoption/restore and ordinary-session policy bindings remain later stages. The single-run fixture still exists for smaller boundary reproduction.
