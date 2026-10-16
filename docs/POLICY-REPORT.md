# Repository Evidence Policy First Gate

Date: 2026-10-15. This gate implements the policy content/run contract and a native SDK child-profile verification path. The existing Skill UI remains operational. No paid calls, live-profile changes or historical database migrations are part of this gate.

This is the first gate's historical report; its saved evidence remains unchanged. The subsequent sealing, v7 migration and batch accounting implementation is documented separately in [POLICY-PERSISTENCE-REPORT.md](POLICY-PERSISTENCE-REPORT.md). Statements below about pending persistence describe that earlier gate.

[Contract](POLICY-CONTRACTS.md) · [Pilot plan](EVOLUTION-PILOT-PLAN.md)

## Implemented boundary

- `src/policy-contracts.ts` defines strict policy content, bounded frozen snapshot/route/budget conditions and digest-checked run input. Only literal instructions are editable. Real provider routes are rejected.
- `src/policy.ts` supplies two bounded snapshot tools and a full-task dispatch guard around the existing durable usage observer. It is a concrete policy module, not an optimizer/executor framework.
- `scripts/policy-fixture.ts` uses the existing native `DeepSeekHarness` SDK to own each child, custom profile and shutdown. Its environment is explicit and credential-free. `scripts/policy-fixture-worker.ts` installs policy and capabilities before the first request and registers only a scripted adapter.
- `tests/policy.test.ts` exercises the native process/profile path and hostile/failure cases. Tests assert task terminal reasons, rather than treating an SDK response or idle state as success.

The frozen repository snapshot is supplied as a bounded text manifest. Tools retrieve from that manifest rather than reopening arbitrary workspace paths. This keeps the first object data-only and makes source access exact. General repository enrollment, source discovery and code execution remain outside this gate.

## Validation

The final check output and a complete native SDK run are saved under [policy-gate evidence](evidence/policy-gate/README.md). Validation uses the actual linked Harness commit `d347e703908d0406b7a7ef80e3a0e594d86b2215` and Node 25.8.1.

The successful path uses three requests, two real trusted tool calls, retained source evidence and a completed turn. Baseline, candidate and a new restored-baseline run have independent PIDs, homes and sessions, matching execution conditions/runtime digests, and the expected distinct policy identities. Restored-baseline execution is not a persistent restore-command test.

Boundary checks cover a late scoped forbidden tool, out-of-snapshot reads, changed model route, request/token/input caps, missing usage, a provider error, truncated output, cancellation, deadline and a forced child crash. All normal/cancelled workers dispose their Agents; the parent verifies owned process exit and directory removal. Forced crash is followed by owned-store interruption recovery without replay.

The offline adapter checks that its in-flight attempt is already committed before every dispatch. Recorded token totals are synthetic fixture values. The result is evidence for execution, accounting and cleanup contracts, not real-model quality, semantic resistance to prompt injection, or an OS sandbox for candidate code.

## Compatibility and remaining work

No existing Skill manifest or ledger schema is repurposed. The fixture's private v6 store uses the existing session owner; the production RSI policy owner and SQLite 6-to-7 migration are not implemented. Existing uncommitted waiting/cancellation changes are preserved. The earlier feasibility evidence is retained unchanged.

The next step is policy version storage and additive migration with populated-v6 preservation tests, followed by the policy-specific owner/batch admission branch. Fixed task evaluation, generation, sidebar adoption/iteration, durable binding and restore follow those contracts. Real-model execution and credential provisioning remain separately authorized work.
