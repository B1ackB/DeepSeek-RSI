# Agent Execution Policy Feasibility Evidence

Date: 2026-10-15. The saved experiment uses the actual pinned Harness Agent Loop with an offline scripted adapter and two fixed read-only tools. It checks that a scoped execution-policy section is present from the first request, tools feed evidence back into the loop, forbidden capabilities do not execute, and owned Agents dispose cleanly.

[Proposal and contracts](../../EVOLUTION-PILOT-PLAN.md) · [Probe source](probe.mjs) · [Independent process results](result.json) · [Existing project checks](check.log)

## Saved results

Baseline, candidate and restored-baseline each ran in a distinct Node process. Each completed three fixture requests, two tool calls/results and one completed turn. All three used identical source bytes. The candidate's policy was absent from baseline/restored inputs, and the baseline's policy was absent from candidate inputs. Source bytes were unchanged; forbidden-tool executions and remaining registered Agents were zero. The temporary input directory is removed in the awaited finalizer; successful process exit includes that finalizer.

These runs use predetermined responses with predetermined tool choices. They establish integration and evidence flow, not that a policy caused better reasoning, fewer calls, or improved real-world results. The restored run installs baseline text in a new environment; it does not test a durable RSI rollback command. Process separation is not an OS sandbox for editable component code. Dedicated SDK profiles, policy persistence, protected evaluator storage and evaluation-budget integration still require implementation and tests.

The saved `check.log` records type checks, 17 passing Node tests and build on Node 25.8.1 against the pre-existing working tree. The checks and probe make no real model calls. No Docker container or network listener is started. The probe loads no real provider adapter or credential configuration.

## Reproduction

Run from the RSI repository after building/linking the pinned Harness dependencies. Use the same Node version as the saved run. For an independent side, capture stdout to a new file rather than overwriting the historical result:

```sh
/opt/homebrew/bin/node docs/evidence/evolution-feasibility/probe.mjs "$PWD" baseline > /tmp/rsi-policy-baseline.json
/opt/homebrew/bin/node docs/evidence/evolution-feasibility/probe.mjs "$PWD" candidate > /tmp/rsi-policy-candidate.json
/opt/homebrew/bin/node docs/evidence/evolution-feasibility/probe.mjs "$PWD" restored > /tmp/rsi-policy-restored.json
```

The probe verifies the actual linked Harness commit before starting. With the side omitted, it runs all three scoped Agents sequentially in one process to check scope separation in a shared runtime. The script only creates its own temporary source fixture and in-memory sessions; it neither opens a historical RSI database nor modifies existing source directories.

Cleanup disposes Agent handles and the Cordis context, then removes the probe-owned temporary directory. Any failed assertion or cleanup exits unsuccessfully. Provider usage values inside the adapter are fixtures and must never be reported as paid usage or measured token savings.
