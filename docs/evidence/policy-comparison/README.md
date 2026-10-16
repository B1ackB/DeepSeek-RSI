# Paired Policy Evaluation Evidence

Date: 2026-10-15. Fixed responses and synthetic usage only. Paid calls: **0**.

- [check.txt](check.txt): both TypeScript configurations, 45 passing tests and build. Ten new paired tests launch 36 SDK children; the existing seven native policy tests launch another 15.
- [complete.json](complete.json): standalone paired symbol task. Two separate PID/home/profile/session combinations, one controller database and batch, identical conditions/runtime, six requests, four trusted tool results and 90 synthetic tokens. Both child directories are removed. The new controller database/result remains in the unique cache directory shown in the record.
- [verification.json](verification.json): runtime, checked counts, current source hashes and preservation results against this turn's starting inventory.

The new tests exercise six fixed cases, two-side cumulative request/token limits, unknown usage on either side, child/controller process loss, no replay, wrong facts/citations, tool-free answers, deadlines/cancellation, missing cleanup receipts and old-v7 compatibility. The forced-controller-loss check observes native child exit on stdin EOF, preserves unresolved directory ownership in SQLite and verifies that a restart cannot manufacture cleanup evidence. Test cleanup then removes that recorded owned directory. No historical PID or existing user service is stopped.

Reproduce with the pinned Harness and existing native dependencies:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:comparison
```

Every fixed case has a separate paired batch; these are not a pooled six-case budget or real-model comparison. All complete tasks include actual native tool dispatch/results and continuation. Structured fact/citation checks remain a bounded technical evaluator. No score activates a policy; policy generation, held-out real-model experiments and user adoption/restore remain future work. Earlier [persistence](../policy-persistence/README.md), [execution](../policy-gate/README.md) and [feasibility](../evolution-feasibility/README.md) evidence remains unchanged.
