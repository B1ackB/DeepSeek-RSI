# Fixed source QA evidence

2026-10-16. [Contract](../../POLICY-SOURCE-QA-CONTRACTS.md) · [report](../../POLICY-SOURCE-QA-REPORT.md). Fixed responses only; zero paid calls.

- `check.txt`: 99 passing tests, both type checks and build. Five new QA regressions exercise actual capture, generation, independent native children, host fact/citation checks, authorization/persistence failures, cumulative usage and interruption/recovery.
- `history-check.txt`: controller loss after actual search/read, unknown usage and exact pre-existing raw rows/receipts preserved without replay.
- `browser-result.json`: fresh native sidebar flow including three separately authorized fixed questions, unchanged budget on selection, cancellation, actual multi-file tool tasks and reload without replay. `sidebar.png` / `sidebar-narrow.png` show inspected 1440/760 px forms; narrow center-pane layout remains a Harness limitation.
- `restart-result.json`: real host restart and opening an old session, zero new requests, retained policy projection and attempts, completed QA comparisons and unchanged session bindings.
- `verification.json`: read-only comparison of the six retained policy/usage tables, per-case conditions and usage, released owned hosts/ports/children/homes, earlier evidence preservation and absence of host answers in client/worker bundles. View-operation receipts and global revisions can advance when opening a session; the six-table equality is the precise persistence claim.
- `delivery-checks.json`: documentation links, credential-literal/indentation/whitespace checks and package inclusion/exclusion checks. The worker and all three source-pack files are included; private homes, caches and databases are excluded.

`prepare-browser.mjs` and `restart-browser.mjs` record actual local inputs. Build with `node scripts/build.mjs --policy-review-fixture`, create a **new** isolated home with the preparation script and start the pinned Harness against its patch (`DSH_HOME=<root>/policy-review-home`, `RSI_POLICY_REVIEW_FIXTURE=1`, telemetry disabled, real provider disabled). Run `scripts/browser-policy-review.mjs <root> --sources --authorization --qa`. Stop the recorded owned host, restart the same home, then run this directory's `restart-browser.mjs <root>`. Absolute paths record this environment; do not reuse an old home for fresh-start assertions.

The private root `.cache/policy-source-qa-ui-yD9n0z` retains authenticated logs, database, snapshots, sessions and full request captures; these are excluded from Git/package delivery. No launch token is copied here. All test hosts are stopped. This pack checks authored facts for one exact controlled source manifest; scripted success does not prove real-model improvement or arbitrary repository question answering.
