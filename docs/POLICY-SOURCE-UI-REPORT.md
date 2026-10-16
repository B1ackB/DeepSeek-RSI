# Sidebar source selection and snapshot sessions

Date: 2026-10-16. Delivered under the [snapshot contract](POLICY-SNAPSHOT-CONTRACTS.md#sidebar-selection-and-dedicated-sessions). Fixed responses only; no paid calls, new dependency, new optimization object or Harness patch.

## User flow and authority

The existing policy sidebar now accepts exact relative paths in a multiline field under an already registered workspace. It uses the same capture limits and sensitive-path/content guards as the developer collector. No arbitrary root/content field, recursive browser, automatic scan or file upload is added.

1. **Preview selected files.** The host checks the current choice/revision and workspace, captures the exact files and checks state again after asynchronous reads. Persist a full preview with its complete conditions. Display canonical workspace, exact policy choice, byte counts, all source text and fixed execution limits. Polling snapshots contain metadata/manifests; a scoped read endpoint fetches one body. This is free and grants no execution authority.
2. **Explicitly seal the preview.** A confirmation group supports confirm/cancel. Confirm binds exact source ID/digest, choice and revision, recaptures all selected files and requires the same bytes. Recheck the registered workspace path before commit. Changes require a new preview. Publish the reviewed immutable object, then update seal state and the existing operation receipt transactionally. Cancel makes no host mutation.
3. **Create a session from this snapshot.** A separate button confirms the exact sealed source/current policy choice. The host verifies source and original approval evidence, commits the session binding/receipt, then provisions/attaches the native Agent. Creation does not dispatch. The first user message uses the fixed route, existing cumulative limits, bounded tools and daily ledger.

The previous evaluated-sample session button remains compatible. Ordinary chats do not acquire this policy or source. Adopting/restoring another policy or sealing another source never changes an existing session, including a session that has not made its first request.

## Implementation and compatibility

- `src/policy-inputs.ts` is the browser-safe executable definition of file/route/limit structures and guards, extracted for the actual second consumer. UTF-8 byte checks/order use native Web APIs. `src/policy-contracts.ts` retains host SHA-256 validation. Historical parsed file/conditions bytes and digests remain unchanged.
- `src/policy-review-contracts.ts` owns the three commands, preview/seal row, metadata projection and optional session `sourceId`. `src/policy-review.ts` performs checked/cancellable capture and drains owned work on disposal. `src/store.ts` validates and persists proofs. `src/client/policy.tsx` reuses the card and existing command model; workspace remount clears bodies and pending confirmation.
- `policy_sources` is appended within unreleased SQLite **7**. Preview rows hold complete frozen conditions, original choice/workspace, creation time, status, nullable seal time and exact seal receipt ID. Sealed rows are immutable. Source-backed sessions store an optional source ID plus their exact conditions digest. Old bindings omit the new field and resolve their original batch snapshot.
- Startup verifies source origin, paths, complete conditions, seal receipt and session intent against their exact choice/workspace. Corruption fails without clearing/rebuilding history. A missing/corrupt selected object fails creation/resume/dispatch, including requests from an Agent whose tools were already installed. There is no live-file, latest-snapshot or sample fallback.
- File publication and SQLite commit remain separate. Failed commit can leave a complete unreferenced object; the preview and failed evidence remain recoverable and that object alone grants no session authority. Retry verifies it without replacement. Lost successful replies return the exact receipt without rereading deleted worktree files. A committed session with failed native attachment can be opened/retried with the same ID and Agent.

Back up the stopped host's database, policy objects, repository-snapshot objects, sessions and other RSI artifacts together. Old strict binaries may reject new rows; downgrade from the complete backup, without stripping source fields or deleting history. No existing business JSON or terminal historical rows are rewritten.

## Validation

`npm run check` passed both TypeScript checks, **83 tests** and build. `git diff --check` passed. Seven new checks cover:

- Free preview, full exact text, metadata-only polling, complete sensitive selection rejection, scoped preview reads, no client-supplied root, no session from an unsealed preview, and zero requests before explicit dispatch.
- Worktree/digest/active-choice/global-revision/workspace conflicts. Source changes cannot silently replace reviewed bytes.
- Old unused sessions through later snapshots, restart and later worktree mutation/deletion; both sides run full native search/read/continuation with distinct frozen text and daily ownership.
- Async state/native-workspace changes before commit, cancellation on disposal and acquired-descriptor cleanup.
- Publication followed by transaction rollback, successful retry using the original object, lost reply after source deletion, and attachment failure recovering the exact committed session without another Agent or request.
- Process loss immediately after session-intent commit; exact restart recovery; absent/corrupt objects and denial before adapter dispatch for an already installed Agent.
- Legacy session field/row preservation, unchanged old/new v7 raw rows after reopening, and corrupt choice/content/seal provenance failing startup without clearing even the invalid row.

Final review found a real concurrency gap: an asynchronously captured workspace could be moved by the native registry before the controller committed. A controlled regression first reproduced acceptance of that stale root. The final path is frozen before reads and rechecked against the registry before commit. Its regression and the full suite pass. The [before-fix result](evidence/policy-source-ui/workspace-move-before-fix.txt) is retained.

## Browser and restart evidence

The real Harness web sidebar ran in a fresh owned home with the real provider disabled and the fixture adapter installed. Node **25.8.1**, Harness commit `d347e703908d0406b7a7ef80e3a0e594d86b2215`; its pre-existing right-panel diff is unchanged.

`scripts/browser-policy-review.mjs <new-owned-root> --sources` covers the prior exact-adoption/restore workflow plus sensitive selection denial, full preview, cancel, recapture conflict, workspace switch, exact sealing and old/new source-bound complete tasks. The two new source sessions bind before their first requests and read their respective frozen strings despite subsequent worktree changes. Reload does not replay requests.

The same home was stopped and restarted. All source/session records remained available; opening the older source session and viewing its earlier snapshot made **zero model requests**. A final restart using the final concurrency fix also completed a fresh preview → seal → session → full tool task. The previous five bindings remained identical.

The retained home contains **4 source records** (one unsealed, three sealed), **6 sessions**, **12 daily fixed-response requests** and **180 synthetic daily tokens**. The initial proposer/evaluation fixture adds 7 attempts/103 synthetic tokens, for 19 recorded attempts/283 synthetic tokens total in this home. All usage is confirmed. These are separate owners; daily calls do not enter the evaluation batch. No number is a paid model measurement.

The browser reported no page errors. The sidebar was visually inspected at 1440 and 760 px; its content remains usable. The existing Harness center pane is compressed at 760 px, so this is not full mobile-layout acceptance. Three owned host PIDs/ports and the initial SDK child resources were closed and checked absent; browsers closed in `finally`. The owned home remains at `.cache/policy-source-ui-xdRa88`, including database, objects, raw traces and private authenticated logs. Those logs are not copied into public evidence.

See [bounded evidence](evidence/policy-source-ui/README.md), [final sidebar screenshot](evidence/policy-source-ui/sidebar.png) and [verification summary](evidence/policy-source-ui/verification.json).

## Limits and next boundary

File selection is explicit text paths, not a file-tree picker. Capture limits do not enlarge tool/output/input/time limits: the preview freezes and displays the approved batch's existing fixed-route limits. A selected file/result may exceed execution limits and must fail visibly. The fixed adapter checks source transport and full tool execution, not arbitrary-repository factual quality or policy improvement.

Capture remains checked multi-file collection rather than an atomic filesystem snapshot or a defense against hostile host races. Sensitive guards are conservative and incomplete. Real-repository answer evaluation, paid credentials/routes and spending authorization remain separate future work. No generic optimizer, snapshot framework or automatic adoption was introduced.
