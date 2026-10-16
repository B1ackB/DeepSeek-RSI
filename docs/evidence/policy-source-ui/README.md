# Sidebar source evidence

Recorded 2026-10-16 on the pinned Harness with Node 25.8.1. Fixed responses only; paid calls: zero.

- `check.txt`: host/client TypeScript, 83 tests and build.
- `final-client-check.json`: successful final type checks/build after the source-card validation message was made readable.
- `workspace-move-before-fix.txt`: controlled stale-root acceptance before the commit-time registry recheck.
- `browser-result.json`: real sidebar adoption/restore plus source preview, sensitive denial, cancel/conflict, exact sealing and complete old/new tool tasks.
- `restart-result.json`: same-home restart restores previews/sessions and opens the old source with zero new requests.
- `final-browser-result.json`: final build creates another exact source session, runs a complete tool task and preserves all previous bindings.
- `verification.json`: source/binding references, version/runtime, request ownership totals and checked SDK resource cleanup.
- `first-cleanup.json`, `restart-cleanup.json`, `cleanup.json`: all three owned host PIDs absent and ports released. Browsers close in each script's `finally`.
- `sidebar.png`, `sidebar-narrow.png`: final source preview, provenance, limits and exact-source session action.
- `preservation.json`: comparison against all 94 pre-existing dirty files and unchanged repository HEAD/Harness patch.
- `restart-browser.mjs`, `final-browser.mjs`: exact bounded follow-up checks used on the recorded owned home. They contain its path but no authentication link. They are recorded experiment inputs, not idempotent commands to rerun against existing history.

Fresh browser reproduction starts with the isolated fixture setup described in [review evidence](../policy-review/README.md), builds `--policy-review-fixture`, then runs `scripts/browser-policy-review.mjs <new-owned-root> --sources`. Never reset a historical test home to make assertions pass. The raw source/database/events and private auth logs remain under `.cache/policy-source-ui-xdRa88`; no user home or existing database was used. See the [report](../../POLICY-SOURCE-UI-REPORT.md) and [contract](../../POLICY-SNAPSHOT-CONTRACTS.md#sidebar-selection-and-dedicated-sessions).
