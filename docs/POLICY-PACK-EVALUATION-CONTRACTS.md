# Explicit whole-pack evaluation

2026-10-16. This gate adds one fixed-response whole-pack evaluation for an already
sealed human-authored repository question pack. It does not authorize paid calls,
change candidate scope, generate answers, or choose an active policy.

## Authorization and frozen input

`policy_evaluate_pack` is separate from generation and single-question evaluation.
One explicit confirmation binds workspace/path/current choice, exact baseline and
sealed candidate generation, sealed source ID/digest, sealed pack ID/digest,
runtime fingerprint and one cumulative request/token/time budget. The host freezes
three existing paired batches in order: symbol, call-chain, error-path. Parent,
children and the one authorization receipt commit atomically. Each pair has equal
question, snapshot, route, tools, output/input limits and checker. Children contain
an optional `packEvaluationId`; existing records omit it without rewriting.

The parent budget allows 1–48 requests, a 1–200000 confirmed-token stop threshold,
and 100–60000 milliseconds from authorization. Existing per-side limits remain.
Children retain their existing 1–16 request cap, bounded by the parent. All six
processes share the parent deadline and budget; neither opening the sidebar nor
choosing whole-pack mode increases a limit. Tokens can cross the stop threshold
on the last already-authorized request; no subsequent request may start.

## Execution, evidence and summary

Reuse the existing sequential baseline/candidate native Agent subprocesses for
all three questions. Only public frozen task conditions and policy instructions
cross the child boundary. The proposer receives neither selected source text nor
question-pack questions, standard answers, citations or evaluation results.

The parent has no new spending owner or duplicate attempt rows. Attempts remain
owned by their child batch; whole-pack accounting selects those three owners once,
excluding generation and ordinary sessions. Unknown usage yields a null total,
with confirmed subtotal and unknown count retained. Before each child starts and
each request dispatches, the host checks exact authorization, earlier children,
shared usage and deadline. Quality failure may continue to the next question;
missing evidence, unknown usage, execution failure or cancellation stops the rest.

The summary lists all three child batches, per-side checks and request/tool usage,
complete-case count, confirmed/unknown totals and overall passed/failed/incomplete.
Passing requires all three full paired tasks, trustworthy usage, unchanged fixed
conditions and verified cleanup. A partial pack never enables adoption through a
completed child. Adoption/restoration still require a separate existing command;
no score switches versions. Old sessions retain their frozen policy/source.

## Failure and compatibility

Stopping either a pack or any member stops all unfinished members and aborts the
owned controller. Dispose drains the active child and verifies existing PID/home
cleanup. Startup marks unfinished children interrupted, deriving an interrupted
pack without replay. Completed evidence and consumed/unknown usage remain intact;
a fresh authorization creates a new parent, never resumes the old one.

Append `policy_pack_evaluations` to unreleased SQLite 7. Validate parent receipt,
exact ordered membership, policies/source/pack/generation/budgets and deadlines
at startup, transactionally failing closed on corruption. No old rows, objects,
source files or historical evidence are rewritten. Missing sealed objects block
execution/review; they do not delete history. Older snapshots default the new
summary array to empty. Single-question commands retain their original semantics.

## Acceptance

Fixed adapters must prove three complete tool tasks per side, six independent
processes, identical conditions within each pair, isolated generator/child inputs,
one evaluation receipt, aggregate caps across questions, unknown usage, explicit
stop, controller-loss recovery without replay, cleanup, stale/duplicate/cross-pack
rejection, old-store compatibility and sidebar confirmation/summary persistence.
Scripted facts validate control flow, not real-model repository reasoning.
