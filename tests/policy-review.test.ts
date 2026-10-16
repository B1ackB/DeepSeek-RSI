import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SessionId } from '@deepseek-ai/dsh-session';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { openStore, type Store } from '../src/store.ts';
import { policySessionId, policyCommandSchema, type PolicyCommand } from '../src/policy-review-contracts.ts';
import { emptyTokens, type Attempt } from '../src/contracts.ts';
import { observeUsage } from '../src/usage.ts';
import { policyTools, POLICY_AUTHORITY } from '../src/policy.ts';
import { preparePolicyReviewFixture, policyReviewRuntime } from '../scripts/policy-review-fixture.ts';

const source = mkdtempSync(join(tmpdir(), 'rsi-review-source-')); const sourceFile = join(source, 'state.sqlite');
before(async () => { await preparePolicyReviewFixture(sourceFile); });
after(() => rmSync(source, { recursive: true, force: true }));
function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-review-')); cpSync(source, dir, { recursive: true }); const file = join(dir, 'state.sqlite'); const store = openStore(file);
	return { dir, file, store, close() { try { store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); } };
}
function command(store: Store, kind: PolicyCommand['kind'], payload: PolicyCommand['payload']): PolicyCommand { return policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload }); }
function adopt(store: Store, choice: 'baseline' | 'candidate' = 'baseline', workspaceId = 'workspace') {
	const review = store.policyReview().reviews[0];
	return command(store, 'policy_adopt', { workspaceId, policyId: review.policyId, batchId: review.batchId, baselineDigest: review.baselineDigest, candidateDigest: review.candidateDigest, evidenceDigest: review.evidenceDigest!, choice, expectedActive: store.policySelection(workspaceId)?.id ?? null });
}
function makeSession(store: Store) { return command(store, 'policy_session', { workspaceId: 'workspace', expectedActive: store.policySelection('workspace')!.id }); }
function message() { return createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Explain total from source and cite the implementation.' }] }); }

test('review is free; adoption binds exact pair/batch/evidence, receipts survive restart and ABA conflicts', () => {
	const f = setup(); let store = f.store;
	try {
		const rows = store.snapshot().attempts; const view = store.policyReview(); assert.equal(view.reviews[0].eligible, true); assert.equal(view.reviews[0].generationId !== null, true); assert.equal(view.choices.length, 0); assert.deepEqual(store.snapshot().attempts, rows);
		const input = adopt(store); const receipt = store.policyCommand(input, f.dir); assert.equal(store.policySelection('workspace')!.digest, view.reviews[0].baselineDigest);
		assert.deepEqual(store.policyCommand(input, f.dir), receipt);
		assert.throws(() => store.policyCommand({ ...input, payload: { ...input.payload, choice: 'candidate' } }, f.dir), /不同内容/);
		const stale = adopt(store, 'candidate'); const fresh = adopt(store, 'candidate'); store.policyCommand(fresh, f.dir);
		assert.throws(() => store.policyCommand(stale, f.dir), /状态已变化/);
		const restore = command(store, 'policy_restore', { workspaceId: 'workspace', targetChoiceId: input.operationId, expectedActive: fresh.operationId }); store.policyCommand(restore, f.dir);
		assert.throws(() => store.policyCommand({ ...stale, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision }, f.dir), /已采纳版本已变化/);
		store.close(); store = openStore(f.file); assert.deepEqual(store.policyCommand(input, f.dir), receipt); assert.equal(store.policySelection('workspace')!.id, restore.operationId); assert.deepEqual(store.snapshot().attempts, rows);
		const wrong = adopt(store, 'candidate'); if (wrong.kind !== 'policy_adopt') throw new Error();
		for (const change of [{ batchId: randomUUID() }, { baselineDigest: 'a'.repeat(64) }, { candidateDigest: 'b'.repeat(64) }, { evidenceDigest: 'c'.repeat(64) }, { policyId: randomUUID() }]) assert.throws(() => store.policyCommand({ ...wrong, operationId: randomUUID(), payload: { ...wrong.payload, ...change } }, f.dir));
	} finally { store.close(); f.close(); }
});

test('restoration requires a same-workspace explicit approval; rejected commands cannot alter active choice', () => {
	const f = setup();
	try {
		const candidate = adopt(f.store, 'candidate'); f.store.policyCommand(candidate, f.dir);
		for (const targetChoiceId of [randomUUID(), f.store.policyReview().reviews[0].batchId]) assert.throws(() => f.store.policyCommand(command(f.store, 'policy_restore', { workspaceId: 'workspace', expectedActive: candidate.operationId, targetChoiceId }), f.dir), /明确采纳/);
		const other = adopt(f.store, 'baseline', 'other'); f.store.policyCommand(other, f.dir);
		assert.throws(() => f.store.policyCommand(command(f.store, 'policy_restore', { workspaceId: 'workspace', expectedActive: candidate.operationId, targetChoiceId: other.operationId }), f.dir), /明确采纳/);
		assert.throws(() => f.store.policyCommand(adopt(f.store), '/moved-workspace'), /路径已经变化/);
		assert.equal(f.store.policySelection('workspace')!.id, candidate.operationId);
		assert.equal(policyCommandSchema.safeParse({ ...adopt(f.store), evaluator: 'pass' }).success, false);
	} finally { f.close(); }
});

test('restoration survives a damaged other object while selected bytes and original evidence remain mandatory', () => {
	for (const mode of ['other-damaged', 'other-missing', 'selected-damaged', 'evidence', 'usage']) {
		const f = setup(); let store = f.store;
		try {
			const baseline = adopt(store); store.policyCommand(baseline, f.dir);
			const candidate = adopt(store, 'candidate'); store.policyCommand(candidate, f.dir);
			const review = store.policyReview().reviews[0]; store.close();
			if (mode === 'evidence' || mode === 'usage') {
				const db = new DatabaseSync(f.file);
				if (mode === 'evidence') { const batch = JSON.parse(String(db.prepare('SELECT data FROM policy_batches WHERE id=?').get(review.batchId)!.data)); batch.evidence[0].cleanup.directoryRemoved = false; db.prepare('UPDATE policy_batches SET data=? WHERE id=?').run(JSON.stringify(batch), review.batchId); }
				else { const row = db.prepare("SELECT id,data FROM attempts WHERE json_extract(data,'$.ownerId')=? LIMIT 1").get(review.batchId)!; const value = JSON.parse(String(row.data)); value.usageState = 'unknown'; db.prepare('UPDATE attempts SET data=? WHERE id=?').run(JSON.stringify(value), row.id as string); }
				db.close();
			} else {
				const path = join(f.dir, 'policies', `${mode === 'selected-damaged' ? review.baselineDigest : review.candidateDigest}.json`);
				if (mode === 'other-missing') rmSync(path); else { chmodSync(path, 0o600); writeFileSync(path, 'damaged object'); chmodSync(path, 0o400); }
			}
			store = openStore(f.file); assert.equal(store.policyReview().reviews[0].eligible, false);
			assert.throws(() => store.policyCommand(adopt(store), f.dir));
			const restore = command(store, 'policy_restore', { workspaceId: 'workspace', expectedActive: candidate.operationId, targetChoiceId: baseline.operationId });
			if (mode.startsWith('other-')) {
				store.policyCommand(restore, f.dir); const receipt = store.policyCommand(makeSession(store), f.dir);
				assert.equal(store.policySessionRun(policySessionId(receipt.focusId!))!.policyDigest, review.baselineDigest);
				assert.equal(store.policySelection('workspace')!.digest, review.baselineDigest); assert.equal(store.policyReview().choices.length, 3);
			} else {
				assert.throws(() => store.policyCommand(restore, f.dir)); assert.equal(store.policySelection('workspace')!.id, candidate.operationId); assert.equal(store.policyReview().choices.length, 2);
			}
			assert.equal(store.snapshot().attempts.length, 7);
		} finally { store.close(); f.close(); }
	}
});

test('incomplete or changed evidence, unknown usage and corrupt objects block evaluated adoption', () => {
	for (const mode of ['unknown', 'generation', 'response', 'evidence', 'cleanup', 'object', 'unevaluated']) {
		const f = setup(); const input = adopt(f.store); const review = f.store.policyReview().reviews[0]; f.store.close();
		try {
			const db = new DatabaseSync(f.file);
			if (mode === 'generation') { const row = db.prepare("SELECT id,data FROM attempts WHERE json_extract(data,'$.purpose')='generation'").get(); const value = JSON.parse(String(row!.data)); value.usageState = 'unknown'; db.prepare('UPDATE attempts SET data=? WHERE id=?').run(JSON.stringify(value), row!.id as string); }
			if (mode === 'response') { const row = db.prepare('SELECT id,data FROM policy_generations').get()!; const value = JSON.parse(String(row.data)); value.response = '{bad'; db.prepare('UPDATE policy_generations SET data=? WHERE id=?').run(JSON.stringify(value), row.id as string); }
			if (mode === 'unknown') { const row = db.prepare("SELECT id,data FROM attempts WHERE json_extract(data,'$.ownerId')=? LIMIT 1").get(review.batchId)!; const attempt = JSON.parse(String(row.data)); attempt.usageState = 'unknown'; db.prepare('UPDATE attempts SET data=? WHERE id=?').run(JSON.stringify(attempt), row.id as string); }
			if (['evidence', 'cleanup', 'unevaluated'].includes(mode)) { const batch = JSON.parse(String(db.prepare('SELECT data FROM policy_batches WHERE id=?').get(review.batchId)!.data)); if (mode === 'unevaluated') delete batch.evaluation; else if (mode === 'cleanup') batch.evidence[0].cleanup.directoryRemoved = false; else batch.evidence[0].result.finalResponse = 'changed'; db.prepare('UPDATE policy_batches SET data=? WHERE id=?').run(JSON.stringify(batch), review.batchId); }
			db.close();
			if (mode === 'object') { const path = join(f.dir, 'policies', `${review.candidateDigest}.json`); chmodSync(path, 0o600); writeFileSync(path, 'corrupt'); chmodSync(path, 0o400); }
			const store = openStore(f.file); try { assert.equal(store.policyReview().reviews[0].eligible, false, mode); assert.notEqual(store.policyReview().reviews[0].status, 'passed'); assert.throws(() => store.policyCommand({ ...input, expectedRevision: store.snapshot().snapshotRevision }, f.dir)); assert.equal(store.policySelection('workspace'), undefined); } finally { store.close(); }
		} finally { f.close(); }
	}
});

test('complete but incorrect full-task results remain a visible user decision', { timeout: 15000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-quality-review-')); const file = join(dir, 'state.sqlite');
	try { await preparePolicyReviewFixture(file, ['complete', 'wrong_answer']); const store = openStore(file); try { const review = store.policyReview().reviews[0]; assert.equal(review.status, 'failed'); assert.equal(review.eligible, true); store.policyCommand(adopt(store, 'candidate'), dir); assert.equal(store.policySelection('workspace')!.digest, review.candidateDigest); } finally { store.close(); } } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('native first requests retain old bindings; new sessions inherit adoption/restore and scoped tools are enforced', { timeout: 15000 }, async () => {
	const f = setup(); const runtime = await policyReviewRuntime(f.store, f.dir);
	try {
		let forbidden = 0; runtime.ctx.tools.register({ name: 'forbidden', description: 'forbidden', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => { forbidden++; return 'forbidden'; } });
		await assert.rejects(runtime.review.command({ ...adopt(f.store), payload: { ...adopt(f.store).payload, workspaceId: 'missing' } }), /登记工作区/);
		const first = adopt(f.store); await runtime.review.command(first);
		const session = makeSession(f.store); const old = (await runtime.review.command(session)).focusId!; const oldId = policySessionId(old);
		assert.equal(runtime.requests.length, 0); const bound = f.store.policySession(oldId)!;
		const second = adopt(f.store, 'candidate'); await runtime.review.command(second); const newer = (await runtime.review.command(makeSession(f.store))).focusId!;
		assert.deepEqual(f.store.policySession(oldId), bound); assert.equal((await runtime.review.command(session)).focusId, old);
		for (const [id, digest] of [[oldId, bound.policyDigest], [policySessionId(newer), f.store.policyReview().reviews[0].candidateDigest]]) {
			const agent = runtime.ctx.agents.get(SessionId(id))!;
			const denied = await runtime.ctx.tools.execute({ agent, name: 'forbidden', arguments: {}, callId: ToolCallId(randomUUID()), signal: new AbortController().signal }); assert.equal(denied.isError, true);
			agent.followup(message()); await agent.whenIdle(); const seen = runtime.requests.filter(row => row.sessionId === id);
			assert.equal(seen.length, 3, JSON.stringify(agent.session.snapshotEvents().slice(-6))); assert.ok(seen[0].system!.includes(f.store.policyContent(bound.policyId, digest).instructions)); assert.ok(seen[0].system!.includes('Trusted test authority.'));
			assert.deepEqual((seen[0].tools as Array<{ name: string }>).map(row => row.name), ['rsi_read', 'rsi_search']);
			assert.equal(agent.session.snapshotEvents().at(-1)!.type, 'turn/end'); assert.equal(agent.session.snapshotEvents().filter(event => event.type === 'tool/result').length, 2);
			assert.ok(JSON.stringify(seen[2].messages).includes('return value + 1'));
		}
		const restore = command(f.store, 'policy_restore', { workspaceId: 'workspace', expectedActive: second.operationId, targetChoiceId: first.operationId }); await runtime.review.command(restore);
		const restored = (await runtime.review.command(makeSession(f.store))).focusId!; assert.equal(f.store.policySession(policySessionId(restored))!.policyDigest, bound.policyDigest);
		const agent = runtime.ctx.agents.get(SessionId(policySessionId(restored)))!; agent.followup(message()); await agent.whenIdle(); assert.equal(runtime.requests.filter(row => row.sessionId === agent.id).length, 3);
		assert.equal(forbidden, 0); assert.equal(f.store.policyAccounting(bound.policyId).totalTokens, 238); assert.equal(f.store.policyAccounting(bound.policyId, bound.batchId).totalTokens, 90);
		const ordinary = await runtime.ctx.agents.create({ sessionId: SessionId('ordinary-existing'), meta: { cwd: f.dir } }); const text = JSON.stringify(await ordinary.agent.ctx.systemPrompt.assemble()); assert.equal(text.includes('rsi-execution-policy'), false); await ordinary.dispose();
	} finally { const cleanup = await runtime.dispose(); assert.equal(cleanup.agents, 0); f.close(); }
});

test('native JSONL resume uses the original policy, does not replay, and missing binding fails before publication', { timeout: 10000 }, async () => {
	const f = setup(); let runtime = await policyReviewRuntime(f.store, f.dir);
	try {
		await runtime.review.command(adopt(f.store)); const session = (await runtime.review.command(makeSession(f.store))).focusId!; const id = policySessionId(session); const binding = f.store.policySession(id)!;
		const agent = runtime.ctx.agents.get(SessionId(id))!; agent.followup(message()); await agent.whenIdle(); const events = agent.session.snapshotEvents();
		await runtime.review.command(adopt(f.store, 'candidate')); await runtime.dispose();
		runtime = await policyReviewRuntime(f.store, f.dir); await runtime.review.open(id); const resumed = runtime.ctx.agents.get(SessionId(id))!;
		assert.equal(runtime.requests.length, 0); assert.deepEqual(resumed.session.snapshotEvents().slice(0, events.length), events); assert.deepEqual(f.store.policySession(id), binding);
		const prompt = JSON.stringify(await runtime.ctx.systemPrompt.assemble({ scope: resumed })); assert.ok(prompt.includes(f.store.policyContent(binding.policyId, binding.policyDigest).instructions));
		await assert.rejects(runtime.ctx.agents.create({ sessionId: SessionId(policySessionId(randomUUID())), meta: { cwd: f.dir } }), /绑定缺失/);
		assert.equal(runtime.ctx.agents.roots().length, 1);
	} finally { await runtime.dispose(); f.close(); }
});

test('native UI-style resume preserves the cap and original binding before the session first request', { timeout: 10000 }, async () => {
	const f = setup(); let runtime = await policyReviewRuntime(f.store, f.dir);
	try {
		await runtime.review.command(adopt(f.store)); const id = policySessionId((await runtime.review.command(makeSession(f.store))).focusId!); const original = f.store.policySession(id)!;
		await runtime.review.command(adopt(f.store, 'candidate')); await runtime.dispose(); runtime = await policyReviewRuntime(f.store, f.dir);
		const handle = await runtime.ctx.agents.resume({ resumeSessionId: SessionId(id), agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, setup: scoped => { installModelSelection(scoped, { current: { provider: 'rsi-policy-fixture', model: 'offline-v1' }, assembled: undefined }); } });
		try {
			assert.equal(runtime.requests.length, 0); handle.agent.followup(message()); await handle.agent.whenIdle();
			assert.equal(runtime.requests.length, 3, JSON.stringify(handle.agent.session.snapshotEvents().at(-1)));
			assert.deepEqual(f.store.policySession(id), original);
			assert.ok(runtime.requests[0].system!.includes(f.store.policyContent(original.policyId, original.policyDigest).instructions));
		} finally { await handle.dispose(); }
	} finally { await runtime.dispose(); f.close(); }
});

test('route/tools/output changes cannot dispatch; unknown usage blocks further daily work and keeps batch accounting separate', { timeout: 10000 }, async () => {
	const f = setup(); const runtime = await policyReviewRuntime(f.store, f.dir, 'unknown');
	try {
		await runtime.review.command(adopt(f.store)); const id = policySessionId((await runtime.review.command(makeSession(f.store))).focusId!); const run = f.store.policySessionRun(id)!;
		const tools = policyTools(run).map(({ name, description, parameters }) => ({ name, description, parameters })).sort((a, b) => a.name < b.name ? -1 : 1);
		const options: GenerateOptions = { provider: run.conditions.provider, model: run.conditions.model, sessionId: SessionId(id), maxTokens: run.conditions.budget.maxOutputTokens, system: `${POLICY_AUTHORITY}\n\n${run.policy.instructions}`, tools, messages: [message()] };
		let dispatched = 0; const observer = observeUsage(f.store, new Set());
		for (const change of [{ provider: 'deepseek-official' }, { maxTokens: 4096 }, { tools: [] }, { system: POLICY_AUTHORITY }, { purpose: 'compaction' }]) await assert.rejects(async () => { for await (const _ of observer({ ...options, ...change } as GenerateOptions, async function* () { dispatched++; yield { type: 'finish', reason: { kind: 'stop' } } as StreamChunk; })) {} });
		assert.equal(dispatched, 0); const agent = runtime.ctx.agents.get(SessionId(id))!; agent.followup(message()); await agent.whenIdle(); assert.equal(runtime.requests.length, 1);
		const binding = f.store.policySession(id)!; assert.equal(f.store.policyAccounting(binding.policyId).totalTokens, null); assert.equal(f.store.policyAccounting(binding.policyId, binding.batchId).totalTokens, 90);
		assert.equal(f.store.snapshot().attempts.at(-1)!.owner, 'session'); assert.equal(f.store.snapshot().attempts.at(-1)!.purpose, 'daily');
	} finally { await runtime.dispose(); f.close(); }
});

test('choice/receipt commit atomically, lost replies and pre-Agent interruptions recover without model replay', { timeout: 10000 }, async () => {
	const f = setup(); const input = adopt(f.store); f.store.close();
	try {
		const db = new DatabaseSync(f.file); db.exec("CREATE TRIGGER receipt_failure BEFORE INSERT ON g1_operations BEGIN SELECT RAISE(ABORT,'controlled receipt failure'); END"); db.close();
		let store = openStore(f.file); assert.throws(() => store.policyCommand(input, f.dir), /controlled receipt failure/); assert.equal(store.policySelection('workspace'), undefined); store.close();
		const remove = new DatabaseSync(f.file); remove.exec('DROP TRIGGER receipt_failure'); remove.close();
		const code = `import {openStore} from ${JSON.stringify(resolve('src/store.ts'))}; const s=openStore(${JSON.stringify(f.file)}); s.policyCommand(${JSON.stringify(input)},${JSON.stringify(f.dir)}); process.exit(77);`;
		const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }); assert.equal(child.status, 77, child.stderr);
		store = openStore(f.file); assert.equal(store.policyCommand(input, f.dir).focusId, input.operationId); const session = makeSession(store); const receipt = store.policyCommand(session, f.dir); const count = store.snapshot().attempts.length; store.close();
		store = openStore(f.file); const runtime = await policyReviewRuntime(store, f.dir);
		try { const recovered = await runtime.review.command(session); assert.deepEqual(recovered, receipt); assert.equal(runtime.ctx.agents.roots().length, 1); assert.equal(runtime.requests.length, 0); assert.equal(store.snapshot().attempts.length, count); assert.equal(store.policyReview().sessions.length, 1); } finally { await runtime.dispose(); store.close(); }
	} finally { f.close(); }
});

test('interrupted daily requests retain original bindings and unknown usage; recovery cannot replay or restart their budget', { timeout: 10000 }, async () => {
	const f = setup(); let store = f.store; let runtime = await policyReviewRuntime(store, f.dir, 'hang');
	try {
		await runtime.review.command(adopt(store)); const input = makeSession(store); const id = policySessionId((await runtime.review.command(input)).focusId!); const binding = store.policySession(id)!;
		const agent = runtime.ctx.agents.get(SessionId(id))!;
		agent.followup(message());
		// Wait for the durable in-flight attempt.
		while (!runtime.requests.length) await new Promise(resolve => setImmediate(resolve));
		assert.equal(store.snapshot().attempts.at(-1)!.state, 'in_flight');
		await runtime.dispose(); store.close(); store = openStore(f.file); runtime = await policyReviewRuntime(store, f.dir);
		assert.equal(runtime.requests.length, 0); assert.deepEqual(store.policySession(id), binding); const recovered = store.snapshot().attempts.at(-1)!; assert.ok(['interrupted', 'cancelled'].includes(recovered.state)); assert.equal(recovered.usageState, 'unknown'); assert.equal(store.policyAccounting(binding.policyId).totalTokens, null);
		await runtime.review.open(id); const resumed = runtime.ctx.agents.get(SessionId(id))!; resumed.followup(message()); await resumed.whenIdle(); assert.equal(runtime.requests.length, 0); assert.equal(store.snapshot().attempts.filter(row => row.sessionId === id).length, 1);
		store.settle({ ...recovered, revision: recovered.revision + 1, usageState: 'confirmed', tokens: { ...emptyTokens(), total: 15 }, usageSource: 'provider' });
		const pending = { ...recovered, attemptId: randomUUID(), revision: 1, state: 'reserved' as const, startedAt: null, endedAt: null };
		assert.throws(() => store.reserve(pending), /上次执行未完成/);
	} finally { await runtime.dispose(); store.close(); f.close(); }
});

test('workspace attachment failure keeps the exact session intent and retries without creating or running another Agent', async () => {
	const f = setup(); const runtime = await policyReviewRuntime(f.store, f.dir);
	try {
		await runtime.review.command(adopt(f.store)); const input = makeSession(f.store); const workspace = runtime.ctx.workspaceRegistry.list()[0]; let attachments = 0;
		workspace.attachSession = async () => { if (++attachments === 1) throw new Error('controlled workspace attachment failure'); };
		runtime.ctx.workspaceRegistry.list = () => [workspace];
		await assert.rejects(runtime.review.command(input), /controlled workspace/); const binding = f.store.policyReview().sessions[0];
		assert.equal(runtime.ctx.agents.roots().length, 1); assert.equal(runtime.requests.length, 0);
		const receipt = await runtime.review.command(input); assert.equal(policySessionId(receipt.focusId!), binding.sessionId); assert.deepEqual(f.store.policyReview().sessions, [binding]); assert.equal(attachments, 2); assert.equal(runtime.requests.length, 0);
	} finally { const cleanup = await runtime.dispose(); assert.equal(cleanup.agents, 0); f.close(); }
});

test('v6/v7 additive upgrade preserves old terminal bytes and validates new binding references', () => {
	for (const version of [6, 7]) {
		const f = setup(); const input = adopt(f.store); f.store.close();
		try {
			const db = new DatabaseSync(f.file); const before = db.prepare('SELECT data FROM g1_state').get()!.data; const attempts = db.prepare('SELECT data FROM attempts ORDER BY rowid').all(); db.exec(`DROP TABLE policy_choices; DROP TABLE policy_sessions; PRAGMA user_version=${version}`); db.close();
			const store = openStore(f.file); store.policyCommand(input, f.dir); store.policyCommand(makeSession(store), f.dir); store.close();
			const after = new DatabaseSync(f.file); assert.equal(after.prepare('SELECT data FROM g1_state').get()!.data, before); assert.deepEqual(after.prepare('SELECT data FROM attempts ORDER BY rowid').all(), attempts);
			const row = after.prepare('SELECT session,data FROM policy_sessions').get()!; const value = JSON.parse(String(row.data)); value.choiceId = randomUUID(); after.prepare('UPDATE policy_sessions SET data=?').run(JSON.stringify(value)); after.close();
			assert.throws(() => openStore(f.file), /binding provenance/);
		} finally { f.close(); }
	}
});
