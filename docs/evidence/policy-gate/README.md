# Repository Policy SDK Gate Evidence

Date: 2026-10-15. Runtime: Node 25.8.1. Harness commit: `d347e703908d0406b7a7ef80e3a0e594d86b2215`.

[Contract](../../POLICY-CONTRACTS.md) · [Report](../../POLICY-REPORT.md) · [Check output](check.txt) · [Complete task trace and ledger](complete.json) · [Preservation and cleanup checks](verification.json)

## Verification

`npm run check` passes host/client type checks, all 24 tests and build. Seven new tests cover the policy contract/tools and 15 native SDK child runs, including baseline, candidate, restored baseline, permissions, accounting limits, unknown usage, provider failure, truncated streams, cancellation, deadline and crash recovery. Existing 17 tests remain passing.

`complete.json` is an additional run through the public development command `npm run policy:fixture`. It contains the complete frozen run input, its policy/conditions digests, a runtime provenance digest, native session events, durable attempt rows, adapter dispatch checks, disposal record and cleanup results. The task completes three model requests and two tool calls. All three attempt rows are committed before adapter dispatch, confirmed and settled. Their total of 45 tokens is scripted fixture data, not real provider usage.

The trace is a complete Agent task: search, read, result feedback and final source-citing answer. The adapter explicitly checks that the read evidence reaches its final request. The process has exited, the worker reports zero Agents and forbidden executions, and its owned directory has been removed. Normal failure/cancel paths are checked by the tests; forced crash is recovered as interrupted without replay.

No real model adapter is loaded. The child environment excludes ambient credential variables, and its temporary profile/home does not copy or open a user's existing Harness home. SQLite remains version 6; only disposable fixture stores are created. This gate does not establish real-model improvement, a persistent policy adoption/restore workflow, or an OS sandbox for editable code.

## Reproduction

From the repository with the pinned dependencies and documented Node runtime:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:fixture
```

The development command writes `.cache/policy-fixture-result.json`; keep a new copy when recording another run. Do not overwrite these historical evidence files. The original exploratory feasibility evidence remains in the adjacent `evolution-feasibility` directory.
