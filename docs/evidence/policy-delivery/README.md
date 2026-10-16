# Final delivery checks

Recorded 2026-10-16 for the accumulated repository-evidence-policy pilot. No paid model calls. See the [delivery review](../../POLICY-FINAL-REVIEW.md#final-delivery-verification-2026-10-16), [current source contract](../../POLICY-SNAPSHOT-CONTRACTS.md) and [sidebar report](../../POLICY-SOURCE-UI-REPORT.md).

- `check.txt`: final full check, 83 tests plus host/client type checks and build.
- `browser-result.json`: fresh native sidebar adoption/restoration and exact source/session workflow, nine daily fixed-response requests, no browser errors.
- `restart-result.json`: same-home restart, original snapshot/session recovery with zero new requests.
- `verification.json`: read-only database counts, exact old binding preservation, confirmed accounting and verified owned-process/port/directory cleanup.
- `preservation.json`: original dirty-file hashes, deliberate delivery-report extension and unchanged Harness patch.

The fresh owned home is `.cache/policy-source-ui-7yy7J3`. Private authenticated logs, full native request captures, database and objects stay there; none is copied into these bounded records. Screenshots were inspected at 1440 and 760 px. The earlier [source UI evidence](../policy-source-ui/README.md) retains the representative images and original regression checks. The narrow Harness center pane is still a known host layout limitation.

Git attributes exempt only original evidence `.txt`/`.log` records from whitespace diagnostics, retaining terminal blank lines and failure output byte-for-byte. Source, tests and documentation formatting checks remain active.

Reproduction uses the existing `scripts/policy-review-fixture.ts`, `scripts/policy-review-browser-fixture.ts` and `scripts/browser-policy-review.mjs <new-owned-root> --sources`, in a new isolated `policy-review-home` with the real adapter disabled. The complete check command and pinned runtime are documented in the project README. Fixed responses establish workflow and boundary checks, not real-model improvement. No remote CI workflows were configured at submission time.
