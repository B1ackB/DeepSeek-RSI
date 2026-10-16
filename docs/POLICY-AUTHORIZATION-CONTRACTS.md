# Sidebar generation and independent evaluation authorization

2026-10-16. One concrete extension to the existing repository-evidence-policy pilot; fixed responses only. This contract precedes implementation. No new optimization object, provider or automatic adoption.

The subsequent [fixed source question contract](POLICY-SOURCE-QA-CONTRACTS.md) adds optional question selection and an exact-manifest three-case host pack. Omitted selection retains the first-line specification below unchanged.

## Exact intent and minimal fields

Reuse the policy command envelope, global revision, operation receipt and existing generation/batch tables. `policy_generate` confirms registered workspace, expected active choice, exact baseline digest, sealed source ID/digest, requirements and the existing single-request generation budget. The host derives policy ID, root, input digest, lineage and generation ID (the operation ID). Both policy and source must match the current explicit approval. No client root, source body, evaluator, prompt, tools or real provider is accepted.

The optional generation `source` binding records workspace ID/path, choice ID, source ID and snapshot digest. Old generations omit it unchanged. The source binding is authority/provenance, **not generator prompt material**. Reuse the original proposer view: exact baseline, user requirements and independent development example. Do not add selected repository text, evaluation questions/answers, prior results, session history or storage access. User-supplied requirements/baseline remain explicit user data; the host does not promise to erase material deliberately pasted into them.

`policy_evaluate` is separate confirmation: workspace/current choice, generation ID, exact baseline/candidate digests, same sealed source ID/digest, and cumulative batch budget. It accepts only a sealed generation with confirmed usage. The host freezes two new run IDs, identical source/conditions/limits, runtime digest and a fixed `repository-source-v1` evaluation specification. Generation never creates or runs an evaluation implicitly. `policy_stop` cancels one exact workspace-owned generation or evaluation; its receipt and terminal state commit before cancellation.

## First source evaluator

Use the complete selected frozen snapshot. The controller fixes the task: search/read the first UTF-8-sorted selected file and return its first line with an exact line citation in the existing answer format. Both sides have the same question, full manifest, limits and checker. The expected line/checker are derived only by trusted host code after generation; neither appears in the proposer request. This verifies complete task execution, source transport and citations, **not arbitrary repository semantics or model improvement**. Large sources can fail the unchanged approved input/tool limits; selection never enlarges permission or budget.

Keep the six historical casebook checks unchanged. A source batch has optional source provenance through its generation; review/adoption rechecks the exact source, lineage, conditions, ledger and cleanup. Evaluation outcomes never switch the active choice. Existing review/adoption/session behavior remains explicit.

## Execution and accounting

The live host retains the sole SQLite connection. The old developer executor hands that connection to workers and cannot safely run beside the sidebar. For this actual second entry, use two sequential independent Node children running the native Harness Agent Loop with only the existing snapshot tools. Children receive frozen run input through bounded IPC; no database, evaluator answers, provider credentials or user profile. A child forwards a bounded model request to the host; the existing host LLM observer reserves/settles the single batch-owned attempt before fixed-adapter dispatch. Never mirror/import a second ledger. Parent-observed request envelopes and native tool/result/turn events feed the existing full-task evaluator. A complete tool-free answer cannot pass.

The host records PID/home ownership before starting a run, enforces cumulative request/token/time limits, and verifies process exit, Agent disposal and directory removal before recording complete evidence. Disconnect/abort/deadline closes owned work; retained uncertain resources remain visible and block adoption. This is process separation, not an OS sandbox for candidate code.

## State, recovery and compatibility

Authorization and receipt commit together, then an in-memory job starts once. Viewing, form editing, cancellation of confirmation and reload spend nothing. Duplicate successful commands return the exact receipt without enqueueing again; conflicting reuse and stale revisions/choice/source/version reject before dispatch. Authorization without launch, partial generation, failed execution and unknown usage survive restart as interrupted without replay. A later explicit action requires a fresh operation/budget; it does not reset the old ledger. Concurrent authorized jobs for the same workspace are rejected.

Stop/disposal drains model work and owned processes before storage closes. A failed reply cannot lose committed intent. A changed active choice/worktree cannot change a running frozen job or an old session; later evaluation authorization must still match its exact source/approval. No source/evidence fallback.

Cancellation during asynchronous home preparation must remove that home before a child starts. Failure to persist a started child's PID must still wait for its exit and remove its owned home. Sessions created from a source-evaluation batch also recheck that batch's exact source object on resume/dispatch, even when their historical binding shape has no separate `sourceId`.

SQLite stays at unreleased version 7 with optional fields and command receipts only; no table rewrite or historical default insertion. Validate new source/receipt/lineage references at startup. Preserve old row bytes. Older strict v7 binaries can reject new fields/commands; downgrade from the complete stopped-host database/object/session backup. No historical store is opened for development tests.

## Acceptance

Fixed-response checks must cover generation-only authorization, hidden-answer exclusion, exact sealing/lineage, separately confirmed evaluation, two independent full tool tasks, shared limits/ownership, unknown usage, stale/duplicate/conflicting operations, cancellation, lost replies, process loss before/after dispatch, source/object corruption and old row/session compatibility. Use native web sidebar confirmation/cancel/reload checks, and verify owned resource cleanup. Real paid calls require a future separately confirmed route and budget.
