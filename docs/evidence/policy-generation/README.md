# Policy Generation Gate Evidence

Date: 2026-10-15. All responses and usage are scripted. Paid model calls: **0**.

- [check.txt](check.txt): both TypeScript configurations, 55 passing tests and build. Ten new tests cover 22 native LLM proposer dispatches and two additional native SDK evaluation children.
- [complete.json](complete.json): a reduced copy of the standalone cycle. It retains the actual proposer request view, sealed generation, version provenance, separately authorized misleading-source batch, native evaluation evidence, distinct ledger owners and policy totals. Generation uses 13 synthetic tokens; evaluation uses 150 across ten requests/eight tool calls; combined total is 163.
- [verification.json](verification.json): runtime, source hashes, boundary/accounting/cleanup checks and preservation against this turn's initial file inventory. Earlier evidence and unrelated waiting/cancellation work remain unchanged.

Reproduce with Node 25.8.1 and the existing pinned Harness:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:generation
```

The command retains a fresh controller database/result in its unique `.cache/policy-generation-<UUID>` directory. The proposer runs in a fresh in-process native LLM context with only a fixed adapter, no tools/history/memory; that context is disposed. Evaluation uses the existing two independent owned child profiles and removes their temporary homes after recording evidence. No existing user profile/database, credentials, service or paid route is used.

The boundary test seeds fixed-case answers in controller state, then verifies the adapter's actual request contains only the exact baseline, requirements and an independent development example. None of the fixed answers, case questions or source snapshots is sent. Other tests cover unauthorized fields/parameters, unchanged/invalid/partial/tool output, unknown/conflicting usage, stale/repeated authorization, separate evaluation permission, two-generation lineage, cancellation/deadline, interrupted partial output, failed sealing recovery and old-v7 preservation.

These results establish a controlled generation/sealing/evaluation protocol. The evaluation adapter emits scripted answers, so this is not semantic proof, real-model generalization or improvement. No result adopts a version. Previous [paired](../policy-comparison/README.md), [persistence](../policy-persistence/README.md), [execution](../policy-gate/README.md) and [feasibility](../evolution-feasibility/README.md) evidence is retained unchanged.
