# Repository snapshot capture report

Date: 2026-10-16. Scope: explicit read-only real-worktree capture, sensitive exclusions, immutable source sealing and offline execution verification. No paid calls, dependency additions, Harness changes, automatic discovery or UI source-selection changes.

## Delivered

- [Snapshot contract](POLICY-SNAPSHOT-CONTRACTS.md) defines selection, canonical bytes, provenance, failures and recovery before implementation. `src/policy-contracts.ts` reuses the existing file limits and adds one strict repository snapshot plus optional source-bound conditions. `src/policy-snapshot.ts` implements the collector, derived manifest, sealed-object reads and conditions construction.
- Selection accepts an absolute checkout root and 1–32 exact relative files. It sorts the manifest and captures current bytes, including selected tracked edits, untracked and ignored text. It does not execute Git, project code or filters. No staging, reset, checkout, source-content or source-mode changes occur.
- Before opening selected files, reject sensitive paths and unsupported path syntax. Reads reject symlinks, hard links, special files, invalid UTF-8/NUL, files above 256 KiB and selections above 1 MiB. Root spelling is normalized before checking its final component, including trailing-slash/dot aliases. Ancestry, file identity, size and nanosecond change/modification metadata are checked around bounded reads, then all selected files are reread. A content guard rejects common private keys, token formats, quoted credentials, unquoted configuration assignments and URL userinfo; rejected bytes are never put in errors or a usable snapshot.
- Source objects reuse policy version publication with the same non-replacing staging/link/flush path. Its bounded canonical JSON functions now serve both actual object types. Snapshot objects allow bounded JSON escaping overhead while retaining the existing 1 MiB raw content cap. Invalid JSON diagnostics omit raw bytes. Publication never overwrites a conflicting target.
- `sourceSnapshot: {root, digest}` is validated against the exact sorted frozen files and included in `conditionsDigest`. Runtime tools continue reading in-memory source only. They gain no host path capability. Changing or deleting the original checkout cannot change a frozen run.
- `npm run policy:snapshot -- /absolute/checkout exact/file ...` stores a unique owned local capture under `.cache/policy-snapshot-<id>`. Optional `--verify` uses one existing native SDK child with the offline adapter, search, first-file read, continuation and fixed final response. Capture failure writes a failure receipt without a snapshot or model request. Verification failure retains the sealed snapshot and available error/evidence; cleanup failures preserve and name the owned child home for inspection.

## Validation performed

`npm run check` passed both TypeScript checks, **76 tests** and the build. `git diff --check` passed. Native checks used Node 25.8.1 and the unchanged pinned Harness commit `d347e703908d0406b7a7ef80e3a0e594d86b2215`. Eight new tests cover:

1. A real initialized Git checkout with committed bytes, tracked edits, untracked and explicitly selected ignored content. Index bytes and status stay unchanged. BOM/CRLF and raw content hashes are preserved. Later source/caller-object mutation cannot rewrite the sealed object.
2. Sensitive paths fail the complete selection before any selected file opens. Common secret literals fail without exposing their bytes; environment-variable references remain usable.
3. Invalid path/root aliases, directory/symlink/hardlink/FIFO inputs, invalid text, duplicate paths and file/count/total limits fail closed. Linked-worktree `.git` files are accepted without reading/following their contents.
4. Mid-file and between-file changes are rejected. Cancellation closes the acquired descriptor; fresh capture succeeds afterward without partial source objects.
5. Read-only/canonical/digest checks, conflicting existing targets, symlink object storage and expanded JSON bounds. Failed publication removes its own stage without replacing an existing target.
6. Abrupt process loss immediately before and after publication. A retry validates the complete object, preserves unknown staging bytes and never infers execution authority or deletes history.
7. Exact conditions/provenance binding, the original first-gate conditions/digest, and reopening old/new v7 batch rows byte-for-byte. Existing v6 migration/recovery tests also pass in the full suite; SQLite remains 7 with no new table or migration.
8. Full native search/read/continuation after deleting the source checkout. Out-of-manifest reads are denied. Three confirmed synthetic attempts have one persisted batch owner; 45 synthetic tokens are counted. Native Agent disposal, PID exit and temporary-home removal are verified.

The final code review also checked trailing-slash symlink roots and redacted malformed-object diagnostics. Existing exact-adoption, workspace conflicts, old-session native resume, restore, unknown usage, interruption, accounting and cleanup tests all remain green. No browser UI code changed in this increment; no new visual acceptance is claimed.

## Actual checkout evidence

The command captured this dirty checkout's `src/client/model.ts` (tracked modified) and `src/policy.ts` (untracked), totaling **8008 bytes**. The selected bytes still matched their manifest hashes after execution. Snapshot digest: `cf1843d08b0d925cacd0914375e6b7e390565bb7eea1f79fca706d3f7ff7f21f`.

Offline verification completed **3 requests, 2 real tool calls/results and 45 synthetic tokens**, with confirmed usage, no ambient credentials or forbidden execution, zero remaining Agents, absent worker PID and removed child directory. Full local snapshot/worker evidence remains under `.cache/policy-snapshot-7klzG8`; a bounded summary is in [verification.json](evidence/policy-snapshot/verification.json).

A separate actual-checkout selection containing `.env` failed before capture/publication and dispatched no model request. The owned failure receipt remains under `.cache/policy-snapshot-W9TvuC`. Earlier command outputs and all pre-existing caches/evidence were retained. See [evidence index](evidence/policy-snapshot/README.md) for checks and preservation records.

## Compatibility and remaining boundaries

Historical conditions without `sourceSnapshot` keep their parsed bytes and digest; existing policy choices and session bindings keep the original batch source. No existing database was opened by the capture command, and no existing history or source object was rewritten. Older strict binaries may reject new source-bound rows; binary downgrade requires the complete stopped-host backup, rather than deleting new fields. Include `repository-snapshots` alongside the existing database/policy/history backup when using this entry.

Capture is checked file collection, not an atomic filesystem snapshot or protection against a hostile process racing host reads. Keep writers quiescent for reproducible collection. Secret guards are conservative and incomplete; they can reject safe examples and cannot detect every hidden credential. No claim of arbitrary-repository answer correctness or real-model improvement follows from scripted responses.

Still deferred: sidebar source selection/confirmation, new externally frozen repository evaluation questions/answers and their adoption contract, paid credentials/routes, and real-model spending authorization. Keep these separate from capture. This increment adds no generic optimizer or snapshot framework.
