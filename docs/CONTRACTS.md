# Core Rules and G0 Contracts

2026-09-13: the current product uses compilation/format thresholds and user choice. See [extension contracts](EXTENSION-CONTRACTS.md) for comparisons, later iterations, and SQLite 6 migration. G0 sections below describe the historical integration contract and do not authorize current spending.

[Documentation](README.md) · [Development rules](../AGENTS.md)

Historical update: 2026-09-08. G0 integration was implemented with executable definitions in `src/contracts.ts`; evidence and remaining limitations are in [G0-REPORT.md](G0-REPORT.md). Section 8 retains the first approved batch, not a renewable budget.

[FRAMEWORK.md](FRAMEWORK.md) owns product scope and acceptance; [AGENTS.md](../AGENTS.md) owns development rules. This document defines cross-boundary data semantics and validation without duplicating the architecture or prebuilding later Gates.

On 2026-09-08 the user selected frontend design as the first complete scenario, with lightweight proactive questions and project memory. See [frontend boundaries](FRONTEND-SCENARIO.md) and [G2 contracts](G2-CONTRACTS.md) for enrollment, preparation, and SQLite 4. G1's one-analysis budget and historical G0 budgets retain their original meaning. Content/function checks and aesthetic feedback were separate in that historical design.

The [preference-driven revision contract](G2-CONTRACTS.md#preference-driven-independent-revision) allows direct candidate generation after one card confirms preferences, paths, and budget, without a preliminary suggestion analysis. Exact candidate adoption remains separate and precedes the first ordinary task request. The g2.3 implementation details supersede the earlier proposal text; neither grants a new paid batch.

## 1. Project invariants

1. Local observation does not create model spending. Analysis is user-triggered and does not authorize edits.
2. Revision authorization binds one Skill, baseline, scope, requirements, checks, and budget. Each generation produces one candidate. Further requirements create a linked task with fresh authorization checks; old accounting is retained.
3. Models edit authorized candidates only, never runtime code, permissions, budgets, compilers, or active pointers.
4. Active and reference versions are separate. Activation requires separate approval of an exact candidate. Previously bound sessions retain their version; an unbound task may wait for approval before its first binding. Source overwrite requires separate consent.
5. Scenario compilation/format checks are technical thresholds. Users judge output value; functional/aesthetic scores do not block their choice. Scope and integrity checks remain mandatory. Incomplete usage cannot establish complete-execution token savings.
6. This version does not implement automatic score-driven search or stopping. Users continue, adopt, or stop. Revision and comparison budgets are separately confirmed; failed/interrupted work retains costs.
7. Each actual request attempt has one usage record and one spending owner. Daily and RSI accounting are disjoint. Real retries count separately; duplicate events do not add cost.
8. Unknown usage, incomplete evaluation, stale authorization, and cleanup failure remain explicit. Restart, exception handling, and UI resets cannot erase budgets or evidence.

## 2. G0 scope and common conventions

G0 uses a small manually prepared Skill and controlled requests to establish integration. These objects are not production editing authorization, formal evaluation reports, or activation approval.

| Convention | Definition |
|---|---|
| Schema version | Top-level Web/persistence objects carry `schemaVersion: 1`; unsupported versions fail with a reason, without rebuilding the database |
| IDs | Plugin IDs are host-generated UUIDs; native Session/event IDs remain opaque native strings |
| Time | UTC Unix milliseconds, safe nonnegative integers; monotonic process timers; recovery uses persisted deadlines without restoring the full window |
| Numbers | Nonnegative safe integers; reject NaN, Infinity, negatives, and numeric strings |
| Nullability | `null` means explicitly unknown/unavailable, not zero; other required fields cannot be omitted |
| Revisions | Mutable records start at 1 and increment on effective changes; old revisions cannot overwrite new records |
| Write input | Reject undefined fields; host creates identities, timestamps, authority, and results |
| Errors | Stable codes plus readable reasons; distinguish validation, conflict, missing capability, execution, unknown usage, and pending cleanup |

G0 initially uses one probe-state record to verify transactions and revision comparison, without full business tables. Wire fields need not map one-to-one to database columns.

## 3. Skill and session binding

### 3.1 SkillSnapshot

| Field | Type and constraints |
|---|---|
| skillId | Plugin UUID; identical names do not imply the same managed object |
| workspaceRoot | Host-resolved canonical absolute path; browsers cannot bind arbitrary paths |
| sourceRoot | Canonical test Skill source path, retained as provenance; execution uses sealed resources |
| versionDigest | SHA-256 of the complete manifest, 64 lowercase hexadecimal characters |
| files | Nonempty list ordered by relative-path UTF-8 bytes; each item has path, contentDigest, executable |

Require regular files and SKILL.md. Paths use `/`; reject absolute paths, empty segments, `.`, `..`, backslashes, duplicates, symlinks, and special files. Stop writers before sealing, validate reads, and never mutate sealed content.

Content hashes use raw bytes without newline normalization. The version hash uses UTF-8 bytes of compact JSON `[[path, contentDigest, executable], ...]`, without a trailing newline. Executable is a boolean; copies normalize ordinary permissions and remove special bits. Source location and timestamps do not affect the hash. This is a plugin format, not a claim about native Harness hashing.

### 3.2 SessionSkillBinding

Fields: schemaVersion, sessionId, skillId, versionDigest, boundAt. The host creates the `(sessionId, skillId)` binding before first use; it cannot change during the session or recovery.

- Same key/digest is idempotent; same key/different digest fails.
- New or unbound sessions may obtain the current version before first use. Sessions already bound or sent old instructions retain the old version.
- Preference-driven tasks wait for checks and user adoption before binding. Do not send the baseline and then rewrite the same binding. When old history exists, create a linked session with confirmed requirements/preferences, preserving the original. Creation and dispatch must be idempotent; see G2.
- Text, scripts, and references resolve from the same sealed version.
- Missing pinned versions/resources fail; never fall back to another same-name Skill.
- G0 must verify pre-load binding and restored scope; report an API gap if they fail.

## 4. UsageAttempt

Create one record per actual provider request attempt. Agent steps, retry-policy IDs, and provider request IDs cannot replace attemptId.

| Fields | Meaning |
|---|---|
| schemaVersion, attemptId, revision | Common conventions |
| owner | session/rsi, or unresolved for unassignable daily work; RSI ownership must be known before dispatch |
| ownerId | Daily Session ID or RSI analysis/revision ID; G0 uses a probe UUID. Null only when unresolved |
| sessionId | Nullable native association for tracing, never a second accounting owner |
| purpose | daily, analysis, baseline, generation, evaluation, final_check, probe |
| callKind | agent, compression, judge; retries preserve actual purpose/kind |
| retryOfAttemptId | Prior attempt UUID only for an actual retry, otherwise null |
| provider, model | Actual dispatched identifiers, not inferred display names |
| providerRequestId | Nullable provider-returned correlation evidence |
| state | reserved, in_flight, succeeded, failed, cancelled, interrupted, not_sent |
| createdAt, startedAt, endedAt | UTC milliseconds; latter two nullable until known |
| usageState | pending, partial, confirmed, unknown; independent of request success |
| tokens | inputUncached, inputCacheRead, inputCacheWrite, output, reasoning, total; each a safe nonnegative integer or null |
| usageSource | provider, derived from verified field relationships, or null |
| diagnostic | Nullable host-recorded accounting conflict; conflicts pause further probe calls |

Lifecycle and settlement:

- Reserve and consume a request slot transactionally before dispatch, then mark in_flight. Use not_sent only with proof; uncertain dispatch becomes interrupted with reserved capacity and unknown usage retained.
- In-flight attempts can succeed, fail, cancel, or interrupt. Failed/cancelled calls can cost tokens. Late authoritative usage may revise a terminal record without restarting it.
- Pending waits for usage; partial has authoritative fields without a reliable total; confirmed has a reliable total even if some details are unsupported; ended attempts without a reliable total become unknown while preserving partial fields.
- Duplicate events change neither revision nor cost. Updates replace the attempt's measurement snapshot; aggregation uses its latest revision. Contradictory/out-of-order updates with uncertain ordering retain a diagnostic rather than being summed or maximized.
- Reasoning may already be included in output; never double-count. Verify cache relationships against the adapter. Prefer a reliable provider total; derive only from verified nonoverlapping fields.
- A real retry gets a new attemptId, inherited ownership, and a new request slot. Unreliable RSI attribution/settlement blocks additional paid RSI calls, not unrelated daily sessions.
- Whether internal retries, compression, and subcalls can be registered before dispatch is a G0 integration question. After-the-fact observation alone does not establish budget enforcement.

The ledger does not promise provider usage per streamed token. G0 covers success, duplicates, interruption without usage, controlled retry, and compression attribution. Fixed-event merge tests and real-chain evidence are labeled separately.

## 5. G0 Web operations and snapshots

G0 permits status reads, harmless marker writes, and cancellation of its own probe. It has no production activation, overwrite, or revision authorization commands. Paid probes use reviewed local test configuration; opening a panel does not launch them.

Write envelope: schemaVersion, operationId, kind, probeId, expectedRevision, payload.

- set_marker accepts only a marker of at most 128 Unicode code points to test Web → host → persistence.
- cancel_probe accepts an empty payload; stop and clean only the current probe's resources.
- Same operation ID/content returns the original result; different content or stale revision fails.
- Validate the authenticated Harness channel and current probe. Idempotency IDs are not credentials. Do not expose writes without a trusted caller boundary.

Snapshots include schemaVersion, snapshotRevision, updatedAt, selected Session ID, probe state, and daily-session/selected-RSI/unresolved usage sections. Show confirmed totals, in-flight and unsettled counts, and completeness. No confirmed data means no confirmed usage, not free execution.

Snapshot sequence never decreases across restart. Clients accept newer full snapshots without summing totals. Reconnect fetches a full snapshot; disconnection retains the last timestamp and marks data stale. Use native Web transport, not a second server. Displaying received authoritative usage within one second on a healthy local connection is a measured acceptance target.

## 6. Probe evidence and cleanup

ProbeResult fields: schemaVersion, probeId, check, status, startedAt, endedAt, evidence, failureReason, cleanup.

- check: package_web, skill_identity, session_binding, storage_transaction, usage_attribution, tool_boundary, docker_lifecycle.
- status: pending → running → passed/failed/blocked. Skipped checks stay blocked with a reason; rerunning a terminal check creates another probe ID.
- evidence: repository-relative report/evidence paths with static/fixture/live classification. Exclude credentials; record host commit, environment, commands, expectations, and results.
- failureReason is required for failed/blocked checks, otherwise null. endedAt is null while running.
- cleanup: not_required, pending, complete, failed. Functional success plus cleanup failure is not a completed validation.

Record subprocess identity/start evidence, container IDs/labels, ports, and temporary directories. A reusable PID alone is insufficient ownership proof. Cancel dispatch, stop owned resources, then verify release. Never replay paid probes blindly after restart.

Transaction probes cover rollback, revision conflicts, and duplicates. Seal and validate files before committing references. Docker probes cover fixed scripts, limits, timeout, and cleanup; one successful command is not complete G2 isolation evidence.

## 7. Later Gate schemas

| Gate | Define before implementation |
|---|---|
| G1 | Opportunities, analysis, managed Skills, authorization/budget fields, revocation |
| G2 | Candidate writable scope, container resources, artifacts, single-round result |
| G3 | Output comparison, compilation, user choice; current fields are in EXTENSION-CONTRACTS.md |
| G4 | Iterations, stop reasons, adoption, rollback, complete recovery |
| G5 | Source-overwrite transaction/conflicts/recovery, install/upgrade compatibility |

Section 8 records G0 model/budget/Skill/runtime choices; verify exact image and environment before execution. Map schemas to actual Harness APIs, recording adjustments and affected checks. Technical adaptation may iterate; changing user-approved permissions, budgets, or acceptance needs confirmation.

## 8. Historical G0 execution inputs (2026-09-08)

This section preserves the pre-implementation environment and authorized first batch. Those approvals were consumed by G0. See its report for actual requests, OrbStack, and cleanup. A new batch or changed scope needs fresh authorization.

### 8.1 Environment and implementation choices

- Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`, clean working tree, packageManager pnpm@11.7.0.
- arm64 macOS 26.6.2; terminal default Node 24.14.0, previous installation binary `/opt/homebrew/bin/node` 25.8.1. G0 explicitly uses the latter without changing global defaults; release compatibility remains to be checked.
- Dedicated `DSH_HOME=/Users/black/.dsh-rsi-dev`, native credential management. No secret reading or online credential revalidation during this inspection.
- No docker/colima/orb in inspected PATH and no Docker.app/OrbStack.app in common application locations; custom installations were not ruled out.
- Port 3080 had no listener. No host, model request, or container was started by that inspection.
- Strict TypeScript and Node tests preferred. Do not copy all of Harness's Vitest/tsdown/oxlint toolchain. Verify dependency installability before choosing external Web/schema tools.

### 8.2 Approved choices

| Decision | Approved plan | Historical status |
|---|---|---|
| Test Skill | Dedicated g0-probe with SKILL.md, one Python and one Shell script, one reference; two fixed-output versions. Formal analysis Skill deferred to G2/G3 | Confirmed |
| First real batch | deepseek-official / deepseek-v4-flash / high; at most 8 actual requests, maxTokens=4096 each, stop dispatch at 100000 confirmed tokens, 20 minutes | Confirmed |
| Containers | OrbStack for local Docker; assistant to install afterward | Plan/install authorized, not yet installed at this snapshot |

Budget covers the entire batch, including tool round trips, compression, and retries: eight requests are not eight user tasks. Run serially, prove pre-dispatch counting first, and stop if internal calls bypass it. Unknown usage or any reached limit stops new requests. Reserve cleanup time within the window. The token figure is a stop threshold, not a hard billing cap; an in-flight request may exceed it. Retain unfinished checks rather than increasing the budget.

This batch is separate from the historical product proposal of three rounds/60 minutes. Truncation is a call-limit result, not automatically a Skill defect; do not raise caps or switch models without authorization. No pricing estimate or guarantee that every live check fits was made.

[OrbStack documentation](https://docs.orbstack.dev/) is the installation reference. Verify installation/startup during execution. Do not enable startup login, Kubernetes, or extra Linux machines. If the whole runtime was started solely for testing, quit it afterward once other user workloads are ruled out. Otherwise clean only owned resources. Explain actual system-permission blockers without re-requesting already granted installation consent.

### 8.3 Minimal probes and pass evidence

| Probe | Input/action | Required evidence |
|---|---|---|
| External package/Web | Mount panel, write marker, refresh/restart | Persistence, stale revision rejection, idempotency |
| Skill identity | Test Skill plus same-name interference | Exact managed resolution; no missing-version fallback |
| Session binding | A=v1, fixture switches new-session entry to v2, create B and resume A | All A resources remain v1, all B resources v2; no production activation API |
| Transactions | Inject failure, duplicate operation, stale revision | No partial writes, restart consistency, reproducible conflict |
| Attribution | Fixed events, then budgeted daily/RSI/retry/compression requests | One attempt/owner, pre-dispatch limits; fixture and live evidence separate |
| Tool boundary | Inspect tools before first call; attempt fixed forbidden entries | No scope/composition bypass; record gaps |
| Docker lifecycle | Fixed scripts, read-only version, temporary output, timeout | Execute/cancel/clean and verify exit; not full G2 acceptance |

Use Python's standard library and `/bin/sh` only. Verify architecture and pin image digest. Proposed limits: non-root, no network, read-only root, bounded temporary storage, 1 CPU, 256 MiB, 64 PIDs, 10 seconds per sample. Record reasons for necessary adjustments; these are not formal evaluation defaults. Never mount credentials, full user directories, or the Docker socket.

Order: no-cost package/Web/transaction/static binding probes, Docker, then authorized live calls. Independent integration can proceed without Docker, but incomplete G0 checks remain open. Formal datasets, improvement experiments, and multi-round optimization are outside G0.
