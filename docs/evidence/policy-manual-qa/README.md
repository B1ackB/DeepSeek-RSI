# Manual pack validation evidence

2026-10-16. [Contract](../../POLICY-MANUAL-QA-CONTRACTS.md) · [report](../../POLICY-MANUAL-QA-REPORT.md). Fixed responses only, zero paid calls.

- `check.txt`: 105 passing Node tests, both type checks and build on Node 25.8.1 / pinned Harness. Five new groups cover manual packs, full tools, isolation, accounting, conflicts, corruption, rollback and actual controller loss.
- `browser-result.json`: fresh native sidebar, actual uncommitted repository source, saved/reviewed/sealed pack, independent confirmations, three complete paired tasks, separately metered generation, no automatic budget/choice/binding changes, child draft and reload without replay.
- `restart-result.json`: actual restart with zero model requests, identical projection/28 attempts, one retained source-bound session, loaded pack editing and exact selection. The narrow-window visibility result records the existing host limitation, not a claim that the full form works at 760px.
- `sidebar.png` / `sidebar-narrow.png`: inspected desktop form and actual narrow host behavior. Desktop form labels stack; the narrow host may close/remount its details column.
- `compatibility-result.json`: copy of the earlier 48-attempt fixture retains five eligible evaluations, five bound sessions and original rows. An old source-bound generation can authorize a new manual pack; authorization-only restart interrupts without replay. The original database hash is unchanged. `compatibility.mjs` is the local copy-only reproduction.
- `verification.json`: eight exact policy/ledger table comparisons across restart, three question ledgers, 150 original fixture/evidence hashes, unchanged Harness, five owned hosts/ports absent and 18 child processes/homes gone.
- `delivery-checks.json`: documentation routing, whitespace/tabs, credential-literal and package boundary checks.

Build using `node scripts/build.mjs --policy-review-fixture`, then create a **fresh** isolated home using `prepare-browser.mjs`. From the pinned Harness checkout, run its web CLI with the recorded patch, `--no-open`, telemetry disabled, `DSH_HOME=<root>/policy-review-home`, `RSI_POLICY_REVIEW_FIXTURE=1` and `RSI_POLICY_MANUAL_QA_REPOSITORY=/absolute/path/to/DeepSeek-RSI`. The fixture disables the real provider. Run `scripts/browser-policy-manual-qa.mjs <root>` from this checkout. Stop the recorded owned host, restart the same home, and run the browser script with `--restart`. Preserve original fixture files and create a new home after a failed fresh-start run. The reproduction's fixed line references bind this gate's exact source bytes; updating the source needs deliberate pack review.

The final private profile is `.cache/policy-manual-qa-xEailE`; earlier diagnostic profiles are retained. Logs with authenticated URLs, full request captures, databases and objects stay private. No service remains running. Absolute paths record the local environment; the script does not create or spend a real-model budget.
