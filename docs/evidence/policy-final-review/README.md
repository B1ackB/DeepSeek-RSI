# Final policy review evidence

Recorded 2026-10-16. All responses are fixed fixtures; paid requests are zero. This evidence is separate from the original 2026-10-15 review gate.

- `before-fix.txt`: the two deliberately failing recovery regressions before their fixes.
- `targeted.txt`: all 13 policy review/session tests after the fixes, including failed restoration guards.
- `check.txt`: complete check log; 68 tests, host/client type checks and builds passed.
- `browser-result.json`: native web profile checks, including workspace-switch confirmation clearing and a complete tool task.
- `verification.json`: pinned runtime, exact choice/session lineage, source continuation, separate accounting, released host/port and absent child directories.
- `sidebar.png`, `sidebar-narrow.png`: inspected wide/narrow screenshots. These do not claim a mobile host redesign.
- `preservation.json`: all 73 files already dirty at resumption; 61 unchanged, 12 intentionally extended, none missing.

Authenticated URLs, complete browser request captures and the controller database remain in the recorded `.cache/policy-final-review-*` directory. The browser and host are closed; retained files are history rather than running resources. No prior evidence was overwritten. Reproduction uses the existing policy fixture helpers and `scripts/browser-policy-review.mjs` under a new isolated `policy-review-home` with the real provider disabled.
