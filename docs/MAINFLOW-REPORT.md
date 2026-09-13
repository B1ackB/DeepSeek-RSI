# Preference-Driven Main Flow: Implementation and Validation

[Documentation](README.md) · [Contracts](G2-CONTRACTS.md)

2026-09-08, version `0.0.0-g2.3`. The user authorized the documented flow. No new paid call or upgrade of the running user profile occurred in this stage.

## Implemented

Ordinary frontend requests or explicit `/rsi-frontend-design` pause before the first page-model request. One sidebar card shows complete requirements/constraints, natural-language preferences, scope, editable files, full input/checks, and model/budget. Submission creates durable revision authorization without an observation signal or advice-only analysis.

The separate model returns structured candidate, clarification, or unchanged, without host tools. The host checks complete files, allowed paths, and metadata, retains unchanged files, seals the candidate, and records checks/usage. Clarification is limited to two batches of three questions, sharing the original deadline and maximum three calls. No automatic retry.

Review shows full diffs, reason, checks, candidate digest (historical UI), and costs. Exact adoption is separate. Rejection, unchanged, failure, unknown usage, or exhaustion waits for baseline/stop choice, without automatic fallback. Source directories remain unchanged. Task adoption does not change defaults; project/personal preference scopes update the active Skill only for the current workspace, while personal preferences may be inherited elsewhere.

Before the first page request, replace pending same-name Skill expansion and bind text/scripts/resources to one sealed digest. Previously different-version sessions get a deterministic linked session with the daily route, workspace, and confirmed requirements/preferences, not old model history. Original bindings remain; sidebar navigation opens the linked session.

SQLite 5 adds empty mainflow to earlier state without invented authorization or altered ledgers/receipts. Restart fails incomplete work while preserving authorization, responses, candidates, and costs. Review survives. Chosen-but-undispatched work requires a user recovery action. Deterministic IDs, persistent delivery markers, and history checks prevent duplicate creation/admitted-task replay.

## Validation

- Strict host/client types, all 13 Node tests, build, and local packaging passed.
- Native Harness Agent Loop tests covered zero calls before confirmation, direct preference generation, duplicate confirmation/answers, budgets, unknown usage, no page request before adoption, old expansion removal, identical text/resource binding, linked sessions, retained old binding, and cancellation without authorization.
- File checks covered out-of-scope/duplicate paths, emptiness, metadata corruption, no actual change, persisted-input/manifest mismatch, unchanged files, cancellation, and temporary-directory cleanup.
- Storage checks covered interruption/unknown cost, blocked further requests, SQLite 4 → 5 row preservation/defaults, and migration rollback for corrupt state.
- Isolated headless Chrome/fixed adapter passed composer → combined card → candidate → complete diff → reload without replay → adoption → dispatch → second linked session/navigation. Five fixture calls including host auxiliary calls, zero paid calls, no page errors. Evidence: `.cache/mainflow-evidence/`.
- Script checks failed closed when Docker could not start, with no host execution or retained candidate staging. OrbStack was stopped; this was not a real successful Docker execution test.

Reproduction: npm run typecheck, npm test, npm run build. Browser helpers use `node scripts/build.mjs --g1-fixture`, an isolated profile with real DeepSeek disabled, and `node scripts/browser-mainflow.mjs <host-log>`. Never load the fixture into production.

## Boundaries

UTF-8 Skill packages: at most 32 files and 64 KiB complete model input. Oversize/suspected credentials stop explicitly, not by truncated overwrite. No creation/deletion/executable-bit changes; authorized existing Python/Shell/templates may be replaced.

Fixed checks cover paths, integrity, nonempty files, original metadata, and Docker Python AST/Shell -n. Scripts are not executed and candidates cannot self-certify checks. Other templates receive integrity checks only. Historical page function/aesthetics/efficiency were explicitly unevaluated.

No real generation, product output comparison, complete isolation attack-surface acceptance, multi-round search, or source overwrite occurred. This is not all of G2–G4. New real trials need their own confirmed model/input/budget.

Existing enrollments stay observation-only and continue under old choices. After observation ends, new frontend tasks enter the main flow. A Skill chosen mid-run still uses native observation confirmation; earlier model cost cannot be ruled out. Old G1 observations cannot establish a new sealed version's effectiveness.

Cleanup verified: PIDs 96650/97865, ports 54166/54484 exited/released; browsers closed in finally. No Docker started; the existing 3080 service remained untouched. Evidence: `.cache/mainflow-evidence/cleanup.json`. Initial listening-permission/port conflicts were resolved with an authorized free local port; failed starts were not counted as passes.
