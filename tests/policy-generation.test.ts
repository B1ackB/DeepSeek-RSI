import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { openStore, type Store } from '../src/store.ts';
import { emptyTokens, type Attempt } from '../src/contracts.ts';
import { policyCase, authorizeGeneratedPolicyEvaluation } from '../src/policy-evaluation.ts';
import { policyCaseIdSchema, policyDigest } from '../src/policy-contracts.ts';
import { policyGenerationSession, policyGenerationResponseSchema, policyGeneratorPrompt, policyGenerationInputSchema } from '../src/policy-generation-contracts.ts';
import { runPolicyGenerationFixture } from '../scripts/policy-generation.ts';
import { executePolicyComparison } from '../scripts/policy-comparison.ts';
import { policyRuntime } from '../scripts/policy-fixture.ts';
import { observeUsage } from '../src/usage.ts';

const baseline = { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Inspect the repository before answering.' } as const;
const budget = { provider: 'rsi-policy-generation-fixture', model: 'offline-v1', maxRequests: 1, maxOutputTokens: 1024, maxInputBytes: 16384, maxDurationMs: 5000 };
function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-generation-')); const file = join(dir, 'state.sqlite'); const store = openStore(file); const policyId = randomUUID();
	const version = store.sealPolicyVersion(policyId, baseline);
	const input = { id: randomUUID(), policyId, baselineDigest: version.digest, requirements: 'Inspect evidence before making claims and provide citations.', budget };
	const task = store.authorizePolicyGeneration(input);
	return { dir, file, store, policyId, input, task };
}
function pending(id: string): Attempt { return { schemaVersion: 1, attemptId: randomUUID(), revision: 1, owner: 'rsi', ownerId: id, sessionId: policyGenerationSession(id), purpose: 'generation', callKind: 'agent', retryOfAttemptId: null, provider: budget.provider, model: budget.model, providerRequestId: null, state: 'reserved', createdAt: Date.now(), startedAt: null, endedAt: null, usageState: 'pending', tokens: emptyTokens(), usageSource: null, diagnostic: null }; }
function close(store: Store, dir: string) { try { store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }

test('native proposer sees only baseline/requirements/development, seals scoped content and records distinct generation ownership', async () => {
	const { dir, store, policyId, input, task } = setup();
	try {
		const answers = policyCaseIdSchema.options.map(id => policyCase(id).answer);
		store.mutateBusiness(state => { state.observationError = JSON.stringify(answers); }); const before = store.business();
		const result = await runPolicyGenerationFixture(store, input.id);
		assert.equal(result.generation.status, 'sealed'); assert.equal(result.cleanup.contextDisposed, true); assert.equal(result.requests.length, 1);
		const request = result.requests[0]; assert.deepEqual(request.tools, []); assert.equal(request.provider, budget.provider); assert.equal(request.maxTokens, 1024);
		const messages = request.messages as Array<{ content: Array<{ text: string }> }>; assert.equal(messages.length, 1);
		const view = JSON.parse(messages[0].content[0].text);
		assert.deepEqual(Object.keys(view), ['baseline', 'requirements', 'development']); assert.deepEqual(view.baseline, baseline);
		assert.deepEqual(policyGeneratorPrompt(baseline, input.requirements), store.generationPrompt(task));
		const wire = JSON.stringify(request);
		for (const id of policyCaseIdSchema.options) {
			const fixed = policyCase(id); assert.equal(wire.includes(fixed.conditions.question), false);
			for (const claim of fixed.answer.claims) assert.equal(wire.includes(claim.value), false, `Held-out answer leaked: ${id}`);
			assert.ok(view.development.files.every((file: { path: string }) => !fixed.conditions.files.some(row => row.path === file.path)));
		}
		for (const field of ['evaluationSpec', 'facts', 'candidateDigest', 'batchId']) assert.equal(field in view, false);
		const version = store.policyVersions(policyId).find(row => row.digest === result.generation.candidateDigest)!;
		assert.equal(version.parentDigest, input.baselineDigest); assert.equal(version.generationId, input.id);
		assert.equal(store.snapshot().attempts.length, 1); const row = store.snapshot().attempts[0];
		assert.equal(row.ownerId, input.id); assert.equal(row.purpose, 'generation'); assert.equal(row.sessionId, policyGenerationSession(input.id)); assert.equal(row.tokens.total, 13);
		assert.equal(store.policyAccounting(policyId).totalTokens, 13); assert.deepEqual(store.business(), before);
		assert.deepEqual(store.sealPolicyGeneration(input.id, result.generation.response), result.generation);
		assert.equal(readFileSync(join(dir, 'policies', `${input.baselineDigest}.json`), 'utf8'), JSON.stringify(baseline));
	} finally { close(store, dir); }
});

test('scope violations, malformed/unchanged responses, partial/failed streams and unknown usage cannot become candidates', async () => {
	for (const mode of ['scope', 'malformed', 'unchanged', 'template', 'tool', 'oversized', 'provider_error', 'partial', 'unknown', 'conflict', 'max_tokens', 'trailing']) {
		const { dir, file, store, input, policyId } = setup();
		try {
			const result = await runPolicyGenerationFixture(store, input.id, mode);
			assert.equal(result.generation.status, 'failed', mode); assert.equal(result.generation.candidateDigest, null); assert.equal(result.cleanup.contextDisposed, true);
			assert.equal(store.policyVersions(policyId).length, 1); assert.equal(result.requests.length, 1); assert.ok(result.generation.error);
			assert.throws(() => store.sealPolicyGeneration(input.id, result.generation.response), /Only the exact running/);
			assert.throws(() => authorizeGeneratedPolicyEvaluation(store, input.id, { id: randomUUID(), caseId: 'symbol', runtimeDigest: 'a'.repeat(64), budget: { maxRequests: 6, tokenStopThreshold: 1000, maxDurationMs: 30000 } }), /sealed generation/);
			assert.equal(store.snapshot().attempts.length, 1); const before = store.snapshot().attempts[0];
			if (['partial', 'unknown', 'conflict', 'tool', 'oversized'].includes(mode)) assert.equal(store.policyAccounting(policyId).totalTokens, null);
			if (mode === 'conflict') { assert.equal(before.tokens.total, 13); assert.equal(before.usageState, 'unknown'); }
			store.close(); const recovered = openStore(file);
			try { assert.deepEqual(recovered.snapshot().attempts[0], before); assert.deepEqual(recovered.policyGeneration(input.id), result.generation); assert.deepEqual(recovered.authorizePolicyGeneration(input), result.generation); } finally { recovered.close(); }
		} finally { close(store, dir); }
	}
});

test('authorization is one-shot, revision guarded, exact-input bound and rejects unapproved configuration', async () => {
	const { dir, store, input, task } = setup();
	try {
		assert.deepEqual(store.authorizePolicyGeneration(input), task);
		assert.throws(() => store.authorizePolicyGeneration({ ...input, requirements: 'Different requirement' }), /different input/);
		for (const extra of ['system', 'inputDigest', 'evaluation', 'tools']) assert.equal(policyGenerationInputSchema.safeParse({ ...input, [extra]: 'unapproved' }).success, false);
		assert.throws(() => store.authorizePolicyGeneration({ ...input, id: randomUUID(), budget: { ...budget, maxRequests: 2 } }));
		assert.throws(() => store.startPolicyGeneration(input.id, task.revision + 1), /cannot start/);
		const result = await runPolicyGenerationFixture(store, input.id);
		await assert.rejects(runPolicyGenerationFixture(store, input.id), /cannot start/);
		assert.equal(store.snapshot().attempts.length, 1); assert.deepEqual(store.authorizePolicyGeneration(input), result.generation);
	} finally { close(store, dir); }
});

test('exact generator envelope and ownership guards reject tools, history, route changes and stale writes before dispatch', async () => {
	const { dir, store, input, task } = setup();
	try {
		store.startPolicyGeneration(input.id, task.revision); const prompt = store.generationPrompt(task);
		const options: GenerateOptions = { provider: budget.provider, model: budget.model, maxTokens: 1024, system: prompt.system, sessionId: SessionId(policyGenerationSession(input.id)), messages: [createUserMessage({ content: [{ type: 'text', text: prompt.input }], source: { kind: 'user' } })], tools: [] };
		const observe = observeUsage(store, new Set()); let dispatches = 0;
		for (const change of [{ model: 'real-model' }, { maxTokens: 4096 }, { system: 'leaked answers' }, { messages: [] }, { messages: [...options.messages, ...options.messages] }, { tools: [{ name: 'read_database' }] }, { purpose: 'compaction' }]) {
			await assert.rejects(async () => { for await (const _ of observe({ ...options, ...change } as GenerateOptions, async function* () { dispatches++; yield { type: 'finish', reason: { kind: 'stop' } } as StreamChunk; })) {} });
		}
		assert.equal(dispatches, 0); assert.equal(store.snapshot().attempts.length, 0);
		assert.throws(() => store.reserve({ ...pending(input.id), owner: 'session' }), /active authorization/);
		assert.throws(() => store.reserve({ ...pending(input.id), purpose: 'evaluation' }), /active authorization/);
		assert.throws(() => store.reserve({ ...pending(input.id), sessionId: 'ordinary' }), /registered session/);
		store.recordPolicyGenerationResponse(input.id, 'prefix'); assert.throws(() => store.recordPolicyGenerationResponse(input.id, 'replacement'), /cannot be replaced/);
	} finally { close(store, dir); }
});

test('sealed generation gets a separate fixed evaluation authorization and preserves lineage and cumulative policy accounting', { timeout: 10000 }, async () => {
	const { dir, file, store, input, policyId } = setup(); let current: Store = store;
	try {
		assert.throws(() => authorizeGeneratedPolicyEvaluation(store, input.id, { id: randomUUID(), caseId: 'misleading', runtimeDigest: 'a'.repeat(64), budget: { maxRequests: 10, tokenStopThreshold: 1000, maxDurationMs: 30000 } }), /sealed generation/);
		const result = await runPolicyGenerationFixture(store, input.id); assert.equal(result.generation.status, 'sealed');
		const runtime = await policyRuntime(); const approval = { id: randomUUID(), caseId: 'misleading', runtimeDigest: runtime.runtimeDigest, budget: { maxRequests: 10, tokenStopThreshold: 1000, maxDurationMs: 30000 } };
		const batch = authorizeGeneratedPolicyEvaluation(store, input.id, approval);
		assert.equal(batch.authorization.generationId, input.id); assert.equal(batch.authorization.policyId, policyId); assert.notEqual(batch.authorization.id, input.id);
		assert.deepEqual(authorizeGeneratedPolicyEvaluation(store, input.id, approval), batch); assert.equal(store.snapshot().attempts.length, 1, 'Authorization alone makes no evaluation request');
		assert.throws(() => authorizeGeneratedPolicyEvaluation(store, input.id, { ...approval, caseId: 'symbol' }), /different input/);
		assert.throws(() => store.authorizePolicyBatch({ ...batch.authorization, id: randomUUID(), generationId: randomUUID() }), /exact sealed/);
		assert.throws(() => store.authorizePolicyBatch({ ...batch.authorization, id: randomUUID(), generationId: undefined }), /generation provenance/);
		assert.throws(() => store.authorizePolicyGeneration({ ...input, id: batch.authorization.id }), /spending identity/);
		store.close(); const evaluated = await executePolicyComparison(file, batch.authorization.id);
		assert.equal(evaluated.evaluation.status, 'passed'); assert.equal(evaluated.accounting.totalTokens, 150); assert.equal(evaluated.accounting.attempts.length, 10);
		current = openStore(file); assert.equal(current.policyAccounting(policyId).totalTokens, 163); assert.equal(current.policyGeneration(input.id)!.candidateDigest, result.generation.candidateDigest);
		assert.deepEqual(current.business().mainflow.active, []); assert.deepEqual(authorizeGeneratedPolicyEvaluation(current, input.id, approval), evaluated.batch);
		current.close(); await assert.rejects(executePolicyComparison(file, batch.authorization.id), /cannot start/);
	} finally { close(current, dir); }
});

test('fresh generation can extend a sealed candidate without altering the baseline or previous provenance', async () => {
	const { dir, store, input, policyId } = setup();
	try {
		const first = await runPolicyGenerationFixture(store, input.id);
		const next = { ...input, id: randomUUID(), baselineDigest: first.generation.candidateDigest!, requirements: 'Inspect error branches as well.' }; store.authorizePolicyGeneration(next);
		const second = await runPolicyGenerationFixture(store, next.id, 'revision'); assert.equal(second.generation.status, 'sealed');
		assert.equal(store.policyVersions(policyId).find(row => row.digest === second.generation.candidateDigest)!.parentDigest, first.generation.candidateDigest);
		assert.equal(store.policyVersions(policyId).length, 3); assert.equal(store.policyAccounting(policyId).totalTokens, 26);
		assert.deepEqual(store.policyGeneration(input.id), first.generation);
	} finally { close(store, dir); }
});

test('restart retains append-only partial output, unknown reservations and spent identity without sealing or replay', () => {
	const { dir, file, store, input, task, policyId } = setup(); let current = store;
	try {
		store.startPolicyGeneration(input.id, task.revision); const row = pending(input.id); store.reserve(row);
		store.settle({ ...row, revision: 2, state: 'in_flight', startedAt: Date.now(), usageState: 'unknown', tokens: { ...emptyTokens(), total: 13 }, diagnostic: 'conflicting_provider_usage' });
		store.recordPolicyGenerationResponse(input.id, '{"kind":"candidate",');
		store.close(); current = openStore(file); const interrupted = current.policyGeneration(input.id)!;
		assert.equal(interrupted.status, 'interrupted'); assert.equal(interrupted.response, '{"kind":"candidate",'); assert.equal(interrupted.deadline, task.deadline);
		assert.equal(current.snapshot().attempts[0].state, 'interrupted'); assert.equal(current.snapshot().attempts[0].usageState, 'unknown'); assert.equal(current.policyAccounting(policyId).totalTokens, null);
		assert.deepEqual(current.authorizePolicyGeneration(input), interrupted); assert.throws(() => current.startPolicyGeneration(input.id, interrupted.revision), /cannot start/);
		assert.throws(() => current.sealPolicyGeneration(input.id, interrupted.response), /Only the exact running/);
		const old = current.snapshot().attempts[0]; current.settle({ ...old, revision: old.revision + 1, usageState: 'confirmed', tokens: { ...emptyTokens(), total: 13 }, diagnostic: null });
		assert.equal(current.policyAccounting(policyId).totalTokens, 13); assert.equal(current.policyGeneration(input.id)!.status, 'interrupted'); assert.equal(current.policyVersions(policyId).length, 1);
		const idle = { ...input, id: randomUUID() }; current.authorizePolicyGeneration(idle); current.close(); current = openStore(file); assert.equal(current.policyGeneration(idle.id)!.status, 'interrupted'); assert.equal(current.snapshot().attempts.length, 1);
	} finally { close(current, dir); }
});

test('cancellation and deadline dispose the native proposer and retain unknown usage without a candidate', { timeout: 3000 }, async () => {
	for (const cancel of [true, false]) {
		const { dir, store, input } = setup();
		try {
			const request = { ...input, id: randomUUID(), budget: { ...budget, maxDurationMs: cancel ? 5000 : 200 } }; store.authorizePolicyGeneration(request);
			const abort = new AbortController(); const timer = cancel ? setTimeout(() => abort.abort(), 20) : undefined;
			try { const result = await runPolicyGenerationFixture(store, request.id, 'hang', abort.signal); assert.equal(result.generation.status, 'cancelled'); assert.equal(result.generation.candidateDigest, null); assert.equal(result.requests.length, 1); assert.equal(result.cleanup.contextDisposed, true); } finally { clearTimeout(timer); }
			assert.equal(store.snapshot().attempts[0].usageState, 'unknown');
		} finally { close(store, dir); }
	}
});

test('failed filesystem publication keeps response/costs without a committed candidate; a new authorization can recover', async () => {
	const seed = setup(); let instructions: string;
	try { instructions = policyGenerationResponseSchema.parse(JSON.parse((await runPolicyGenerationFixture(seed.store, seed.input.id)).generation.response)).instructions; } finally { close(seed.store, seed.dir); }
	const { dir, store, input, policyId } = setup();
	try {
		const digest = policyDigest({ schemaVersion: 1, kind: 'repository-evidence-policy', instructions }); const path = join(dir, 'policies', `${digest}.json`); writeFileSync(path, '{}', { mode: 0o444 });
		const failed = await runPolicyGenerationFixture(store, input.id); assert.equal(failed.generation.status, 'failed'); assert.ok(failed.generation.response.includes(instructions));
		assert.equal(store.policyVersions(policyId).length, 1); assert.equal(store.policyAccounting(policyId).totalTokens, 13); assert.equal(readFileSync(path, 'utf8'), '{}');
		chmodSync(path, 0o644); unlinkSync(path);
		const next = { ...input, id: randomUUID() }; store.authorizePolicyGeneration(next); const result = await runPolicyGenerationFixture(store, next.id);
		assert.equal(result.generation.status, 'sealed'); assert.equal(store.policyVersions(policyId).at(-1)!.generationId, next.id); assert.equal(store.policyAccounting(policyId).totalTokens, 26); assert.deepEqual(store.policyGeneration(input.id), failed.generation);
	} finally { close(store, dir); }
});

test('adding generation storage preserves old v7 rows and invalid generation records fail without rewriting history', () => {
	const { dir, file, store, input } = setup();
	try {
		store.close(); let raw = new DatabaseSync(file); raw.exec('DROP TABLE policy_generations');
		const tables = ['state', 'g1_state', 'attempts', 'operations', 'g1_operations', 'bindings', 'policy_versions', 'policy_batches'];
		const rows = () => Object.fromEntries(tables.map(table => [table, raw.prepare(`SELECT * FROM ${table}`).all()]));
		const before = rows(); raw.close(); const upgraded = openStore(file); assert.equal(upgraded.policyGeneration(input.id), undefined); upgraded.close();
		raw = new DatabaseSync(file); assert.deepEqual(rows(), before); raw.prepare('INSERT INTO policy_generations VALUES (?,?)').run(input.id, '{invalid'); raw.close();
		assert.throws(() => openStore(file)); raw = new DatabaseSync(file); assert.deepEqual(rows(), before); assert.equal(raw.prepare('PRAGMA user_version').get()!.user_version, 7); raw.close();
	} finally { close(store, dir); }
});
