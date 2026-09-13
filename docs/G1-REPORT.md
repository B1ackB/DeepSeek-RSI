# G1 Implementation and Validation

[Documentation](README.md) · [Development rules](../AGENTS.md)

Date: 2026-09-08. Historical G1 authorization included necessary G0 follow-up. Development used ponytail full, tabs, and existing dependencies.

## Implemented

- Root-scoped main-page RSI tab, desktop default expansion, restored display preference, no-session access, native tool-detail coexistence, and uninstall fallback. The separate patch is `patches/harness-right-panel.patch`, based on Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`.
- Directory Skill enrollment, complete manifest/digest, read-only sealing, and provider/scope/workspace/source revalidation without source edits.
- Mechanical signals, deduplication, ignore/snooze. One tool-free analysis only after exact preview/budget confirmation, without retries.
- Runtime validation of model directions/paths, drafts and revocation. Missing formal evaluation blocks authorization, candidate generation, and activation.
- SQLite 2 incremental migration, persistent state/receipts/usage, disjoint daily/RSI accounting, no budget recovery or replay after cancellation/restart.

## Validation

- G0 usage-to-Chrome screenshot upper bounds: 137/76/86 ms, all under one second with zero external API calls; not online-provider latency guarantees.
- Host/client types, build, and seven integration/state tests passed. Native Cordis, registries, Session events, and LLM middleware with a fixed adapter covered zero-call confirmation boundaries, deduplication/ignore, stale commands, exact input, idempotent dispatch, path boundaries, draft versus authorization, invalid JSON, cancellation, changed sources, unknown usage, restart.
- Harness GUI: 290 files, 4017 tests passed, one preexisting skip. Full build/localization checks passed. Official browser replay: 92 files passed, one skipped, one failed on feedback-throughput timing. That unchanged file then passed all four tests alone. A shared-layout close-style regression was fixed; eight native lifecycle tests passed. Replays used TZ=Asia/Shanghai; fixtures/expected output were unchanged.
- Isolated Chrome completed no-session entry → collapse/reload → enrollment → native event opportunity → zero-call preview → confirmed analysis → 130 fixture RSI tokens → unauthorized draft. No page errors or external requests. Evidence: `.cache/g1-evidence/result.json`, main.png, draft.png.

## Real High call and limits

One separately authorized DeepSeek-V4-Flash / High request used 2060 visible input bytes and about 34.5 seconds: input 658, output 4096 (all reasoning), total 4754 tokens. It hit the output cap and failed analysis with no complete direction, draft, or retry. This verifies real-provider/package/ledger/browser accounting, not successful analysis; the Low follow-up supplies that evidence.

Neither a successful analysis nor a fixture proves accuracy, Skill improvement, or savings. Formal datasets, candidate execution/evaluation/adoption/rollback and remote Linux were later work. Enrollment/draft-only defaults were initially pending user confirmation; see [G1 contracts](G1-CONTRACTS.md) for limits and the later decision.

## Low follow-up

The user confirmed Low as default and separately authorized one real call: 4096 output tokens including reasoning, 32 KiB input, five minutes, no retry. g1.2 checked route/budget at prepare/start, displayed actual reasoning level, and preserved historical High records. Types, seven tests, and build passed, including rejecting new High requests/old High previews and preserving old budgets after restart.

After the user stopped Harness, port 3080/database ownership were clear; the database was backed up to `.cache/g0.before-g1-low.sqlite` before upgrade/testing.

- Real Low success: one call, 2068 visible bytes, about 26.3 seconds; input 581, output 3406 including 3137 reasoning, total 3987. Brevity/maintainability directions passed schema/path validation; sidebar showed 3987. Evidence: `.cache/g1-live-low-evidence/result.json`, usage.png.
- The browser driver later selected an opportunity by index while saving a draft and timed out. The call had already succeeded; no additional spending occurred. Selection was changed to direction title. The temporary workspace was removed in finally; the real analysis stayed, and this online flow was not called an end-to-end pass.
- Replayed the Low response in a fresh profile with the real adapter disabled. Entry, analysis, corrected selection, required information, draft save, and disabled formal authorization passed. One fixture call, 130 fixture tokens, zero paid calls, no browser errors. Evidence: `.cache/g1-low-draft-evidence/result.json`, draft.png; not additional provider evidence.
- All 81 prior request rows remained identical, with one new Low row. Four source Skill files remained byte-identical. Observation was paused. The real profile contains no draft from this analysis; the replay draft exists only in the isolated profile.

This one-call budget was consumed and cannot be replayed. The historical next step was freezing G2 scope/isolation/check contracts before implementation.

## Versions and cleanup

Chromium for official replay stayed in `.cache/playwright`. First-round services on 63372, 55598, 58139 and test browsers closed. The real development profile was initially upgraded to g1.1/SQLite 2, retaining G0's 5026 tokens and cancelled state. Backup: `rsi/g0.before-g1-2026-09-08.sqlite`. Test workspace registrations were removed and observation paused, preserving history. This stage did not push or create a PR.

High used g1; g1.1 added wording that the output limit includes reasoning. Low used g1.2; final g1.3 changed only version/docs with identical host/client runtime artifacts. Stop sessions/host before upgrade/uninstall; hot removal during active daily requests was unverified.

Low service PID 79715/port 49235 and replay PID 79939/port 50057 received SIGINT and exited. Browsers closed in finally. No containers were started in this stage.
