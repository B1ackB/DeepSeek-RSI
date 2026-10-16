# Repository Policy Persistence and Accounting Gate

Date: 2026-10-15. Scope: sealed repository-evidence-policy versions, additive SQLite 6→7 migration, policy/batch ownership, uncertain usage and interruption recovery. No paid provider route, new dependency, generation UI, quality evaluator, adoption pointer or general evolution framework was added.

[Documentation](README.md) · [Executable contract](POLICY-CONTRACTS.md) · [Previous execution gate](POLICY-REPORT.md) · [Saved evidence](evidence/policy-persistence/README.md)

## Implemented

- `src/policy-versions.ts` seals canonical UTF-8 JSON with the existing policy SHA-256 identity. It publishes a flushed read-only file without replacing existing content. Runtime reads verify file type, permissions, bounded size, canonical bytes and digest; symlinks and missing/corrupt content fail closed. `store.sealPolicyVersion` records immutable same-policy parent provenance and supports exact idempotent repetition.
- `src/store.ts` appends `policy_versions` and `policy_batches` in the SQLite migration transaction. It validates old rows before upgrading. The proposed extra business-JSON section was unnecessary: separate concrete tables preserve serialized v6 rows and avoid creating unused adoption state.
- Batch authorization freezes policy ID, exact versions/runs, matching conditions, runtime digest and cumulative budget. Host timestamps, progress and revision track execution. Identical repeated authorization returns current state, including interruptions; conflicting IDs and reused run/session spending identities fail.
- `src/usage.ts` resolves registered policy runs before daily/probe ownership. Each attempt retains the existing schema: RSI owner is the batch, session is the run, and purpose follows baseline/evaluation. The batch provides policy/version identity. `reserve` rechecks active authorization, sealed bytes, both budgets and time windows before dispatch. Policy limits do not modify old Skill limits.
- Policy-wide and optional batch-specific accounting retains unknown totals as null and reports a separate confirmed subtotal. Partial, missing, contradictory and in-flight usage cannot authorize another dispatch. A diagnostic numeric total is not upgraded to confirmed on restart. Not-sent reservations retain their slot without fabricated usage.
- Startup interrupts unfinished batches/runs and reserved/in-flight attempts without replay, budget reset or deadline extension. Prior terminal outcomes remain. Trusted late usage settlement can update totals without changing terminal outcomes or reactivating a batch.
- The existing native SDK fixture now seals/registers its policy, starts a one-run batch, records batch-owned requests and derives execution outcome from the native turn-end event. The adapter still independently demands a durable in-flight attempt before dispatch. Forced process loss exercises both attempt and batch recovery.

## Validation

Run with the installed Harness native dependencies and Node 25.8.1:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:fixture
```

The full check passes host/client TypeScript checks, **35 tests**, and the plugin build. Eleven new persistence checks cover explicit populated-v6 tables, raw historical-row/artifact preservation, transactional migration rollback, sealed-object rejection and lineage, immutable batch authorization, both-side cumulative request/token limits, policy and batch totals, missing/partial/conflicting usage, cancellation, persistent deadlines/backward clocks and repeatable restart recovery. Existing Skill migration, authorization, accounting, version and comparison tests remain included.

Seven native SDK tests exercise 15 owned child processes. They include baseline/candidate/restored independent tasks, trusted search/read results reaching continuation, forbidden capabilities/paths, route/input/request/token limits, unknown usage, provider errors, partial streams, forced exit, cancellation and timeout. The standalone successful run has three requests, two tool results and 45 synthetic tokens, all under its batch owner. Its version/batch/runtime identity and cleanup evidence are saved separately from the previous gate.

Historical data checks use a hand-built v6 layout populated with serialized state, ledger rows, session/Skill binding, both operation receipts, a managed Skill, preferences/session references and an immutable Skill file. Every old row and file byte remains identical through migration and a second open. Invalid ledger JSON rolls back the new tables and leaves `user_version=6`. Existing v4/v5 tests still verify their compatibility defaults and retained authorization/usage. None of these checks opens or migrates an actual user database.

## Preservation and limits

Existing waiting/cancellation changes, package metadata and earlier immutable evidence are retained. Only the old migration test's expected current schema changes from 6 to 7. No historical data, live profile, existing service, paid model or credential configuration is touched. The linked Harness remains pinned to `d347e703908d0406b7a7ef80e3a0e594d86b2215`; its pre-existing right-panel modifications are retained.

The filesystem object publication and database commit are separate. An interrupted seal may leave an unreferenced object/staging file; it has no registered execution authority, and this gate does not remove it automatically. Missing or changed registered objects block later execution. Upgrade/downgrade requires a complete stopped-host backup; no lossy reverse migration is provided.

Native children currently each use a fresh home/store and a single batch entry. Two-side cumulative admission/accounting is verified using fixed streams in one durable store; this does not establish an end-to-end paired-child controller or real-model improvement. Batch `completed` means native execution/ledger completion, with process cleanup checked separately by the parent. Neither status alone grants adoption. Fixed quality evaluation, retained batch-level trace/artifact validation and user version choice/restore remain subsequent work.
