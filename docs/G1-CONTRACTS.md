# G1 Integration and Business Contracts

[Documentation](README.md) · [Development rules](../AGENTS.md)

Historical status, 2026-09-08: G1 implementation was authorized, including the sidebar and Low analysis default. Enrollment and draft-only behavior without evaluation were initially proposed defaults; the later confirmation below records the user's decision. G1 does not generate candidates, activate versions, or overwrite sources.

## Main-page sidebar

- Harness exposes an appendable root-scoped panel slot. RSI registers a stable ID/label; native tool details remain owned/rendered by their original plugin.
- Desktop defaults to RSI expanded when no preference exists. Restore the user's expand/collapse choice for the same browser entry. The panel works without a selected session and labels that usage state explicitly.
- RSI and tool details share the right region through tabs. Clicking a chat tool entry retains native selection behavior. Switching tabs does not cancel RSI work.
- Unregistering RSI restores native details behavior; missing tabs cannot remain as empty visible panels.
- Browser panel preferences are display state, not analysis/edit/adoption permission. Invalid/unavailable storage falls back to initial display rules without changing host state.
- Daily and selected-RSI tokens come from the host ledger. Disconnection retains the last snapshot/time and disables freshness-dependent writes. Reconnect reads a complete snapshot rather than summing arrivals.

## Gate validation

The G0 follow-up measured fixed adapter → production accounting → real RPC → browser rendering; see [G0-REPORT.md](G0-REPORT.md). G1 additionally checks default expansion, restored collapse, no-session entry, coexistence, and uninstall. Business checks cover no model calls without analysis confirmation, no edits without authorization, deduplication, stale-state rejection, cancellation, and retained evidence after restart.

## Business fields and boundaries

`src/g1-contracts.ts` is authoritative. UUID/time/version/unknown-usage rules follow [CONTRACTS.md](CONTRACTS.md).

| Object | Meaning |
|---|---|
| ManagedSkill | Host UUID/revision, Harness name/provider, registered workspace, optional enrollment session scope, complete source snapshot, sealed directory, observation switch, source state/reason, creation time |
| Opportunity | UUID, Skill/version, mechanical rule, evidence, deduplication key, open/snoozed/ignored, snooze deadline, first/last time, revision |
| Evidence | Native Session ID, event seq, time, signal kind, bounded summary; observed behavior does not prove Skill causation |
| Analysis | UUID, opportunity and Skill/version, frozen input/system and joint digest, selected budget, prepared/running/succeeded/failed/cancelled/interrupted, timestamps/deadline, result or error |
| Direction | Objective, title, rationale, proposed relative paths, required and optional information; validated model suggestion, not host approval/score |
| AuthorizationDraft | UUID/revision, analysis/direction, Skill/version, reviewed paths and required/optional information, proposed budget, draft/revoked, creation time; never authorized without a formal evaluation contract |

Only registered workspace IDs are accepted. Resolve directory Skills from the current Harness provider; Web input cannot name arbitrary disk paths. Enrollment seals a read-only copy and digest without editing sources or registering a new daily active version. Changed hashes/providers or unreadable directories pause related analysis/authorization. G1 does not silently rebase; preserve history and recheck sources. Reject symlinks and nonregular files. Initial limits: 32 files, 256 KiB per file, 1 MiB total. Fail explicitly rather than truncate a supposedly complete Skill.

Observe only events after enrollment. Script failures, repeated reads, large output, retry clusters, and explicit brevity/cost requests are signals, not calibrated quality scores. Create opportunities only with verified workspace and loaded Skill version. Retain ambiguity diagnostics for multiple Skills. Merge the same version/rule into one card, deduplicate event references, retain at most 12 bounded summaries, and preserve ignore/snooze choices. Thresholds are host configuration.

Prepare a visible bounded analysis input, removing obvious credential fields. Only confirmation of its exact digest and budget enters running. Use one tool-free text request on the configured host route, with no retry. Require complete JSON and in-scope paths; malformed/truncated output records failure and usage without a repair call. Before dispatch, transactionally check state, route, request count, unknown usage, and deadline. G0's cancelled budget cannot become G1's budget.

Closing the browser does not cancel a confirmed analysis. Cancel/timeout aborts first, then retains known usage/errors. Restart marks running as interrupted without replay; prepared previews can be rechecked and confirmed. New analyses do not rebind older analyses/drafts. Revocation preserves history. Without evaluation configuration, formal authorization returns `evaluation_unavailable` and never reaches candidate execution.

Commands carry schemaVersion, operationId, expectedRevision, kind, payload. A separate business revision prevents token pushes from expiring forms. Same ID/content returns the original receipt without dispatch; changed content fails. State and receipt commit together. SQLite 2 adds G1 state/receipt tables while retaining G0 state, requests, and budgets. Unknown data fails rather than triggering deletion/recreation.

## Initial limits and compatibility

Single-machine synchronous SQLite stores at most 64 Skills, 512 opportunities, 256 analyses, 256 drafts, and 1000 attributed sessions. Capacity failure retains existing data. Inspect only the last 2000 events per segment; record incomplete observation beyond that. Multiple loaded Skills use conservative attribution, not a root-cause claim. Snoozed cards retain evidence and return on the next matching signal after expiry.

Default analysis: DeepSeek-V4-Flash / Low, 1 request, 4096 output tokens including reasoning, 32 KiB visible input, 5 minutes, no retries. Check the route/configuration both when preparing and dispatching; budgets cannot exceed host limits. Historical High records retain their actual budgets/usage. After switching to Low, old High previews must be prepared and confirmed again. Display each record's actual route, not today's default. This compatibility change does not change database version or clear records.

On 2026-09-08 the user confirmed these defaults and separately authorized one real Low acceptance call with the same caps, using only a dedicated test Skill and fixed brevity request. That batch cannot be replayed after consumption. Draft defaults of 24 requests and a 100000-token threshold are adjustable proposals, not permission to spend. Observation/analysis caps can be lowered in plugin configuration. A changed source remains historical; observation may resume after verifying the original version. New-baseline management belongs to the version Gate.

G0 binaries supporting only SQLite 1 cannot read G1's version 2. Stop the host and back up before upgrading; use the backup or another test directory to roll back. Development-only fixture recreation is restricted to isolated test directories, not published historical data.

Later frontend preparation upgrades to SQLite 3 and adds null design links to historical analyses. See [G2-CONTRACTS.md](G2-CONTRACTS.md); G1's original budgets and validation semantics remain historical.
