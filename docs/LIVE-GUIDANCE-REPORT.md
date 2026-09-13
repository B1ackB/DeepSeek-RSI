# g2.4 Design Guidance, Upgrade, and Real Validation

Date: 2026-09-09. Based on main e798511, branch codex/g2-live-guidance. This historical report separates real model calls, fixed-response browser tests, and actual Docker checks. Its quality conclusion and proposed next step predate the compilation/user-choice policy in [EXTENSION-CONTRACTS.md](EXTENSION-CONTRACTS.md).

## Implementation

The confirmation card added four page purposes (product landing page, portfolio, work dashboard, reading) and four visual directions (clear/modern, editorial, bold, warm/friendly). CSS thumbnails illustrate layout/color; they are not generated designs.

Users can skip, deselect, switch, and add free text. Purpose appends to brief; style/free input combine into preference and are shown before submission. Existing authorization digest, scope, and budget apply, with no persistent fields added. Selecting cards makes no call; the independent model still edits the Skill, and adoption remains separate.

## Validation

- Host/client TypeScript, 13 Node tests, and build passed.
- Isolated browser-mainflow verified text retention and zero calls while switching cards, correct combined authorization input, complete diffs, no replay on reload, adoption/dispatch, and a second linked iteration. Five simulated calls, zero paid calls; screenshots inspected.
- docker-candidate-probe used the pinned real image for Python AST/Shell syntax: valid content passed, invalid syntax failed, staging cleaned, source unchanged. Valid Python containing an explicit raise still passed, demonstrating syntax-only checking. The initial error-message assertion was corrected to the actual error type; runtime validation did not change.
- docker-probe passed fixed Python/Shell execution, isolation constraints, timeout, cancellation, and container cleanup. It does not evaluate candidate webpage behavior.

Raw evidence: `.cache/live-guidance-evidence/` browser/result.json and four screenshots, docker-candidate.json, docker-lifecycle.json. Cache is excluded from Git; scripts support reproduction.

## Actual profile upgrade

Before upgrade, the real Web profile had g2.2/SQLite 4, 116 request records, three Skills, and two analyses. Stopped-host backup: `.cache/live-guidance-evidence/before-upgrade.sqlite`; counts: before.json. Backups/credentials are not committed.

Native plugin add installed g2.4. Browser verification of the real profile/sidebar/snapshot passed without model calls or script errors. Installed host/client SHA-256 matched the build; see installed.json and installed.png.

After shutdown, SQLite migrated 4 → 5. State (1), operations (6), attempts (116), bindings (9), and g1_operations (11) were identical row by row. Business JSON only gained empty mainflow tasks/preferences/active; see migration.json.

Historical package `.cache/b1ackb-deepseek-rsi-0.0.0-g2.4.tgz` SHA-1: `2cdc5c105fbc8fd97a27fb66d2e9df0f145b3715`. Its bundled report predates installation; this repository report appended installation results without runtime changes.

Ports 50451 and 50888 were stopped/verified, browsers closed, containers empty, OrbStack returned to Stopped. The user's original 3080 service was neither started nor stopped.

## Small real workflow experiment

The user separately authorized the batch and allowed spending below one million tokens. Actual route: DeepSeek-V4-Flash / Low; revision output cap 4096, page cap 16384, input 64 KiB, five minutes per call, twenty minutes total. The controller allowed at most five requests, stopped at 900000 confirmed tokens or unknown usage, and set maxRetries=0. Four requests completed in the window, totaling **23830 provider-confirmed tokens**.

| Call | Output cap | Confirmed total | Result |
|---|---:|---:|---|
| Initial Skill revision | 4096 | 1422 | Clarification; one-request task exhausted and retained/stopped |
| Revision with clarified stage | 4096 | 2281 | Complete candidate passed host checks |
| Candidate page | 16384 | 5252 | Native Agent Loop generated HTML |
| Baseline page | 16384 | 14875 | Matched Harness LLM route generated comparison HTML |

No old task/usage was deleted or reset. Comparison model, reasoning, output cap, system, and all non-Skill messages were identical; only Skill instructions/sealed resource directory changed. Actual Skill content, approval, and session binding matched digest `440094f8f3a211593236e2c534805d5a1c03933a75d3088830b43482dcdfe961`. Task scope left project ACTIVE/persistent preferences empty and source unchanged.

**The integration worked; the candidate page failed the historical quality check.** Both pages passed required structure, native keyboard operation for two FAQs, primary CTA anchors, and no horizontal overflow at 1440/390px. Four screenshots were inspected. The candidate reduced large panels and emphasized the title but added a submit-enabled demo signup form. A valid test email and click produced no visible feedback, navigation, or request, violating the initial Skill's interaction boundary. The baseline explicitly disabled demo controls. Fewer tokens did not make the candidate suitable for source overwrite.

These checks ran in an independent acceptance script, not the product's pre-adoption gate. The product still marked page effects/function comparison not_applicable and did not import the report as a score. Candidate HTML came from the native loop; baseline used an equivalent single request. Both were tool-free and saved by the test helper, not proof of actual project file edits/builds/multi-file development. Revision calls were RSI; candidate and baseline page calls belonged to separate sessions, not a productized RSI evaluation ledger.

## Evidence and reproduction

Committed-safe pages, screenshots, Skill versions, confirmed input, usage, and hashes are indexed in [real comparison evidence](evidence/g2.4-real/README.md). Raw requests/tasks/native events stay in `.cache/live-guidance-evidence/real/`; authentication and complete local contexts are excluded. These artifacts were originally uncommitted local work; the later delivery includes the safe evidence set.

mainflow-live-probe.ts is a batch-specific overlay using installed g2.4, excluded from the package. A fixed batch ID and persistent records prevent repeated spending; never delete accounting to rerun it. The run included one model clarification and one pre-send helper error from writing a read-only signal. Correcting the helper resumed the same bound session without an additional provider call for that failure; product runtime did not change.

`node scripts/check-live-pages.mjs` rechecks cached pages without paid calls. It intentionally exits with failure for the known extra-form issue; do not repair model output to manufacture a pass. An initial browser run disabled JavaScript and timed out on automation stability checks. Normal scripts, reduced motion, and blocked external requests allowed required checks to complete; adding extra-control checks then exposed the failure. This is a fixed-sample script, not a general evaluator.

Final integrity: all 116 old request records remained identical; four new calls succeeded with confirmed usage. Existing Skills/analyses/ACTIVE/preferences were retained. Dedicated Agents and temporary workspace registrations were released. Ports 59806, 60131, and 60660 were unbound; browsers closed. The test Skill was Markdown-only, so the real batch did not start Docker/OrbStack. See final-integrity.json.

The historical recommendation was to integrate fixed page cases, extra-interaction checks, and quality-failure adoption blocking before broader preference/efficiency experiments. This recommendation was superseded by the later user-choice policy. One sample's time/token difference cannot establish long-term gains, especially with higher baseline reasoning and a candidate quality issue.
