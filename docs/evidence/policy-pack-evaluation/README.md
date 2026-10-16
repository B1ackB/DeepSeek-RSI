# Whole manual-pack fixed-response evidence

2026-10-16. Local Node 25.8.1, pinned Harness
`d347e703908d0406b7a7ef80e3a0e594d86b2215`, pre-existing right-panel patch.
No real provider, paid call, container or user database modification.

- `check.log`: both TypeScript projects, 112 tests and normal build pass.
- `browser-result.json`: actual-repository sealed source, form-authored pack,
  separate generator confirmation, cancelled evaluation confirmation, one whole-pack
  confirmation, three complete pairs (6/8/6 requests), summary and unchanged session.
- `restart-result.json`, `restart-verification.json`: real host restart, zero
  generation/evaluation replay, equal projection and nine raw policy/ledger tables.
  SQLite retains 28 total attempts, one whole-pack receipt, zero single-question
  evaluation receipts, one original session and sealed-parent/revision-draft records.
- `compatibility-result.json`: copy-only previous 28-attempt store, 13 original
  tables unchanged on open, four old eligible pairs and one bound session retained.
  A new authorized/unlaunched pack recovers interrupted with no new attempt.
- `cleanup-preservation.json`: all 173 pre-existing fixture/evidence hashes and the
  Harness patch unchanged; three owned browser hosts/ports and ten recorded browser
  workers/homes released. Test groups separately check owned integration resources.
- `pack-summary.png`: reviewed native sidebar with 3/3 complete, 20/24 requests,
  300 synthetic evaluation tokens and individual baseline/candidate checks.
- `sidebar-narrow.png`: records the existing 760px Harness details-column closure;
  this is a limitation, not narrow-screen usability evidence.

## Reproduce

From the repository root with the installed pinned Harness and Chrome:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" node scripts/build.mjs --policy-review-fixture
PATH="/opt/homebrew/bin:$PATH" node docs/evidence/policy-pack-evaluation/prepare-browser.mjs
```

Preparation prints a fresh root `ROOT`, records `/tmp/rsi-policy-pack-evaluation-root`
and seeds only fixed adapters. In the Harness directory, start this isolated profile:

```sh
PATH="/opt/homebrew/bin:$PATH" DSH_HOME="$ROOT/policy-review-home" \
 DSH_TELEMETRY_MODE=DISABLED RSI_POLICY_REVIEW_FIXTURE=1 \
 RSI_POLICY_MANUAL_QA_REPOSITORY=/absolute/path/to/DeepSeek-RSI \
 node --import tsx/esm apps/cli/src/bin.ts web --patch "$ROOT/patch.json" \
 --no-open > "$ROOT/host.log" 2>&1
```

The real DeepSeek adapter is disabled in `patch.json`. Keep the authenticated launch
URL and full model/source captures private. From the repository root run:

```sh
PATH="/opt/homebrew/bin:$PATH" node scripts/browser-policy-manual-qa.mjs "$ROOT" --pack
```

Record the exact host PID/configuration/port, stop only that host, then restart the
same profile and run the browser script with `--pack --restart`. Check zero new
requests and compare raw ledger/policy rows. Stop the restarted host; verify each
recorded worker PID is absent, its owned home removed and host ports released.
Retain isolated profile/object/ledger data for diagnosis. Do not open its SQLite
file concurrently with a host.

The optional `compatibility.mjs /absolute/path/to/old/policy-review-home/rsi`
reproduces this concrete previous 28-attempt manual fixture check on a fresh copy;
it does not support arbitrary user stores or dispatch a model request. Original
SQLite bytes are hashed before and after. Run it only against the stopped fixture.

The first browser run exposed an accessible-label mismatch for the new range
selector; its explicit accessible name was fixed, and a new isolated profile passed.
The failed profile remains private and stopped. A raw-table verification helper was
also corrected to compare serialized rows rather than SQLite objects' prototypes.
Neither issue changed historical bytes or the final validated run. Scripted answers
prove mechanics and isolation, not real-model reasoning or human pack correctness.
