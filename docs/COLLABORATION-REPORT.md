# g2.5 User Comparison and Collaboration Report

Date: 2026-09-13. Development continued on `codex/g2-live-guidance`, retaining the previously uncommitted g2.4 changes and real experiment evidence. The user's running Harness profile was not upgraded. This report records implementation evidence; the subsequent English-documentation delivery is submitted through GitHub.

## Implemented

- User-directed selection: retain candidate validity checks, use compilation/format thresholds for comparison, and introduce no functional/aesthetic/quality score.
- Paired outputs: separately confirm a two-request budget, freeze identical requirements/preferences/scenario/model settings, then generate, compile, and seal each side.
- Readable labels: replace hashes and task/session IDs with short baseline/candidate/current-revision labels. Passed checks show short statuses. Analysis previews and copied preference context omit internal IDs; exact backend validation remains.
- Graphical sidebar: thumbnails, authenticated links, token/time bars, failures, and unknown usage. Fixed mobile-viewport scaling avoids misleading layouts in a narrow sidebar.
- Further iteration: choose a reference, enter requirements, and create a parentId-linked task. Confirmation precedes new calls; prior candidates, comparisons, and costs remain.
- Extension architecture: separate candidate checks, comparisons, scenario registration, and shared artifact contracts. Built-in web/text scenarios and the `@b1ackb/deepseek-rsi/scenarios` code/type entry point.
- Compatibility: retain observation/analysis, web guidance, review without comparison, exact binding, and linked dispatch. SQLite 6 gives historical tasks/preferences the frontend default.
- Documentation: rewritten README/framework, architecture/contribution guides, and extension contracts. Archive the old framework and retain historical real-experiment conclusions. Project guides, contracts, and reports are now English; immutable source evidence remains unchanged.

## Validation

- Host/client TypeScript checks and plugin/extension builds passed.
- 16 Node tests passed, covering the earlier workflow, real Harness version binding, text Skills, feedback authorization, compilation failures blocking adoption, matched comparison inputs, provider accounting, unknown-usage stop, cancellation, registration, and SQLite 5 → 6 defaults.
- Isolated Harness + Chrome passed guidance, complete diffs, authenticated previews/CSP sandbox, charts, zero-call feedback preparation, reload without replay, adoption, and linked sessions: **8 fixed-adapter calls, 0 paid calls**, no browser errors.
- Screenshots were inspected. The initial independent preview request used a relative URL and failed in the test driver; absolute URL resolution fixed it. Browser inspection also found narrow-iframe layout issues, corrected with fixed-viewport scaling.
- Package validation included exported JavaScript/declarations, an independent TypeScript consumer and runtime scenario registration from the unpacked package. No database or credential files entered the package. Relative document links and git diff whitespace checks passed.
- All 15 g2.4 manifest entries were rehashed and matched the original SHA-256 values.
- No new real-model or Docker execution occurred in g2.5. Existing esbuild performs web compilation. The retained Docker path does not constitute new Docker or model-quality evidence.

See [UI evidence](evidence/g2.5-ui/README.md). Full logs, profile, and database remain in `.cache/collab-browser-0b2teda4`; authentication information is not committed. The displayed 2000/1200 tokens are simulated values, not efficiency evidence.

## Resources and data

Test ports 52682 and 53081 were stopped and verified unbound; browser cleanup ran in finally. Initial sandbox listening was denied by the OS, then an approved local test was used. No Docker, user-profile change, or termination of existing user services occurred.

Previously uncommitted g2.4 files and real evidence were retained. Generated caches remain in .cache; no ledger deletion or historical budget reset occurred. Actual g2.5 installation is still pending. Stop the host and back up all of `DSH_HOME/rsi` first; older packages cannot read SQLite 6.

## Limits

- The new comparison chain has not been validated with a real model; fixed responses establish workflow and actual compilation only.
- Web comparison is a self-contained single page; text uses explicitly supplied material. Multi-file projects, repository tools, and real build environments need additional execution support.
- Preview links are authenticated/local, not public deployments. Adoption starts separately charged ordinary Harness work; it does not copy the preview into the project.
- Compilation does not guarantee correct buttons, content, or aesthetics. Users judge the outputs under the confirmed product rule.
- Cards expose the immediate parent's comparison/costs. Broader history, explicit rollback, and source overwrite/recovery remain future work.
- External scenarios are trusted host plugins, not sandboxed scripts. A pinned Harness and panel patch are required; cross-host compatibility and fully clean installation are not yet established.

## Sidebar readability follow-up

After simplifying labels, client type checks/build and the full isolated browser flow passed again: 8 simulated calls, 0 paid calls, no browser errors. Assertions check that ordinary sidebar text contains no hashes/UUIDs. The test driver encountered welcome-dialog and rich-text input timing; waiting for the dialog and typing through editor events resolved it. Updated screenshots/results are committed; raw evidence stays in `.cache/readable-ui-ervwfi2u`. Port 53829 was stopped and verified unbound, and the browser closed.

## English documentation delivery checks

The full working tree passed `npm run check` again: host/client types, 16 Node tests, and build. All 21 project Markdown guides/reports are English; the two original Skill evidence files and runtime fixtures remain unchanged. All 127 local document links and section anchors resolved. The source review retains its 36 pinned external links, and the archived framework retains all 17. All 15 historical evidence hashes matched. Package dry-run included the scenario JavaScript/type entry points and excluded local caches/databases; the reviewed 74-file change set contained no detected credential literals or authenticated launch URLs. No new real-model, Docker, or user-profile operation was performed for documentation delivery.
