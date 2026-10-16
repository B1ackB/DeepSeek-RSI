# Repository policy final code review

Completed 2026-10-16. Scope: exact policy adoption, immutable old-session bindings, explicit restoration and delivery documentation. The package remains `0.0.0-g2.5`, with SQLite 7 and the pinned Harness `0.1.3-alpha.1` commit `d347e703908d0406b7a7ef80e3a0e594d86b2215`. Paid calls: **zero**.

## Resolved findings

| Finding and concrete effect | Minimal correction | Verification |
|---|---|---|
| Restoration reread both policy files. Losing the current candidate also prevented returning to a previously approved, intact baseline from that batch. | Fresh adoption still checks both objects. Restore and session binding from an existing approval check the selected object plus the unchanged original generation/evaluation proof. No original usage, evidence or approval check is bypassed. | Reproduced before the fix. Tests reopen the store with the other file damaged/missing and restore/bind baseline successfully; damaged selected bytes, changed cleanup or unknown usage still reject without changing the active choice. |
| Native API Session resume supplies provider/model without the original output cap. A bound session could reopen, then fail before its first adapter dispatch. | A scoped request hook fills an absent cap from the binding. The final observer continues to reject explicit conflicting caps, routes and tools. | Reproduced before the fix. Native Agent Registry/Loop + JSONL resume uses the original policy after a later adoption and completes three fixed requests/two tools. The test supplies a global default route, then exercises native model selection for the frozen fixture route. |
| A pending confirmation remained in component state when the user selected another workspace. Its hidden payload still targeted the previous workspace. | Key the policy card by workspace so changing workspace clears unconfirmed intent. | The real web profile switches workspaces with a confirmation open; the confirmation disappears, no choice is committed and no model is called. |

The runtime changes are in [store](../src/store.ts), [native policy session integration](../src/policy-review.ts) and [sidebar composition](../src/client/panel.tsx). No dependency, generic optimizer or Harness patch was added.

## Review conclusions

- Adoption binds policy ID, both version digests, exact batch and derived evidence/ledger digest. The controller rechecks object bytes, provenance, full-task evidence, confirmed usage and cleanup. Choice and operation receipt commit together. Conflicting operation reuse, stale revisions and stale choice IDs fail; returning to the same content cannot make an older choice ID current again.
- New dedicated sessions commit their exact choice/batch/conditions binding before Agent provisioning and first prompt assembly. Installation/resume reads that binding rather than the current workspace default. New adoption/restoration never rewrites an old session, including one that has not made its first request.
- Restore targets an earlier explicit approval in the same workspace. An unselected baseline is not implicitly approved. A lost reply, failure before Agent publication or failed workspace attachment can retry the recorded intent. Missing execution history, interrupted/unknown usage and expired budgets never trigger automatic replay or a fresh allowance.
- Candidate policy text cannot change capabilities, budgets, evaluator conditions or active pointers. Complete but incorrect task outcomes remain a visible user decision. Incomplete execution/evidence is not a successful evaluation.

No unresolved blocker was found in these reviewed fixed-response paths. This conclusion does not extend the supported runtime or spending scope.

## Current validation

`PATH="/opt/homebrew/bin:$PATH" npm run check` passed **68 tests**, including **13 policy review/session tests**, both TypeScript checks and builds. The initial 66-test baseline also passed before the new regressions were introduced. The two recovery failures were reproduced first; the new checks passed after the fixes. A final typecheck, browser-script syntax check and `git diff --check` passed.

The real Harness web profile passed confirmation/cancellation, workspace switching, exact adoption, delayed first execution in an old session, two actual snapshot tools feeding the final request, restore for future sessions, reload without replay and wide/narrow sidebar checks. Browser errors: zero. The retained sample has three choices and baseline/candidate/baseline session bindings. Confirmed fixture tokens are generation 13, evaluation 90 and daily 45, for 148 total. Viewing, selection, restoration and session creation made no calls.

[Evidence](evidence/policy-final-review/README.md) records the checks, before-fix reproduction, browser result, exact bindings, accounting and cleanup. The test-owned host exited, its port was released, the browser closed and evaluation-child directories are absent. Debugging data remains in a new `.cache/policy-final-review-*` home.

## Preservation and handoff

The 73 files already dirty at resumption were snapshotted: **61 remain byte-identical, 12 were intentionally extended, none is missing**. Earlier immutable evidence, unrelated work and historical data were preserved. The linked Harness dirty patch is byte-identical. No live provider profile or historical user database was opened, and no commit or external publication was made.

The README, architecture and contracts now describe the enabled sidebar accurately; stale statements that policy adoption was still pending were removed. The [2026-10-15 report](POLICY-REVIEW-REPORT.md) and its original evidence remain identifiable, with this final review linked as a separate increment.

This is still the **fixed-response pilot over frozen source snapshots**. Ordinary chats do not inherit it. Live source capture, paid provider provisioning/budgets and generation/evaluation controls in the sidebar remain separate work. Fixed responses establish lifecycle and boundary behavior, not real-model improvement. The native scoped tool restriction is not an OS sandbox, and the host's narrow center-pane layout remains unchanged. Stop the host and preserve a complete database/object backup before upgrades; hot plugin replacement with active external Agents is unsupported.

## Final delivery verification, 2026-10-16

The later [source capture](POLICY-SNAPSHOT-REPORT.md) and [sidebar source selection](POLICY-SOURCE-UI-REPORT.md) increments are included in this delivery. They supersede the earlier paragraph's pending live-source entry; the fixed provider, spending and evaluation limits remain unchanged.

Before submission, fetched `origin/main` at `6735983` and started `codex/repository-evidence-policy` from it. The prior feature branch was already merged and its tree matched that base. All accumulated implementation and evidence are retained, including the existing Skill waiting/cancellation explanation and structured-error recovery alongside the migration update in their shared test.

- `npm run check` passed **83 tests**, host/client TypeScript checks and the build on Node **25.8.1**, against the pinned Harness commit and unchanged pre-existing right-panel patch.
- A fresh isolated native web profile passed the exact adoption/restoration flow, sensitive selection denial, full preview, cancel/seal conflict, workspace switching and distinct old/new snapshot tasks. Three complete daily tasks used nine fixed-response requests and six tools; generation and paired evaluation retained separate owners. Browser errors were zero. Wide/narrow screenshots were inspected with the existing narrow center-pane limitation retained.
- Stopped and restarted the same profile. All five session bindings were unchanged; opening the earlier snapshot session and previewing its original bytes made **zero new requests**. All 16 retained attempts were succeeded with confirmed synthetic usage: one generation, six evaluation and nine daily requests.
- Both owned host PIDs/ports were released. The recorded evaluation children were absent, their temporary homes removed and browsers closed. The new fixture home and all previous history remain on disk.
- Packaging inspection excludes local homes, databases and dependencies. The original feasibility `check.log` is explicitly included as reviewed historical evidence because its README already links to it; no authenticated logs or URLs are submitted. Relative documentation links, credential-literal scanning and Git whitespace checks pass.

The repository currently has no GitHub Actions workflows or required remote status checks. These are local validation results, not a claim of remote CI or real-model quality. Paid calls remain **zero**. SQLite **6→7** compatibility and stopped-host backup/downgrade requirements are unchanged.

See the separately recorded [delivery evidence](evidence/policy-delivery/README.md). Earlier reports and experiment outputs are preserved.
