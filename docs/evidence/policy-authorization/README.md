# Sidebar authorization evidence

Recorded 2026-10-16. [Contract](../../POLICY-AUTHORIZATION-CONTRACTS.md) · [report](../../POLICY-AUTHORIZATION-REPORT.md). Fixed responses only; paid requests are zero.

- `check.txt`: 93 tests, host/client type checks and build passed.
- `before-fix.txt`: controlled controller-loss regression before the disconnected-send/cleanup correction; historical output retained unchanged.
- `browser-result.json`: new-home sidebar workflow with independent generation/evaluation confirmation, cancellation, workspace reset, no automatic adoption and reload without replay.
- `restart-result.json`: zero generation/evaluation requests on restart; sealed candidate, completed evaluation and old sessions retained.
- `controller-browser-result.json`, `final-browser-result.json`: separately confirmed native full-task comparisons after the final controller checks, preserving all earlier records. The latter uses the final source-object dispatch guard.
- `verification.json`: read-only database counts, equal paired conditions, unchanged original session bindings, all confirmed synthetic usage and released owned host/child resources.
- `abandoned-cleanup.json`: only four recorded empty directories from the reproduced failure were removed after ownership/open-handle checks. Diagnostic controller history remains.
- `sidebar.png`, `sidebar-narrow.png`: inspected 1440/760 px forms. The existing narrow Harness center pane remains a host layout limitation.
- `final-client-check.json`: final client-only readable error wording typechecked/built; tested host bundle unchanged.
- `preservation.json`: prior evidence bytes, current Git base and unchanged Harness patch.
- `final-checks.json`: documentation links, credential-literal scan, tab indentation, Git whitespace and package dry-run checks; the worker is included and private homes/databases are excluded.
- [Final delivery review](final-review/README.md): two further reproduced failure boundaries, the final 94-test check, fresh browser/restart results and preservation/resource checks; earlier evidence above is unchanged.

`prepare-browser.mjs`, `restart-browser.mjs` and `final-browser.mjs` record the actual local experiment inputs. Their absolute checkout/Harness paths are this run's environment, not portable configuration. Preparation always creates a new owned root. Build with `node scripts/build.mjs --policy-review-fixture`, use an isolated `policy-review-home` with `llm-deepseek` disabled and `RSI_POLICY_REVIEW_FIXTURE=1`, then run `scripts/browser-policy-review.mjs <new-root> --sources --authorization`. Never reuse an old home for the fresh-start assertions.

The retained home is `.cache/policy-authorization-ui-9x6Xyi`. Private authenticated launch logs, database, objects and full native request captures stay there. No authentication URL or credential is copied into these records. All hosts and browsers are closed. SQLite remains 7; no live/historical user database was opened, cleared or replayed.
