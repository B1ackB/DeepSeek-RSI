import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import childProcesses, { spawn } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, realpathSync, mkdirSync, cpSync, writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { openStore, type Store } from '../src/store.ts';
import { policyCommandSchema, type PolicyCommand } from '../src/policy-review-contracts.ts';
import { policySourceCaseSchema } from '../src/policy-inputs.ts';
import { policyDigest } from '../src/policy-contracts.ts';
import { manualSourceQuestion } from '../src/policy-manual-qa.ts';
import { validatePolicyEvaluation } from '../src/policy-evaluation.ts';
import { policyQaQuestionsSchema } from '../src/policy-qa-inputs.ts';
import { policyProcessInputSchema } from '../src/policy-process-contracts.ts';
import { g1SnapshotSchema } from '../src/g1-contracts.ts';
import { policyExecutionRuntime, executeAuthorizedPolicyBatch } from '../src/policy-execution.ts';
import { preparePolicyReviewFixture, policyReviewRuntime } from '../scripts/policy-review-fixture.ts';
import { registerPolicyGenerationAdapter } from '../scripts/policy-generation.ts';

const seed = mkdtempSync(join(tmpdir(), 'rsi-manual-qa-seed-'));
before(async () => { await preparePolicyReviewFixture(join(seed, 'state.sqlite')); });
after(() => rmSync(seed, { recursive: true, force: true }));
const questions = policyQaQuestionsSchema.parse({
	symbol: { question: 'Locate the implementation used by run.', answer: { status: 'sufficient', claims: [{ fact: 'definition', value: 'HELD_OUT_MANUAL: calc.js defines compute', citations: [{ path: 'calc.js', startLine: 1, endLine: 1 }, { path: 'entry.js', startLine: 1, endLine: 2 }] }] } },
	'call-chain': { question: 'Trace run(2) through its calculation.', answer: { status: 'sufficient', claims: [{ fact: 'edge', value: 'HELD_OUT_MANUAL: run calls compute; run(2) is 4', citations: [{ path: 'entry.js', startLine: 1, endLine: 2 }, { path: 'calc.js', startLine: 3, endLine: 3 }] }] } },
	'error-path': { question: 'Trace run(-1) through error propagation.', answer: { status: 'sufficient', claims: [{ fact: 'failure', value: 'HELD_OUT_MANUAL: negative throws INVALID; run propagates', citations: [{ path: 'calc.js', startLine: 2, endLine: 2 }, { path: 'entry.js', startLine: 2, endLine: 2 }] }] } },
});
function cmd(store: Store, kind: PolicyCommand['kind'], payload: PolicyCommand['payload']) { return policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload }); }
async function fixture(mode: Parameters<typeof policyReviewRuntime>[2] = 'complete') {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'rsi-manual-qa-'))); cpSync(seed, root, { recursive: true }); mkdirSync(join(root, '.git'));
	writeFileSync(join(root, 'entry.js'), "import { compute } from './calc.js';\nexport const run = value => compute(value);\n");
	writeFileSync(join(root, 'calc.js'), "export function compute(value) {\n\tif (value < 0) throw new Error('INVALID');\n\treturn value * 2;\n}\n");
	const file = join(root, 'state.sqlite'); const store = openStore(file); const proof = store.policyReview().reviews[0];
	store.policyCommand(cmd(store, 'policy_adopt', { workspaceId: 'workspace', policyId: proof.policyId, batchId: proof.batchId, baselineDigest: proof.baselineDigest, candidateDigest: proof.candidateDigest, evidenceDigest: proof.evidenceDigest!, choice: 'baseline', expectedActive: null }), root);
	const choice = store.policySelection('workspace')!; const runtime = await policyReviewRuntime(store, root, mode); const generator = registerPolicyGenerationAdapter(runtime.ctx, store);
	const preview = await runtime.review.command(cmd(store, 'policy_preview', { workspaceId: 'workspace', expectedActive: choice.id, paths: ['entry.js', 'calc.js'] }));
	const source = store.policySource(preview.focusId!)!; const intent = { workspaceId: 'workspace', expectedActive: choice.id, sourceId: source.id, snapshotDigest: source.conditions.sourceSnapshot!.digest };
	await runtime.review.command(cmd(store, 'policy_seal', intent));
	return { root, file, store, runtime, generator, choice, source, intent, async close() { if (runtime.ctx.agents) await runtime.dispose(); try { store.close(); } catch {} rmSync(root, { recursive: true, force: true }); } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function draft(f: Fixture, parentId: string | null = null, input = questions) { const command = cmd(f.store, 'policy_qa_draft', { ...f.intent, questions: input, parentId }); const receipt = await f.runtime.review.command(command); return { pack: f.store.policyQaPack(receipt.focusId!)!, command, receipt }; }
async function seal(f: Fixture) { const saved = await draft(f); const command = cmd(f.store, 'policy_qa_seal', { ...f.intent, packId: saved.pack.id, packDigest: saved.pack.digest }); await f.runtime.review.command(command); return { ...saved, seal: command, pack: f.store.policyQaPack(saved.pack.id)! }; }
async function generate(f: Fixture, requirements = 'Read exact implementation and cite observed lines.') { const command = cmd(f.store, 'policy_generate', { ...f.intent, baselineDigest: f.choice.digest, requirements, budget: { provider: 'rsi-policy-generation-fixture', model: 'offline-v1', maxRequests: 1, maxOutputTokens: 1024, maxInputBytes: 16384, maxDurationMs: 5000 } }); await f.runtime.review.command(command); await f.runtime.review.whenIdle(); return f.store.policyGeneration(command.operationId)!; }
function evaluation(f: Fixture, generationId: string, pack: ReturnType<Store['policyQaPack']>, caseId: 'symbol' | 'call-chain' | 'error-path' = 'symbol') { const task = f.store.policyGeneration(generationId)!; return cmd(f.store, 'policy_evaluate', { ...f.intent, generationId, baselineDigest: task.authorization.baselineDigest, candidateDigest: task.candidateDigest!, packId: pack!.id, packDigest: pack!.digest, caseId, budget: { maxRequests: 8, tokenStopThreshold: 1000, maxDurationMs: 30000 } }); }
async function until(check: () => boolean) { for (let i = 0; i < 200; i++) { if (check()) return; await delay(10); } assert.fail('Owned resource did not reach checkpoint'); }
function cleaned(batch: NonNullable<ReturnType<Store['policyBatch']>>) { for (const row of batch.evidence ?? []) { assert.ok(row.cleanup.processExited && row.cleanup.directoryRemoved && row.cleanup.agentsDisposed); assert.equal(existsSync(row.cleanup.temporaryRoot), false); assert.throws(() => process.kill(row.workerPid!, 0), /ESRCH/); } }

test('manual packs seal exact source questions, isolate oracle, run all three complete pairs and preserve version/session history', { timeout: 20000 }, async t => {
	const f = await fixture();
	const sends: Array<() => unknown[]> = []; const nativeFork = childProcesses.fork;
	const forkSpy = t.mock.method(childProcesses, 'fork', (...args: Parameters<typeof nativeFork>) => { const child = nativeFork(...args); const spy = t.mock.method(child, 'send'); sends.push(() => spy.mock.calls.map(call => call.arguments[0])); return child; }); syncBuiltinESMExports();
	try {
		assert.equal(f.store.policyReview().sources.at(-1)!.qaAvailable, undefined);
		const saved = await seal(f); assert.equal(saved.pack.status, 'sealed'); assert.equal(f.runtime.requests.length, 0); assert.equal(f.generator.length, 0);
		assert.deepEqual(f.runtime.review.qa({ workspaceId: 'workspace', packId: saved.pack.id }), saved.pack);
		assert.throws(() => f.runtime.review.qa({ workspaceId: 'other', packId: saved.pack.id }));
		assert.equal(JSON.stringify(f.store.policyReview().qaPacks).includes('HELD_OUT_MANUAL'), false);
		const task = await generate(f); assert.equal(task.status, 'sealed'); assert.equal(JSON.stringify(f.generator).includes('HELD_OUT_MANUAL'), false); assert.equal(JSON.stringify(f.generator).includes(questions.symbol.question), false); assert.deepEqual(f.generator[0].tools, []);
		const oldSession = f.store.policyCommand(cmd(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: f.choice.id }), f.root); const oldBinding = f.store.policySession(`rsi-policy/${oldSession.focusId}`)!;
		writeFileSync(join(f.root, 'calc.js'), 'live changes must not replace sealed content');
		for (const caseId of policySourceCaseSchema.options) {
			const command = evaluation(f, task.authorization.id, saved.pack, caseId); const receipt = await f.runtime.review.command(command); await f.runtime.review.whenIdle();
			const batch = f.store.policyBatch(receipt.focusId!)!; assert.equal(batch.evaluation!.status, 'passed', JSON.stringify(batch.evidence?.map(row => row.error)));
			assert.deepEqual(batch.authorization.runs[0].run.conditions, batch.authorization.runs[1].run.conditions); assert.equal(batch.authorization.runs[0].run.conditions.sourceSnapshot!.digest, f.intent.snapshotDigest);
			assert.equal(JSON.stringify(batch.authorization.runs).includes('HELD_OUT_MANUAL'), false); assert.equal(new Set(batch.evidence!.map(row => row.workerPid)).size, 2);
			assert.ok(batch.evidence!.every(row => row.result!.events.filter(event => event.type === 'tool/call').length === 3)); cleaned(batch);
			const usage = f.store.policyAccounting(f.choice.policyId, command.operationId); assert.equal(usage.attempts.length, 8); assert.equal(usage.totalTokens, 120);
			assert.deepEqual(await f.runtime.review.command(command), receipt); await f.runtime.review.whenIdle();
		}
		const inputs = sends.flatMap(read => read()).flatMap(raw => { const parsed = policyProcessInputSchema.safeParse(raw); return parsed.success && parsed.data.type === 'run' ? [parsed.data] : []; });
		assert.equal(inputs.length, 6); assert.equal(JSON.stringify(inputs).includes('HELD_OUT_MANUAL'), false); assert.ok(inputs.every(row => Object.keys(row).join(',') === 'type,run' && !('evaluationSpec' in row.run) && !('packId' in row.run)));
		assert.equal(f.runtime.requests.length, 24); assert.equal(f.generator.length, 1); assert.equal(f.store.policySelection('workspace')!.id, f.choice.id);
		const changed = structuredClone(questions); changed.symbol.answer.claims[0].value = 'A separately reviewed answer for the next version';
		const revised = await draft(f, saved.pack.id, changed); assert.notEqual(revised.pack.digest, saved.pack.digest); assert.ok(f.store.policyReview().reviews.slice(1).every(row => row.status === 'passed')); assert.equal(revised.pack.parentId, saved.pack.id); assert.equal(revised.pack.status, 'draft'); assert.deepEqual(f.store.policyQaPack(saved.pack.id), saved.pack);
		await f.runtime.review.command(cmd(f.store, 'policy_qa_seal', { ...f.intent, packId: revised.pack.id, packDigest: revised.pack.digest })); assert.equal(f.store.policyQaPack(revised.pack.id)!.status, 'sealed'); assert.ok(f.store.policyReview().reviews.slice(1).every(row => row.status === 'passed'));
		const proof = f.store.policyReview().reviews.at(-1)!; await f.runtime.review.command(cmd(f.store, 'policy_adopt', { workspaceId: 'workspace', expectedActive: f.choice.id, policyId: proof.policyId, batchId: proof.batchId, baselineDigest: proof.baselineDigest, candidateDigest: proof.candidateDigest, evidenceDigest: proof.evidenceDigest!, choice: 'candidate' }));
		const active = f.store.policySelection('workspace')!; const created = await f.runtime.review.command(cmd(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: active.id }));
		const binding = f.store.policySession(`rsi-policy/${created.focusId}`)!; assert.equal(f.store.policySessionRun(binding.sessionId)!.conditionsDigest, binding.conditionsDigest);
		await f.runtime.review.command(cmd(f.store, 'policy_restore', { workspaceId: 'workspace', expectedActive: active.id, targetChoiceId: f.choice.id }));
		assert.deepEqual(f.store.policySession(oldBinding.sessionId), oldBinding); assert.deepEqual(f.store.policySession(binding.sessionId), binding);
		unlinkSync(join(f.root, 'repository-question-packs', saved.pack.digest + '.json')); assert.throws(() => f.store.policySessionRun(binding.sessionId), /ENOENT/); assert.deepEqual(f.store.policySession(binding.sessionId), binding);
	} finally { forkSpy.mock.restore(); syncBuiltinESMExports(); await f.close(); }
});

test('manual pack draft/seal boundaries reject invalid citations, stale authority and mismatches; failed publication transaction is recoverable', async () => {
	const f = await fixture();
	try {
		for (const change of [(q: typeof questions) => { q.symbol.answer.claims[0].citations[0].path = 'absent.js'; }, (q: typeof questions) => { q.symbol.answer.claims[0].citations[0].endLine = 999; }, (q: typeof questions) => { q.symbol.answer.claims.push(structuredClone(q.symbol.answer.claims[0])); }]) {
			const invalid = structuredClone(questions); change(invalid); await assert.rejects(f.runtime.review.command({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: f.store.snapshot().snapshotRevision, kind: 'policy_qa_draft', payload: { ...f.intent, questions: invalid, parentId: null } }));
		}
		const saved = await draft(f); assert.deepEqual(await f.runtime.review.command(saved.command), saved.receipt);
		await assert.rejects(f.runtime.review.command({ ...saved.command, payload: { ...saved.command.payload, parentId: randomUUID() } }), /操作 ID/);
		const task = await generate(f); await assert.rejects(f.runtime.review.command(evaluation(f, task.authorization.id, saved.pack)), /精确问答包/);
		const confirm = cmd(f.store, 'policy_qa_seal', { ...f.intent, packId: saved.pack.id, packDigest: saved.pack.digest });
		for (const change of [{ packDigest: 'a'.repeat(64) }, { sourceId: randomUUID() }, { snapshotDigest: 'b'.repeat(64) }, { expectedActive: randomUUID() }]) await assert.rejects(f.runtime.review.command({ ...confirm, payload: { ...confirm.payload, ...change } }));
		assert.throws(() => f.store.policyCommand({ ...confirm, expectedRevision: 1 }, f.root), /状态已变化/);
		assert.throws(() => f.store.transaction(() => { f.store.policyCommand(confirm, f.root); throw new Error('publication rollback'); }), /publication rollback/);
		assert.equal(f.store.policyQaPack(saved.pack.id)!.status, 'draft'); assert.equal(f.store.businessReceipt(confirm), undefined); assert.equal(existsSync(join(f.root, 'repository-question-packs', saved.pack.digest + '.json')), true);
		await assert.rejects(f.runtime.review.command(evaluation(f, task.authorization.id, saved.pack)), /精确问答包/);
		const receipt = await f.runtime.review.command(confirm); assert.equal(f.store.policyQaPack(saved.pack.id)!.status, 'sealed'); assert.deepEqual(await f.runtime.review.command(confirm), receipt);
		const evalCommand = evaluation(f, task.authorization.id, saved.pack);
		for (const extra of [{ packDigest: 'a'.repeat(64) }, { packId: randomUUID() }, { caseId: undefined }, { evaluator: 'accept-all' }]) await assert.rejects(f.runtime.review.command({ ...evalCommand, payload: { ...evalCommand.payload, ...extra } }));
		assert.equal(f.runtime.requests.length, 0); assert.equal(f.store.policyReview().reviews.length, 1);
		await f.runtime.dispose(); f.store.close(); const reopened = openStore(f.file); try { assert.equal(reopened.policyQaPack(saved.pack.id)!.status, 'sealed'); assert.equal(reopened.policyReview().qaPacks.length, 1); } finally { reopened.close(); }
	} finally { await f.close(); }
});

test('manual QA keeps full-tool, cumulative and unknown-usage gates under quality failures, stop and disposal', { timeout: 25000 }, async () => {
	for (const mode of ['unknown', 'no_tools', 'missing_read', 'forbidden', 'wrong_answer', 'wrong_citation', 'cap', 'tokens', 'stop'] as const) {
		const f = await fixture(mode === 'cap' || mode === 'tokens' ? 'complete' : mode === 'stop' ? 'hang_after_read' : mode);
		try {
			const { pack } = await seal(f); const task = await generate(f); const command = evaluation(f, task.authorization.id, pack, 'error-path'); assert.equal(command.kind, 'policy_evaluate');
			if (mode === 'cap') command.payload.budget.maxRequests = 6; if (mode === 'tokens') command.payload.budget.tokenStopThreshold = 50;
			await f.runtime.review.command(command);
			if (mode === 'stop') { await until(() => f.runtime.requests.length === 3); await f.runtime.review.command(cmd(f.store, 'policy_stop', { workspaceId: 'workspace', target: 'evaluation', jobId: command.operationId })); }
			await f.runtime.review.whenIdle(); const batch = f.store.policyBatch(command.operationId)!;
			assert.equal(batch.evaluation!.status, ['wrong_answer', 'wrong_citation'].includes(mode) ? 'failed' : 'incomplete', mode);
			assert.equal(f.store.policyReview().reviews.at(-1)!.eligible, ['wrong_answer', 'wrong_citation'].includes(mode), mode);
			const usage = f.store.policyAccounting(f.choice.policyId, command.operationId); if (mode === 'unknown') { assert.equal(usage.attempts.length, 1); assert.equal(usage.totalTokens, null); } if (mode === 'cap') assert.equal(usage.attempts.length, 6); if (mode === 'tokens') assert.equal(usage.attempts.length, 4); if (mode === 'stop') { assert.equal(usage.attempts.length, 3); assert.equal(usage.totalTokens, null); assert.equal(batch.status, 'cancelled'); }
			cleaned(batch);
		} finally { await f.close(); }
	}
});

test('manual QA controller loss after reads preserves pack/legacy bytes and unknown usage without replay', { timeout: 15000 }, async () => {
	const f = await fixture();
	try {
		const saved = await seal(f); const task = await generate(f); const command = evaluation(f, task.authorization.id, saved.pack, 'error-path'); await f.runtime.dispose(); f.store.close();
		const db = new DatabaseSync(f.file); const history = ['attempts', 'policy_batches', 'policy_generations', 'policy_choices', 'policy_sessions', 'policy_sources', 'policy_qa_packs', 'g1_operations', 'operations'].map(table => ({ table, rows: db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() })); db.close();
		const code = `import {openStore} from ${JSON.stringify(new URL('../src/store.ts', import.meta.url).pathname)}; import {policyReviewRuntime} from ${JSON.stringify(new URL('../scripts/policy-review-fixture.ts', import.meta.url).pathname)}; const store=openStore(${JSON.stringify(f.file)}); const runtime=await policyReviewRuntime(store,${JSON.stringify(f.root)},'hang_after_read'); await runtime.review.command(${JSON.stringify(command)}); while(runtime.requests.length<3) await new Promise(r=>setTimeout(r,5)); process.exit(77);`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'pipe'] }); let errors = ''; child.stderr.on('data', data => errors += data); assert.equal(await new Promise(resolve => child.once('exit', resolve)), 77, errors);
		const recovered = openStore(f.file); const runtime = await policyReviewRuntime(recovered, f.root);
		try {
			const batch = recovered.policyBatch(command.operationId)!; const resource = batch.progress[0].resource!; assert.equal(batch.status, 'interrupted'); assert.equal(batch.authorization.evaluationSpec!.evaluator, 'repository-source-qa-manual-v1');
			const usage = recovered.policyAccounting(f.choice.policyId, command.operationId); assert.equal(usage.attempts.length, 3); assert.equal(usage.confirmedTokens, 30); assert.equal(usage.totalTokens, null);
			await until(() => { try { process.kill(resource.pid!, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } }); await until(() => !existsSync(resource.temporaryRoot));
			assert.equal((await runtime.review.command(command)).focusId, command.operationId); await runtime.review.whenIdle(); assert.equal(runtime.requests.length, 0); assert.equal(recovered.policyQaPack(saved.pack.id)!.digest, saved.pack.digest);
		} finally { await runtime.dispose(); recovered.close(); }
		const after = new DatabaseSync(f.file); try { for (const { table, rows } of history) for (const row of rows) { const key = table === 'policy_sessions' ? 'session' : 'id'; assert.deepEqual(after.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key] as string), row); } } finally { after.close(); }
	} finally { await f.close(); }
});

test('manual pack authority corruption fails startup without clearing rows; missing pack prevents dispatch and preserves history', async () => {
	const f = await fixture();
	try {
		const saved = await seal(f); const task = await generate(f); const command = evaluation(f, task.authorization.id, saved.pack); f.store.policyCommand(command, f.root, undefined, policyExecutionRuntime()); await f.runtime.dispose(); f.store.close();
		for (const [table, column, id] of [['g1_operations', 'command', saved.seal.operationId], ['policy_qa_packs', 'data', saved.pack.id], ['policy_batches', 'data', command.operationId]] as const) {
			const db = new DatabaseSync(f.file); const raw = String(db.prepare(`SELECT ${column} FROM ${table} WHERE id=?`).get(id)![column]); const value = JSON.parse(raw);
			if (table === 'g1_operations') value.payload.packDigest = 'a'.repeat(64); else if (table === 'policy_qa_packs') value.content.questions.symbol.answer.claims[0].value = 'changed oracle'; else value.authorization.evaluationSpec.packDigest = 'a'.repeat(64);
			const corrupted = JSON.stringify(value); db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(corrupted, id); db.close(); assert.throws(() => openStore(f.file));
			const after = new DatabaseSync(f.file); assert.equal(after.prepare(`SELECT ${column} FROM ${table} WHERE id=?`).get(id)![column], corrupted); after.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(raw, id); after.close();
		}
		const store = openStore(f.file); const runtime = await policyReviewRuntime(store, f.root);
		try {
			assert.equal(store.policyBatch(command.operationId)!.status, 'interrupted'); assert.equal((await runtime.review.command(command)).focusId, command.operationId); await runtime.review.whenIdle(); assert.equal(runtime.requests.length, 0);
			const next = evaluation({ ...f, store }, task.authorization.id, saved.pack); store.policyCommand(next, f.root, undefined, policyExecutionRuntime());
			const object = join(f.root, 'repository-question-packs', saved.pack.digest + '.json'); const bytes = readFileSync(object); unlinkSync(object);
			await assert.rejects(executeAuthorizedPolicyBatch(runtime.ctx, store, next.operationId), /ENOENT/); assert.equal(runtime.requests.length, 0); assert.equal(store.policyAccounting(f.choice.policyId, next.operationId).attempts.length, 0); cleaned(store.policyBatch(next.operationId)!);
			assert.deepEqual(store.policyQaPack(saved.pack.id), saved.pack); assert.equal(policyDigest(JSON.parse(bytes.toString())), saved.pack.digest);
			assert.equal(g1SnapshotSchema.shape.policy.parse(undefined).qaPacks.length, 0);
		} finally { await runtime.dispose(); store.close(); }
	} finally { await f.close(); }
});

test('identical source bytes do not authorize another source record or inherit its question pack', async () => {
	const f = await fixture();
	try {
		const original = await seal(f);
		const preview = await f.runtime.review.command(cmd(f.store, 'policy_preview', { workspaceId: 'workspace', expectedActive: f.choice.id, paths: ['entry.js', 'calc.js'] }));
		const source = f.store.policySource(preview.focusId!)!; const intent = { ...f.intent, sourceId: source.id };
		assert.notEqual(source.id, f.source.id); assert.equal(source.conditions.sourceSnapshot!.digest, f.intent.snapshotDigest);
		await f.runtime.review.command(cmd(f.store, 'policy_seal', intent));
		const next = { ...f, source, intent };
		await assert.rejects(draft(next, original.pack.id), /本快照/);
		const task = await generate(next, 'Read this separately confirmed source record and retain exact citations.');
		const rejected = evaluation(next, task.authorization.id, original.pack);
		await assert.rejects(f.runtime.review.command(rejected), /精确问答包/); assert.equal(f.store.policyBatch(rejected.operationId), undefined); assert.equal(f.store.businessReceipt(rejected), undefined); assert.equal(f.runtime.requests.length, 0);
		const current = await seal(next); assert.notEqual(current.pack.digest, original.pack.digest);
		const command = evaluation(next, task.authorization.id, current.pack); await f.runtime.review.command(command); await f.runtime.review.whenIdle();
		const batch = f.store.policyBatch(command.operationId)!; assert.equal(batch.evaluation!.status, 'passed'); assert.equal(batch.authorization.evaluationSpec!.evaluator, 'repository-source-qa-manual-v1');
		assert.deepEqual(f.store.policyQaPack(original.pack.id), original.pack); assert.equal(f.store.policySelection('workspace')!.id, f.choice.id); cleaned(batch);
	} finally { await f.close(); }
});

test('process loss after question-object publication cannot seal a draft or authorize evaluation on recovery', { timeout: 15000 }, async () => {
	const f = await fixture();
	try {
		const saved = await draft(f); const confirm = cmd(f.store, 'policy_qa_seal', { ...f.intent, packId: saved.pack.id, packDigest: saved.pack.digest });
		await f.runtime.dispose(); f.store.close();
		const code = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; import {openStore} from ${JSON.stringify(new URL('../src/store.ts', import.meta.url).pathname)}; const store=openStore(${JSON.stringify(f.file)}); const link=fs.linkSync; fs.linkSync=(...args)=>{const result=link(...args); if(String(args[1]).endsWith('/repository-question-packs/${saved.pack.digest}.json')) process.exit(77); return result;}; syncBuiltinESMExports(); store.policyCommand(${JSON.stringify(confirm)},${JSON.stringify(f.root)}); process.exit(78);`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'pipe'] }); let errors = ''; child.stderr.on('data', data => errors += data); assert.equal(await new Promise(resolve => child.once('exit', resolve)), 77, errors);
		const object = join(f.root, 'repository-question-packs', saved.pack.digest + '.json'); assert.equal(existsSync(object), true);
		const stages = readdirSync(join(f.root, 'repository-question-packs')).filter(name => name.startsWith('.seal-')); assert.equal(stages.length, 1);
		const store = openStore(f.file); const runtime = await policyReviewRuntime(store, f.root);
		try {
			assert.deepEqual(store.policyQaPack(saved.pack.id), saved.pack); assert.equal(store.businessReceipt(confirm), undefined); assert.equal(store.policyReview().reviews.length, 1); assert.equal(runtime.requests.length, 0);
			assert.deepEqual(readdirSync(join(f.root, 'repository-question-packs')).filter(name => name.startsWith('.seal-')), stages);
			const receipt = await runtime.review.command(confirm); assert.equal(store.policyQaPack(saved.pack.id)!.status, 'sealed'); assert.deepEqual(await runtime.review.command(confirm), receipt); assert.equal(runtime.requests.length, 0);
			assert.equal(store.policyReview().generations.length, 0); assert.equal(store.policyReview().reviews.length, 1); assert.equal(store.policySelection('workspace')!.id, f.choice.id);
		} finally { await runtime.dispose(); store.close(); }
	} finally { await f.close(); }
});

function packEvaluation(f: Fixture, generationId: string, pack: NonNullable<ReturnType<Store['policyQaPack']>>) {
	const task = f.store.policyGeneration(generationId)!;
	return cmd(f.store, 'policy_evaluate_pack', { ...f.intent, generationId, baselineDigest: task.authorization.baselineDigest, candidateDigest: task.candidateDigest!, packId: pack.id, packDigest: pack.digest, budget: { maxRequests: 24, tokenStopThreshold: 1000, maxDurationMs: 60000 } });
}

test('one manual-pack authorization freezes six independent full tasks, isolates answers and aggregates only its three owners', { timeout: 20000 }, async t => {
	const f = await fixture(); const sends: unknown[] = []; const nativeFork = childProcesses.fork;
	const spy = t.mock.method(childProcesses, 'fork', (...args: Parameters<typeof nativeFork>) => { const child = nativeFork(...args); const send = child.send.bind(child); t.mock.method(child, 'send', (...args: Parameters<typeof send>) => { sends.push(args[0]); return send(...args); }); return child; }); syncBuiltinESMExports();
	try {
		const { pack } = await seal(f); const task = await generate(f);
		const oldSession = f.store.policyCommand(cmd(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: f.choice.id }), f.root); const oldBinding = f.store.policySession(`rsi-policy/${oldSession.focusId}`)!;
		const command = packEvaluation(f, task.authorization.id, pack);
		const receipt = await f.runtime.review.command(command); await f.runtime.review.whenIdle();
		const group = f.store.policyPackEvaluation(receipt.focusId!)!; const summary = f.store.policyPackSummary(group.id);
		assert.equal(summary.status, 'passed'); assert.equal(summary.executionStatus, 'completed'); assert.equal(summary.completedCases, 3); assert.equal(summary.requests, 24); assert.equal(summary.confirmedTokens, 360); assert.equal(summary.totalTokens, 360); assert.equal(summary.unknownUsage, 0);
		assert.equal(group.packId, pack.id); assert.equal(group.packDigest, pack.digest); assert.equal(group.snapshotDigest, f.intent.snapshotDigest);
		assert.equal(new Set(group.batchIds).size, 3); const pids: number[] = [];
		for (const [index, id] of group.batchIds.entries()) {
			const batch = f.store.policyBatch(id)!; const spec = batch.authorization.evaluationSpec!;
			assert.ok('caseId' in spec); assert.equal(spec.caseId, policySourceCaseSchema.options[index]); assert.equal(batch.authorization.packEvaluationId, group.id); assert.equal(batch.authorization.generationId, task.authorization.id);
			assert.equal(batch.createdAt, group.createdAt); assert.equal(batch.deadline, group.deadline); assert.equal(batch.authorization.runs[0].run.policyDigest, f.choice.digest); assert.equal(batch.authorization.runs[1].run.policyDigest, task.candidateDigest);
			assert.deepEqual(batch.authorization.runs[0].run.conditions, batch.authorization.runs[1].run.conditions); assert.equal(batch.evaluation!.status, 'passed'); assert.ok(batch.evidence!.every(row => row.result!.events.filter(event => event.type === 'tool/call').length === 3)); cleaned(batch); pids.push(...batch.evidence!.map(row => row.workerPid!));
		}
		assert.equal(new Set(pids).size, 6); assert.equal(f.runtime.requests.length, 24); assert.equal(f.generator.length, 1);
		const childInputs = sends.flatMap(raw => { const parsed = policyProcessInputSchema.safeParse(raw); return parsed.success && parsed.data.type === 'run' ? [parsed.data] : []; }); assert.equal(childInputs.length, 6);
		for (const view of [JSON.stringify(childInputs), JSON.stringify(f.generator)]) { assert.equal(view.includes('HELD_OUT_MANUAL'), false); assert.equal(view.includes(pack.digest), false); }
		assert.equal(JSON.stringify(f.generator).includes(questions.symbol.question), false);
		assert.equal(f.store.policyAccounting(f.choice.policyId, group.id).attempts.length, 24); assert.equal(f.store.policyAccounting(f.choice.policyId).attempts.length, 32); // Seven seed attempts, one generation, twenty-four evaluations.
		assert.equal(f.store.policySelection('workspace')!.id, f.choice.id);
		assert.deepEqual(await f.runtime.review.command(command), receipt); await f.runtime.review.whenIdle(); assert.equal(f.runtime.requests.length, 24);
		const prior = JSON.stringify(f.store.policyReview()); const changed = structuredClone(questions); changed.symbol.answer.claims[0].value = 'New reviewed answer'; await draft(f, pack.id, changed);
		assert.equal(f.store.policyPackSummary(group.id).status, 'passed'); assert.ok(JSON.parse(prior).reviews.slice(1).every((row: { eligible: boolean }) => row.eligible));
		const proof = f.store.policyReview().reviews.find(row => row.batchId === group.batchIds[0])!;
		f.store.policyCommand(cmd(f.store, 'policy_adopt', { workspaceId: 'workspace', expectedActive: f.choice.id, policyId: proof.policyId, batchId: proof.batchId, baselineDigest: proof.baselineDigest, candidateDigest: proof.candidateDigest, evidenceDigest: proof.evidenceDigest!, choice: 'candidate' }), f.root);
		assert.equal(f.store.policySelection('workspace')!.digest, task.candidateDigest);
		const active = f.store.policySelection('workspace')!; const created = f.store.policyCommand(cmd(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: active.id }), f.root); const newBinding = f.store.policySession(`rsi-policy/${created.focusId}`)!;
		assert.equal(f.store.policySessionRun(newBinding.sessionId)!.policyDigest, task.candidateDigest);
		f.store.policyCommand(cmd(f.store, 'policy_restore', { workspaceId: 'workspace', expectedActive: active.id, targetChoiceId: f.choice.id }), f.root);
		assert.deepEqual(f.store.policySession(oldBinding.sessionId), oldBinding); assert.deepEqual(f.store.policySession(newBinding.sessionId), newBinding); assert.equal(f.store.policySessionRun(newBinding.sessionId)!.policyDigest, task.candidateDigest);
		await f.runtime.dispose(); f.store.close(); const disk = new DatabaseSync(f.file);
		const intents = disk.prepare('SELECT command FROM g1_operations').all().map(row => JSON.parse(String(row.command))); assert.equal(intents.filter(row => row.kind === 'policy_evaluate_pack').length, 1); assert.equal(intents.filter(row => row.kind === 'policy_evaluate').length, 0); disk.close();
		const reopened = openStore(f.file); try { assert.equal(reopened.policyPackSummary(group.id).status, 'passed'); assert.equal(reopened.policyReview().packEvaluations.length, 1); } finally { reopened.close(); }
	} finally { spy.mock.restore(); syncBuiltinESMExports(); await f.close(); }
});

test('whole-pack caps accumulate across questions; unknown usage, quality failure and member cancellation retain truthful summaries', { timeout: 35000 }, async () => {
	for (const mode of ['requests', 'tokens', 'expired', 'unknown', 'stop', 'pack-stop', 'dispose', 'wrong_answer', 'no_tools'] as const) {
		const f = await fixture(mode === 'unknown' ? 'unknown_call_chain' : mode === 'stop' || mode === 'pack-stop' || mode === 'dispose' ? 'hang_call_chain' : mode === 'wrong_answer' || mode === 'no_tools' ? mode : 'complete');
		try {
			const { pack } = await seal(f); const task = await generate(f); const command = packEvaluation(f, task.authorization.id, pack); assert.equal(command.kind, 'policy_evaluate_pack');
			if (mode === 'expired') { const start = f.store.startPolicyRun; f.store.startPolicyRun = (id, runId) => { const spec = f.store.policyBatch(id)!.authorization.evaluationSpec!; if ('caseId' in spec && spec.caseId === 'call-chain') { const now = Date.now; Date.now = () => f.store.policyPackEvaluation(command.operationId)!.deadline; try { return start(id, runId); } finally { Date.now = now; } } return start(id, runId); }; }
			if (mode === 'requests') command.payload.budget.maxRequests = 10; if (mode === 'tokens') command.payload.budget.tokenStopThreshold = 130;
			await f.runtime.review.command(command); const group = f.store.policyPackEvaluation(command.operationId)!;
			if (mode === 'stop' || mode === 'pack-stop' || mode === 'dispose') {
				await until(() => f.runtime.requests.length === 11);
				assert.equal(f.store.policyPackSummary(group.id).completedCases, 1); const proof = f.store.policyReview().reviews.find(row => row.batchId === group.batchIds[0])!; assert.equal(proof.eligible, false);
				assert.throws(() => f.store.policyCommand(cmd(f.store, 'policy_adopt', { workspaceId: 'workspace', expectedActive: f.choice.id, policyId: proof.policyId, batchId: proof.batchId, baselineDigest: proof.baselineDigest, candidateDigest: proof.candidateDigest, evidenceDigest: proof.evidenceDigest!, choice: 'candidate' }), f.root), /paired evaluated|incomplete/i);
				await assert.rejects(f.runtime.review.command(cmd(f.store, 'policy_stop', { workspaceId: 'other', target: 'pack-evaluation', jobId: group.id })));
				if (mode === 'pack-stop') await f.runtime.review.command(cmd(f.store, 'policy_stop', { workspaceId: 'workspace', target: 'pack-evaluation', jobId: group.id })); else if (mode === 'stop') await f.runtime.review.command(cmd(f.store, 'policy_stop', { workspaceId: 'workspace', target: 'evaluation', jobId: group.batchIds[1] })); else await f.runtime.review.dispose();
			}
			await f.runtime.review.whenIdle(); const summary = f.store.policyPackSummary(group.id);
			assert.equal(summary.status, mode === 'wrong_answer' ? 'failed' : 'incomplete', mode); assert.equal(summary.requests, mode === 'requests' ? 10 : mode === 'tokens' ? 9 : mode === 'expired' ? 8 : mode === 'unknown' ? 9 : mode === 'stop' || mode === 'pack-stop' || mode === 'dispose' ? 11 : mode === 'no_tools' ? 2 : 24, mode);
			if (mode === 'unknown' || mode === 'stop' || mode === 'pack-stop' || mode === 'dispose') { assert.equal(summary.totalTokens, null); assert.equal(summary.unknownUsage, 1); assert.equal(summary.confirmedTokens, mode === 'unknown' ? 120 : 150); }
			assert.equal(summary.completedCases, mode === 'wrong_answer' ? 3 : mode === 'no_tools' ? 0 : 1);
			assert.ok(f.store.policyReview().reviews.filter(row => row.packEvaluationId === group.id).every(row => row.eligible === (mode === 'wrong_answer')));
			for (const id of group.batchIds) cleaned(f.store.policyBatch(id)!);
			assert.equal(f.store.policySelection('workspace')!.id, f.choice.id);
		} finally { await f.close(); }
	}
});

test('pack authorization is atomic and exact; order, stale input, draft/revision and changed sealed objects cannot dispatch', async () => {
	const f = await fixture();
	try {
		const draftPack = await draft(f); const task = await generate(f);
		await assert.rejects(f.runtime.review.command(packEvaluation(f, task.authorization.id, draftPack.pack)), /精确问答包/);
		await f.runtime.review.command(cmd(f.store, 'policy_qa_seal', { ...f.intent, packId: draftPack.pack.id, packDigest: draftPack.pack.digest }));
		const pack = f.store.policyQaPack(draftPack.pack.id)!; const command = packEvaluation(f, task.authorization.id, pack);
		for (const changes of [{ packDigest: 'a'.repeat(64) }, { sourceId: randomUUID() }, { candidateDigest: f.choice.digest }, { snapshotDigest: 'b'.repeat(64) }, { expectedActive: randomUUID() }, { caseId: 'symbol' }]) await assert.rejects(f.runtime.review.command({ ...command, payload: { ...command.payload, ...changes } }));
		assert.throws(() => f.store.policyCommand({ ...command, expectedRevision: 1 }, f.root, undefined, policyExecutionRuntime()));
		assert.throws(() => f.store.transaction(() => { f.store.policyCommand(command, f.root, undefined, policyExecutionRuntime()); throw new Error('atomic pack rollback'); }), /atomic pack rollback/);
		assert.equal(f.store.policyPackEvaluation(command.operationId), undefined); assert.equal(f.store.businessReceipt(command), undefined); assert.equal(f.store.policyReview().reviews.length, 1);
		f.store.policyCommand(command, f.root, undefined, policyExecutionRuntime()); const group = f.store.policyPackEvaluation(command.operationId)!;
		const second = f.store.policyBatch(group.batchIds[1])!; assert.throws(() => f.store.startPolicyRun(second.authorization.id, second.authorization.runs[0].run.runId), /paired evaluated/);
		await assert.rejects(f.runtime.review.command({ ...command, payload: { ...command.payload, packDigest: 'a'.repeat(64) } }), /操作 ID/);
		unlinkSync(join(f.root, 'repository-question-packs', pack.digest + '.json'));
		await assert.rejects(executeAuthorizedPolicyBatch(f.runtime.ctx, f.store, group.batchIds[0]), /ENOENT/); f.store.stopPolicyPack(group.id, 'failed');
		assert.equal(f.store.policyAccounting(f.choice.policyId, group.id).attempts.length, 0); assert.equal(f.runtime.requests.length, 0); assert.equal(f.store.policyPackSummary(group.id).status, 'incomplete');
		assert.equal(g1SnapshotSchema.shape.policy.parse(undefined).packEvaluations.length, 0);
	} finally { await f.close(); }
});

test('pack controller loss between questions and during a later tool task preserves history and never replays', { timeout: 20000 }, async () => {
	for (const checkpoint of ['between', 'during'] as const) {
		const f = await fixture();
		try {
			const { pack } = await seal(f); const task = await generate(f); const command = packEvaluation(f, task.authorization.id, pack); await f.runtime.dispose(); f.store.close();
			const before = new DatabaseSync(f.file); const legacy = ['attempts', 'policy_batches', 'policy_generations', 'policy_choices', 'policy_sessions', 'policy_sources', 'policy_qa_packs', 'g1_operations', 'operations'].map(table => ({ table, rows: before.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() })); before.close();
			const code = `import {openStore} from ${JSON.stringify(new URL('../src/store.ts', import.meta.url).pathname)}; import {policyReviewRuntime} from ${JSON.stringify(new URL('../scripts/policy-review-fixture.ts', import.meta.url).pathname)}; const store=openStore(${JSON.stringify(f.file)}); const runtime=await policyReviewRuntime(store,${JSON.stringify(f.root)},'hang_call_chain'); const start=store.startPolicyRun; store.startPolicyRun=(id,run)=>{if(${JSON.stringify(checkpoint)}==='between'&&store.policyBatch(id).authorization.evaluationSpec.caseId==='call-chain')process.exit(77);return start(id,run);}; await runtime.review.command(${JSON.stringify(command)}); while(runtime.requests.length<11) await new Promise(r=>setTimeout(r,5)); process.exit(77);`;
			const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'pipe'] }); let errors = ''; child.stderr.on('data', data => errors += data); assert.equal(await new Promise(resolve => child.once('exit', resolve)), 77, errors);
			const store = openStore(f.file); const runtime = await policyReviewRuntime(store, f.root);
			try {
				const summary = store.policyPackSummary(command.operationId); assert.equal(summary.executionStatus, 'interrupted'); assert.equal(summary.status, 'incomplete'); assert.equal(summary.completedCases, 1); assert.equal(summary.requests, checkpoint === 'between' ? 8 : 11); assert.equal(summary.totalTokens, checkpoint === 'between' ? 120 : null); assert.equal(summary.confirmedTokens, checkpoint === 'between' ? 120 : 150);
				for (const id of summary.batchIds) for (const p of store.policyBatch(id)!.progress) if (p.resource) { await until(() => { try { process.kill(p.resource!.pid!, 0); return false; } catch { return true; } }); await until(() => !existsSync(p.resource!.temporaryRoot)); }
				assert.equal((await runtime.review.command(command)).focusId, command.operationId); await runtime.review.whenIdle(); assert.equal(runtime.requests.length, 0); assert.equal(store.policyReview().reviews.filter(row => row.packEvaluationId === command.operationId && row.eligible).length, 0);
			} finally { await runtime.dispose(); store.close(); }
			const after = new DatabaseSync(f.file); try { for (const { table, rows } of legacy) for (const row of rows) { const key = table === 'policy_sessions' ? 'session' : 'id'; assert.deepEqual(after.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key] as string), row); } } finally { after.close(); }
		} finally { await f.close(); }
	}
});

test('corrupt pack membership, receipt and limits fail startup without discarding historical bytes', async () => {
	const f = await fixture();
	try {
		const { pack } = await seal(f); const task = await generate(f); const command = packEvaluation(f, task.authorization.id, pack); f.store.policyCommand(command, f.root, undefined, policyExecutionRuntime()); const group = f.store.policyPackEvaluation(command.operationId)!; await f.runtime.dispose(); f.store.close();
		for (const [table, column, id, mode] of [['policy_pack_evaluations', 'data', group.id, 'order'], ['policy_pack_evaluations', 'data', group.id, 'budget'], ['policy_pack_evaluations', 'data', group.id, 'source'], ['policy_batches', 'data', group.batchIds[0], 'parent'], ['g1_operations', 'command', group.id, 'receipt']] as const) {
			const db = new DatabaseSync(f.file); const raw = String(db.prepare(`SELECT ${column} FROM ${table} WHERE id=?`).get(id)![column]); const value = JSON.parse(raw);
			if (mode === 'order') value.batchIds.reverse(); else if (mode === 'budget') value.budget.maxRequests = 25; else if (mode === 'source') value.sourceId = randomUUID(); else if (mode === 'parent') value.authorization.packEvaluationId = randomUUID(); else value.payload.packDigest = 'a'.repeat(64);
			const corrupt = JSON.stringify(value); db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(corrupt, id); db.close(); assert.throws(() => openStore(f.file));
			const restore = new DatabaseSync(f.file); assert.equal(restore.prepare(`SELECT ${column} FROM ${table} WHERE id=?`).get(id)![column], corrupt); restore.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(raw, id); restore.close();
		}
		const store = openStore(f.file); try { assert.equal(store.policyPackSummary(group.id).executionStatus, 'interrupted'); assert.equal(store.policyPackSummary(group.id).requests, 0); } finally { store.close(); }
	} finally { await f.close(); }
});

test('whole-pack authority rejects an identical-content pack substitution and jointly changed paired conditions', async () => {
	const f = await fixture();
	try {
		const original = await seal(f); const twin = await seal(f);
		assert.notEqual(original.pack.id, twin.pack.id); assert.equal(original.pack.digest, twin.pack.digest);
		const task = await generate(f); const command = packEvaluation(f, task.authorization.id, original.pack);
		f.store.policyCommand(command, f.root, undefined, policyExecutionRuntime()); const group = f.store.policyPackEvaluation(command.operationId)!;
		await f.runtime.dispose(); f.store.close();
		for (const mode of ['pack-record', 'conditions'] as const) {
			const db = new DatabaseSync(f.file); const raw = String(db.prepare('SELECT data FROM policy_batches WHERE id=?').get(group.batchIds[0])!.data); const value = JSON.parse(raw);
			const conditions = structuredClone(value.authorization.runs[0].run.conditions);
			if (mode === 'conditions') conditions.budget.maxOutputTokens = 512;
			const fixed = manualSourceQuestion(mode === 'pack-record' ? twin.pack.id : original.pack.id, original.pack.content, f.source.id, conditions, 'symbol');
			value.authorization.evaluationSpec = fixed.spec;
			for (const entry of value.authorization.runs) { entry.run.conditions = fixed.conditions; entry.run.conditionsDigest = policyDigest(fixed.conditions); }
			// Both runs and the manual specification remain self-consistent; the original authority must still reject them.
			validatePolicyEvaluation(value.authorization, original.pack.content);
			const changed = JSON.stringify(value); db.prepare('UPDATE policy_batches SET data=? WHERE id=?').run(changed, group.batchIds[0]); db.close();
			assert.throws(() => openStore(f.file), mode === 'pack-record' ? /Whole-pack ordered membership/ : /Source evaluation differs/);
			const restored = new DatabaseSync(f.file); assert.equal(restored.prepare('SELECT data FROM policy_batches WHERE id=?').get(group.batchIds[0])!.data, changed); restored.prepare('UPDATE policy_batches SET data=? WHERE id=?').run(raw, group.batchIds[0]); restored.close();
		}
		const recovered = openStore(f.file);
		try { assert.equal(recovered.policyPackSummary(group.id).executionStatus, 'interrupted'); assert.equal(recovered.policyPackSummary(group.id).requests, 0); assert.equal(recovered.policyQaPack(original.pack.id)!.status, 'sealed'); assert.equal(recovered.policyQaPack(twin.pack.id)!.status, 'sealed'); } finally { recovered.close(); }
	} finally { await f.close(); }
});
