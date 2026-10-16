# Whole manual-pack evaluation gate

2026-10-16. Base `cbe1c579237784a8b61ec7d494361b448d9899cf`, branch
`codex/policy-pack-evaluation`. [Contract](POLICY-PACK-EVALUATION-CONTRACTS.md) ·
[evidence and reproduction](evidence/policy-pack-evaluation/README.md).
Fixed responses only; zero paid calls.

## Implementation

The existing sidebar can select a sealed manual pack and explicitly authorize its
three questions once. Selecting this mode does not increase any budget. One
receipt pins the exact source, sealed question version, baseline/candidate lineage,
runtime and aggregate request/token/deadline limits. A new concrete parent record
and three existing paired batches commit in one transaction. Single-question
commands keep their previous meaning.

Each question runs baseline and candidate through the existing independent native
Agent subprocesses, search/read tools, observed continuations and full-task fixed
checker. Within each pair the source, question, tools, route and limits are equal.
The proposer sees no selected source or held-out answers; initial child messages
contain only the public frozen run. The question checker and immutable pack stay
under host authority.

Attempts retain their child batch owners. The parent sums those three owners once,
with confirmed subtotal, nullable total and explicit unknown count; generation is
separate. Dispatch checks the parent cap and deadline across question boundaries.
Quality failure can continue; incomplete execution or unknown usage stops remaining
members. Stopping a member maps to the whole pack/controller. Interrupted work is
never replayed on open or duplicate submission. Complete individual results stay
visible, while incomplete packs cannot enable adoption through a completed child.
Existing separate adoption/restoration and immutable old session bindings remain.

SQLite stays at unreleased version 7 with one additive table and optional child
provenance. Startup validates the one receipt, exact ordered membership, lineage,
source/pack identity, conditions and limits before recovery. Parent status is
derived from children, so recovery needs no separate resumable scheduler/state.

## Verified

Node 25.8.1, pinned Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`:
**112 tests**, both TypeScript projects and build pass. Five added integration
groups exercise six independent full tasks; identical paired conditions; actual
child/proposer oracle exclusion; exactly one whole-pack receipt; cumulative request,
token and elapsed-window gates; unknown usage in the second question; member stop
and disposal; changed/stale inputs; atomic authorization rollback; missing objects;
corrupt membership/receipts/limits; and controller loss between questions and during
a later tool task. The restored store preserves old rows and does not launch work.
Complete-pack adoption, restoration and unchanged old/new session bindings also
pass. The original single-question source-loss behavior is retained.

The integration pack required two files for every question: **24 fixed evaluation
requests / 360 synthetic tokens**, excluding its one generator request. Unknown
usage in question two retained **120 confirmed tokens**, one unknown attempt and a
null total. A 10-request cap stops after 8+2 requests; a 130-token threshold stops
after 9 requests / 135 confirmed tokens, never dispatching the next request.

A fresh native sidebar profile registered this actual repository read-only and
sealed `src/policy-manual-qa.ts` plus `src/policy-qa-inputs.ts`. Manual authoring,
review/sealing, separate candidate generation, cancelled evaluation confirmation,
one whole-pack confirmation and summary passed. The three questions made
**6 / 8 / 6 requests**, **300 synthetic evaluation tokens** total. Exactly one pack
receipt and zero individual evaluation receipts were persisted. No automatic
adoption or session rebinding occurred; browser errors were zero.

Actual host restart preserved nine raw policy/ledger tables, all **28 attempts**,
one whole-pack summary, two question records and the original source-bound session.
Opening the pack/session made zero model requests. A copy-only check of the previous
28-attempt manual store preserved every row in all 13 original tables on first
open; four old evaluations and its session remain valid. A new unlaunched whole-pack
intent on that copy recovered interrupted with no new attempt. The original
database hash stayed unchanged.

## Preservation and limits

Existing tracked fixtures/evidence and the pre-existing Harness patch are unchanged.
The starting workspace was clean and backed up before edits. No historical user
store was edited or cleared. Private diagnostic profiles remain excluded under
`.cache/`. All three owned browser-test hosts/ports and ten recorded browser evaluation workers/homes
were verified released; browser handles closed. No containers or paid adapters were
started. See the preservation/cleanup evidence for exact counts and hashes.

The existing 760px Harness details-column limitation remains: it can close/remount,
so full narrow-screen usability is not established. Human pack correctness still
requires human review; fixed adapters prove authority, execution and recovery, not
real-model improvement. This gate supports exactly three existing manual question
types, no general execution framework, dependency, paid route or automatic choice.
Older strict readers may reject new records; downgrade requires the stopped-host
backup including sealed objects.

## Final delivery review

The [final review evidence](evidence/policy-pack-evaluation/final-review/README.md)
adds a fresh source audit, **113 passing tests**, native sidebar/restart verification
and two copy-only historical-store checks. No blocking implementation issue was
found. A new regression group proves that equal content hashes cannot substitute a
different sealed pack record, and that jointly changed paired conditions with a
self-consistent question specification still fail the original source authority.
No production runtime change was necessary during this review. Initial gate
fixtures/evidence and the Harness patch are preserved.
