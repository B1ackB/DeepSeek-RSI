# Manual repository question packs

This gate adds human-authored fixed questions for an explicitly sealed repository snapshot. It reuses the sidebar, policy generation, independent evaluation authorization, native child processes and shared ledger. It does not generate answers or authorize real providers.

## Content and authority

`policy-qa-inputs.ts` defines the browser/host content boundary. A pack has schema version 1, kind `repository-source-qa-pack`, exact `sourceId` and `snapshotDigest`, and exactly three entries: `symbol`, `call-chain`, `error-path`. Each entry has a bounded question and a sufficient standard answer with 1–8 unique fact keys, literal values and nonempty file/line citations. Host validation requires every citation to exist in the sealed snapshot. Required reads are derived from cited paths, never supplied independently. At most three distinct cited files per question keep the fixed-response task within the existing five-request source limit. Total canonical content is at most 64 KiB. Unsupported fields, invalid UTF-8, NUL and invalid line ranges fail.

People review the factual correctness of the standard answers. The host checks structure, snapshot identity, citation existence and execution evidence; it does not infer arbitrary repository semantics. Matching uses exact fact keys/values and covering citations, as in the existing fixed question pack.

## Draft, review and seal

`policy_qa_draft` includes the current workspace/choice, exact source identity, complete questions and optional parent draft/pack ID. Each save appends a new immutable draft; a parent must belong to the same source/workspace. Editing a sealed pack creates another draft and preserves the original. No model calls, spending authorization, adoption or session rebinding occur.

The authenticated `policy_qa` read returns the full selected draft/pack only in its registered original workspace. Long-poll snapshots contain metadata only. The sidebar shows all questions, standard answers, citations and the cited text from the sealed source before offering `policy_qa_seal`. Sealing requires the exact draft ID/content digest, source ID/digest, expected active choice and snapshot revision. The host checks the intact sealed source, publishes a canonical read-only object, and records the seal and receipt atomically. No draft edits or replacement of an existing sealed object are allowed.

Lost command responses return the original receipt for identical operation IDs. Changed payloads and stale state fail. Publication followed by a database failure leaves an inert object without seal authority; recovery never auto-seals it or sweeps unowned stages.

## Independent evaluation

`policy_evaluate` optionally selects an exact sealed `packId`/`packDigest` and one required case ID. Both fields must appear together. The generation must already be sealed against the same source, baseline and workspace choice. A new `repository-source-qa-manual-v1` evaluation spec pins source, pack record/content digest, case and the full host-derived evaluation digest. Existing casebook, first-line and built-in QA specs retain their meanings.

Both runs freeze the same source, question, fact keys, route, tools and per-side budget. Their spec and authorization also bind the standard answer and required reads. Workers receive only the frozen task, tools and policy; standard answer values and expected citations remain in the controller. The generator retains its existing baseline/requirements/development-example-only prompt. No pack, question, answer, citation or evaluation result is added to that prompt. User-authored requirements/baseline are still user-visible text and are not a secrecy sandbox.

Sealing is not evaluation authorization. Preparing, cancelling or reopening either form sends no model request. Only a separate explicit evaluation confirmation launches the already authorized pair. No candidate can change a pack, checker, permissions, ledger, budget or active pointer. Full search/read/continuation tasks, known cumulative usage and verified cleanup are required. Answer-only success is insufficient. Manual pack integrity is rechecked before dispatch and before review/adoption/session use; missing or changed objects block the affected action without fallback.

## Persistence and failure behavior

Add `policy_qa_packs` within the existing unreleased SQLite v7 path, without rewriting old rows. The row stores content, digest, parent, source/workspace/choice provenance, creation time and draft/sealed state plus seal receipt. Startup validates exact draft and seal receipts, parent provenance, source references and evaluation references. Missing object bytes make affected use unavailable; malformed persisted authority fails startup transactionally, retaining the database. Old snapshots default the new metadata collection to empty. Old v6/v7 generations, batches, receipts, choices, sessions and ledger totals retain their original bytes and behavior. Older strict readers cannot read new command/spec variants; rollback requires the complete stopped-host backup.

Draft/seal operations are local and unmetered. Generation and evaluation keep distinct existing owners; pack metadata is not a new spending owner. Interrupted evaluation stays interrupted with unknown usage retained, reservations consumed and no automatic replay. New drafts do not change old batches or old session bindings. Existing restore/adoption checks must rederive the exact originally sealed pack, never a latest pack. Resources remain owned and cleaned by the existing executor.

## Acceptance

Use fixed responses only. Verify all three manual cases on a non-built-in sealed repository; exact source/pack/receipt binding; complete independent tool execution; generator/worker answer isolation; separate seal/generation/evaluation confirmations; cumulative and unknown usage; stale state, changed payload, invalid citations and unsealed/missing/corrupt packs; publication/transaction failure and process interruption; historical raw-row compatibility; reload without replay and narrow/sidebar review. Preserve original fixtures, evidence and historical data. Close and verify all test-owned children, browsers and services.
