# G2 Preparation: Frontend Design Validation

[Documentation](README.md) · [Contracts](G2-CONTRACTS.md) · [Development rules](../AGENTS.md)

Historical report dated 2026-09-08, covering g2.0 preparation, g2.1 enrollment, and g2.2 unloaded-session checks. g2.3 later added combined confirmation, generation/checks, adoption, and dispatch; see [MAINFLOW-REPORT.md](MAINFLOW-REPORT.md). These preparation tests do not establish complete G2 isolation or an RSI cycle. No new real model calls occurred here.

## g2.1 / g2.2: Enrollment before work

Implemented ordinary input → native RSI question → enroll/decline → continue. Manual registration is unnecessary; advanced forms default collapsed. The user confirmed task scope, continuous same-session reuse, and reconfirmation after a new session/manual end. One Skill is selected; enrollment does not permit rewriting/adoption.

- src/onboarding.ts uses agent/pre-step, tools/pre-execute, and userQuestions. Explicit frontend Skills or local request matches pause before the first call. Mid-run selection pauses only before Skill loading.
- tests/onboarding.test.ts exercised the real Agent Loop: no dispatch before confirmation, selected-Skill injection, task-only observation, no repeat during continuous edits, repeat after end, decline without observation, cancellation without permission, and pre-load questions. Ten total tests and host/client types passed.
- scripts/browser-onboarding.mjs used native input/questions to verify enrollment, continued editing, end/reask, and decline/continue. Four fixture calls including ordinary/auxiliary work, zero paid calls, no page errors.
- SQLite 3 → 4 copy migration preserved three preferences, one frozen task, one analysis, one draft, and byte-equivalent ledger/receipt rows. Only empty enrollments were added; the real database was not changed during this copy test.

Evidence: `.cache/onboarding-evidence/result.json`, question.png, included.png, migration.json. The user subsequently authorized stopping port 3080, backing up, upgrading, checking, and shutting down. Backup `.cache/g0.before-g2-onboarding.sqlite` held 102 requests, two analyses, and one frontend task.

g2.1 installation exposed a G1 bug: checking only loaded sessions incorrectly reported workspace conflicts for old unloaded sessions. g2.2 uses sessionPersistence.stat to verify persistent headers without changing ownership/history. Regression checks cover loaded, unloaded, mismatched, and missing sessions. The first install-check script also assumed flattened frontend fields; it was corrected to business.frontend. These failures were not passes.

Final g2.2 installation passed ten tests, host/client types, build, and packaging. Read-only browser verification on the actual profile found the task card, collapsed advanced settings, discoverable frontend Skill, and correct unloaded-session ownership. Two old test workspaces were removed from the native registry; workspace_missing remained correct without recreating them or deleting RSI history.

After shutdown, SQLite 4 retained 102 requests, two analyses, one frontend task, and identical old state/ledger/bindings/receipts. Business added only empty enrollments; three Skills matched sealed hashes. Evidence: installed.json, installed.png, installed-migration.json in the same evidence directory.

Cleanup verified the authorized user PID 85387/3080 and test PIDs 86295, 89229, 89595/ports 62405, 63434, 64086 were stopped; ports/database handles released, browsers closed in finally. No Docker or paid calls. See cleanup.json. The host remained stopped; current startup instructions are in the [README](README.md#installation-upgrades-and-data).

## g2.0 implementation

- fixtures/frontend/v0/SKILL.md: neutral design procedure, confirmed context, required function/accessibility, verified delivery; no embedded personal style or answers. Originally enrolled manually.
- src/frontend-contracts.ts / frontend.ts: six dimensions, two batches of at most three questions, task/project/personal scopes, frozen snapshot/digest. Silence is not consent. Preferences can be inspected/edited/disabled/removed; task overrides do not change memory.
- src/client/frontend.tsx / panel.tsx: preparation/questions/forms, context copy, analysis preview, separate usage.
- src/g1.ts: shared source checks, revisions, receipts, one-analysis flow. Direct design analysis has opportunityId=null rather than fictional observation evidence. Preparation/preview makes no calls; dependent running analysis prevents closure, and closed previews cannot start.
- src/store.ts: transactional SQLite 2 → 3 validation/addition, rollback on corrupt records, no deleted history/budget reset.

## g2.0 validation

| Check | Result and scope |
|---|---|
| Strict host/client types | Passed against pinned native Harness types |
| Node tests | Nine passed, including scopes, question caps, skip/no preference, overrides, freezing, rollback; integration added direct design analysis, cancel, stale links, restart |
| Isolated browser | Discovery, two question batches, three scopes, frozen snapshots after edits, preview, fixture analysis, draft, reload passed |
| Usage | One fixture call, 130 tokens, zero paid calls, no browser errors |
| Database copy | All 82 request rows, six G0/eight G1 receipts, and two historical analyses retained; only specified empty design/frontend fields added |
| Installed startup | g2.0 installed in the real development Web profile; browser saw preparation, 82-row ledger, no model calls; stopped database verified version 3 and identical old rows |
| Docs/package | 77 local links in 12 documents passed; build/npm pack included initial Skill/docs, excluded caches/test helpers. Local installation evidence was appended to the repository report |

The first browser run timed out on an exact dropdown-label match before analysis. Correcting the selector and using a fresh profile passed; the failure was retained.

Local evidence: `.cache/frontend-evidence/` result.json, questions.png, confirmed.png, failure.png, migration.json. Backup: `.cache/g0.before-g2-prep.sqlite`; migration copy: `.cache/frontend-migration.sqlite`. These private local artifacts are excluded from Git/packages; repeatable source remains in tests/scripts.

Install/cleanup evidence: installed.json and cleanup.json. Test PIDs 84110, 84810, 85149 exited; ports 59914, 60211, 60781 released; browsers closed in finally. No Docker or termination of existing user services. See current [installation instructions](README.md#installation-upgrades-and-data).

## Historical limits and next step

Fixed questions required explicit preparation and missing dimensions. There was no arbitrary chat/screenshot/page-condition understanding or personalized model questioning. Context had to be copied into ordinary tasks, not injected. Fictional landing pages with native HTML/CSS/JavaScript and no online assets remained an unconfirmed implementation assumption.

The next historical step was to freeze candidate paths, artifacts/checks, Docker/resources/tools, then implement authorized generation/sealing/cleanup. This preparation stage produced no candidate or page-effect/performance improvement evidence. Real generation required separate scope/budget confirmation.
