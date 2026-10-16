# Policy Candidate Generation and Fixed Evaluation Gate

Date: 2026-10-15. Scope: offline candidate generation, scope validation, immutable sealing/provenance and a separately authorized fixed full-task evaluation. No adoption, active-pointer/session-binding change, paid route, new dependency or general optimizer framework.

[Contract](POLICY-CONTRACTS.md) · [Saved evidence](evidence/policy-generation/README.md) · [Previous paired gate](POLICY-COMPARISON-REPORT.md)

## Concrete implementation

- `src/policy-generation-contracts.ts` defines one restricted proposer view, one candidate response and generation authorization/state schemas. `src/policy-generation.ts` makes one tool-free request through the existing native Harness LLM service. It uses no Agent Loop, repository tool, memory or inherited conversation. The existing observer must be installed by the host; both the production plugin and fixture register it. Evaluation retains complete native Agent tasks and actual tools.
- The request contains the exact intact baseline, explicit requirements and an independent `names.js` development example with a failure observation. It contains no selected evaluation case, expected fact, golden answer, previous evaluation result or persisted controller state. The model has no database/file tool. This is a model-input/capability boundary, not a sandbox against arbitrary trusted host code or deliberate user-provided secrets. Tests seed held-out answers into controller data and verify the actual native adapter request excludes them.
- Output is exactly `{kind: candidate, instructions, rationale}`. Unknown authority fields, templates, invalid UTF-8/size, malformed JSON and unchanged instructions fail. The host assigns identity, parent and generation provenance. A valid response requires a normal completed stream and confirmed successful usage before sealing. Neither provider failure, truncated/max-token output, tool calls, data after finish nor unknown/conflicting usage can seal.
- `policy_generations` is a concrete third policy table in the existing v7 development database. It retains frozen input digest, one-request offline budget, revision/deadline, append-only partial response, status, error and candidate digest. Version bodies/digests remain unchanged; metadata gains optional `generationId`. The host publishes read-only bytes and commits registered version metadata and task completion in one SQLite transaction. File publication may leave a recoverable unreferenced object on failure, without a committed candidate.
- `observeUsage`/`reserve` resolve registered generation sessions before ordinary ownership and validate the exact prompt, route, output cap, no-tools/no-history envelope, active state and request/window limits. Each attempt uses generation task ID and generation purpose. Evaluation retains its distinct batch owner. Policy totals combine both and retain unknown totals; batch queries exclude generation.
- `authorizeGeneratedPolicyEvaluation` requires a separate authorization ID/budget and binds the sealed generation, policy, baseline/candidate digests, case/spec and runtime. It makes no request. Generated candidates cannot omit their provenance link. Repeated identical confirmation returns the same batch; conflicting reuse fails. The existing comparison controller was split at the real need: a manual preparation wrapper and `executePolicyComparison` for already-authorized batches, with the previous child lifecycle preserved.

## Recovery and compatibility

Startup interrupts authorized/running generation tasks and preserves their deadlines, partial output and attempts. It never replays or infers success from a valid-looking response. Repeating authorization does not reset a terminal task. Trusted late usage can update totals without authorizing sealing/evaluation. A fresh generation request needs a new authorization; known failed attempts retain their costs.

Scope, usage or file-publication failure leaves the bounded response, error and ledger intact without an eligible candidate. A filesystem failure followed by a fresh authorization is tested; the first failed record is retained and the new committed version identifies the new task. Two successful generations form an exact baseline → candidate → revised-candidate lineage without rewriting any earlier object or provenance.

The table is appended transactionally; no old business JSON, ledger, binding, receipt or terminal batch is rewritten. Old v7 rows lack generation metadata and remain readable. The new optional provenance/link fields can be rejected by older strict v7 development builds; downgrade uses the complete stopped-host backup, never dropped tables or forced version edits. Invalid persisted identities/provenance fail closed. No live historical database was opened during validation.

## Validation and limits

Node 25.8.1 and pinned Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:generation
```

The full check passes both TypeScript configurations, **55 tests**, and build. Ten new tests exercise the actual native proposer request view/held-out exclusion, response and authority scope, one-shot/stale authorization, separate evaluation permission, two-generation lineage, policy/batch cost attribution, unknown/conflicting usage, cancellation/deadline, interrupted checkpoints, file-publication recovery and old-v7 preservation. The new tests make 22 scripted proposer dispatches and add two evaluation child runs to the previous 51 native SDK child runs. All usage is synthetic; paid requests: **0**.

The standalone cycle retains a fresh controller database/result under a unique `.cache/policy-generation-<UUID>`. One generation request uses 13 synthetic tokens. Its separately authorized held-out misleading-source case executes ten requests and eight actual tool calls across two owned children, using 150 synthetic tokens. Policy accounting is 163 total, with distinct generation and batch ownership. Both evaluation child homes are removed and the proposer context is disposed. A reduced evidence copy is saved separately; earlier reports/evidence and unrelated dirty changes remain intact.

The six fixed cases are withheld from the proposer view, but their evaluation adapter still emits scripted answers. This validates the data/control boundaries and full-task protocol; it is not independent real-model generalization, semantic proof or demonstrated improvement. No evaluation result selects a policy. User review/adoption/restore and ordinary-session policy bindings remain subsequent work; real calls still need explicit model/request/output/budget confirmation.
