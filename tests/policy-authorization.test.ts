import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import childProcesses from 'node:child_process';
import filePromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { spawn, fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { DatabaseSync } from 'node:sqlite';
import { executeAuthorizedPolicyBatch, policyExecutionRuntime } from '../src/policy-execution.ts';
import { openStore, type Store } from '../src/store.ts';
import { policyCommandSchema, type PolicyCommand } from '../src/policy-review-contracts.ts';
import { preparePolicyReviewFixture, policyReviewRuntime } from '../scripts/policy-review-fixture.ts';
import { registerPolicyGenerationAdapter } from '../scripts/policy-generation.ts';

const seed = mkdtempSync(join(tmpdir(), 'rsi-authorization-seed-'));
before(async () => { await preparePolicyReviewFixture(join(seed, 'state.sqlite')); });
after(() => rmSync(seed, { recursive: true, force: true }));
const budget = { provider: 'rsi-policy-generation-fixture' as const, model: 'offline-v1' as const, maxRequests: 1 as const, maxOutputTokens: 1024, maxInputBytes: 16384, maxDurationMs: 5000 };
function command(store: Store, kind: PolicyCommand['kind'], payload: PolicyCommand['payload']) { return policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload }); }
async function fixture(mode: Parameters<typeof policyReviewRuntime>[2] = 'complete', generationMode = 'complete') {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'rsi-authorization-'))); cpSync(seed, root, { recursive: true }); mkdirSync(join(root, '.git'));
	writeFileSync(join(root, 'source.ts'), 'export const retained = "HELD_OUT_SOURCE_ANSWER";\n'); const file = join(root, 'state.sqlite'); const store = openStore(file);
	const review = store.policyReview().reviews[0]; store.policyCommand(command(store, 'policy_adopt', { workspaceId: 'workspace', policyId: review.policyId, batchId: review.batchId, baselineDigest: review.baselineDigest, candidateDigest: review.candidateDigest, evidenceDigest: review.evidenceDigest!, choice: 'baseline', expectedActive: null }), root);
	const runtime = await policyReviewRuntime(store, root, mode); const generator = registerPolicyGenerationAdapter(runtime.ctx, store, generationMode);
	const choice = store.policySelection('workspace')!;
	const preview = await runtime.review.command(command(store, 'policy_preview', { workspaceId: 'workspace', expectedActive: choice.id, paths: ['source.ts'] })); const source = store.policySource(preview.focusId!)!;
	const intent = { workspaceId: 'workspace', expectedActive: choice.id, sourceId: source.id, snapshotDigest: source.conditions.sourceSnapshot!.digest };
	await runtime.review.command(command(store, 'policy_seal', intent));
	return { root, file, store, runtime, generator, choice, source, intent, async close() { if (runtime.ctx.agents) await runtime.dispose(); try { store.close(); } catch {} rmSync(root, { recursive: true, force: true }); } };
}
function generation(f: Awaited<ReturnType<typeof fixture>>, requirements = 'Inspect implementations before claims and cite evidence.') { return command(f.store, 'policy_generate', { ...f.intent, baselineDigest: f.choice.digest, requirements, budget }); }
function evaluation(f: Awaited<ReturnType<typeof fixture>>, id: string, maxRequests = 6) { const task = f.store.policyGeneration(id)!; return command(f.store, 'policy_evaluate', { ...f.intent, generationId: id, baselineDigest: task.authorization.baselineDigest, candidateDigest: task.candidateDigest!, budget: { maxRequests, tokenStopThreshold: 1000, maxDurationMs: 30000 } }); }

test('sidebar separately authorizes exact source generation and two independent complete tool tasks with one ledger', { timeout: 20000 }, async () => {
	const f = await fixture();
	try {
		const cmd = generation(f); const receipt = await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
		const task = f.store.policyGeneration(receipt.focusId!)!; assert.equal(task.status, 'sealed', task.error ?? ''); assert.equal(f.generator.length, 1);
		assert.equal(JSON.stringify(f.generator).includes('HELD_OUT_SOURCE_ANSWER'), false); assert.equal(JSON.stringify(f.generator).includes('repository-source-v1'), false); assert.equal(JSON.stringify(f.generator).includes('sample.js'), false);
		assert.deepEqual(f.generator[0].tools, []); assert.equal(task.authorization.source!.sourceId, f.source.id); assert.equal(f.store.policyVersions(f.choice.policyId).find(row => row.digest === task.candidateDigest)!.parentDigest, f.choice.digest);
		assert.equal(f.store.policyReview().reviews.length, 1); assert.equal(f.runtime.requests.length, 0); assert.equal(f.store.policySelection('workspace')!.id, f.choice.id);
		assert.deepEqual(await f.runtime.review.command(cmd), receipt); await f.runtime.review.whenIdle(); assert.equal(f.generator.length, 1);
		writeFileSync(join(f.root, 'source.ts'), 'export const retained = "LIVE_CHANGED";');
		const evaluate = evaluation(f, task.authorization.id); const result = await f.runtime.review.command(evaluate); await f.runtime.review.whenIdle();
		const batch = f.store.policyBatch(result.focusId!)!; assert.equal(batch.evaluation?.status, 'passed', JSON.stringify(batch.evidence?.map(row => ({ error: row.error, cleanup: row.cleanup }))));
		assert.equal(batch.authorization.runs[0].run.conditionsDigest, batch.authorization.runs[1].run.conditionsDigest);
		assert.equal(batch.authorization.runs[0].run.conditions.sourceSnapshot!.digest, f.intent.snapshotDigest); assert.equal(batch.authorization.runs[0].run.conditions.files[0].content.includes('LIVE_CHANGED'), false);
		assert.equal(new Set(batch.evidence!.map(row => row.workerPid)).size, 2); assert.ok(batch.evidence!.every(row => row.result!.events.filter(event => event.type === 'tool/call').length === 2 && row.cleanup.processExited && row.cleanup.agentsDisposed && row.cleanup.directoryRemoved && !existsSync(row.cleanup.temporaryRoot)));
		const accounting = f.store.policyAccounting(f.choice.policyId, batch.authorization.id); assert.equal(accounting.attempts.length, 6); assert.equal(accounting.totalTokens, 90); assert.ok(accounting.attempts.every(row => row.owner === 'rsi' && row.ownerId === batch.authorization.id && row.usageState === 'confirmed'));
		assert.equal(f.runtime.requests.length, 6); assert.equal(f.store.snapshot().attempts.filter(row => row.ownerId === task.authorization.id).length, 1); assert.equal(f.store.policySelection('workspace')!.id, f.choice.id);
		assert.deepEqual(await f.runtime.review.command(evaluate), result); await f.runtime.review.whenIdle(); assert.equal(f.runtime.requests.length, 6);
		const old = f.store.policyCommand(command(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: f.choice.id }), f.root); const oldBinding = f.store.policySession(`rsi-policy/${old.focusId}`)!;
		const view = f.store.policyReview().reviews.at(-1)!;
		const adoption = { policyId: view.policyId, batchId: view.batchId, baselineDigest: view.baselineDigest, candidateDigest: view.candidateDigest, evidenceDigest: view.evidenceDigest!, choice: 'candidate' as const };
		assert.throws(() => f.store.policyCommand(command(f.store, 'policy_adopt', { ...adoption, workspaceId: 'other', expectedActive: null }), '/elsewhere'), /原工作区/);
		await f.runtime.review.command(command(f.store, 'policy_adopt', { ...adoption, workspaceId: 'workspace', expectedActive: f.choice.id }));
		const created = await f.runtime.review.command(command(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: f.store.policySelection('workspace')!.id }));
		const agent = f.runtime.ctx.agents.get(SessionId(`rsi-policy/${created.focusId}`))!; agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Read the bound source.' }] })); await agent.whenIdle();
		assert.equal(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')?.data.reason.kind, 'completed');
		assert.equal(f.runtime.requests.length, 9); assert.equal(f.store.policyAccounting(f.choice.policyId, batch.authorization.id).attempts.length, 6); assert.deepEqual(f.store.policySession(oldBinding.sessionId), oldBinding);
		unlinkSync(join(f.root, 'repository-snapshots', f.intent.snapshotDigest + '.json'));
		assert.throws(() => f.store.policySessionRun(agent.id), /ENOENT|source|snapshot/i);
		assert.deepEqual(f.store.policySession(oldBinding.sessionId), oldBinding); assert.equal(f.runtime.requests.length, 9);

	} finally { await f.close(); }
});

async function until(check: () => boolean, label = 'Owned work') { for (let n = 0; n < 200; n++) { if (check()) return; await delay(10); } assert.fail(label + ' did not reach expected checkpoint'); }

test('generation authority is atomic, rejects stale/conflicting scope, and cancellation retains unknown usage without replay', async () => {
	const f = await fixture('complete', 'hang');
	try {
		const cmd = generation(f);
		assert.throws(() => f.store.transaction(() => { f.store.policyCommand(cmd, f.root); throw new Error('rollback authorization'); }), /rollback/);
		assert.equal(f.store.policyGeneration(cmd.operationId), undefined); assert.equal(f.store.businessReceipt(cmd), undefined);
		for (const extra of [{ root: f.root }, { evaluator: 'accept-all' }, { tools: ['shell'] }]) await assert.rejects(f.runtime.review.command({ ...cmd, payload: { ...cmd.payload, ...extra } }));
		for (const field of ['baselineDigest', 'snapshotDigest', 'expectedActive'] as const) await assert.rejects(f.runtime.review.command({ ...cmd, payload: { ...cmd.payload, [field]: field === 'expectedActive' ? randomUUID() : 'a'.repeat(64) } }));
		const receipt = await f.runtime.review.command(cmd); await until(() => f.generator.length === 1);
		assert.deepEqual(await f.runtime.review.command(cmd), receipt); assert.equal(f.generator.length, 1);
		await assert.rejects(f.runtime.review.command({ ...generation(f), expectedRevision: cmd.expectedRevision }), /状态已变化/);
		await assert.rejects(f.runtime.review.command(generation(f, 'Another requirement')), /已有生成/);
		await assert.rejects(f.runtime.review.command({ ...cmd, payload: { ...cmd.payload, requirements: 'conflicting operation' } }), /操作 ID/);
		const stop = command(f.store, 'policy_stop', { workspaceId: 'workspace', target: 'generation', jobId: receipt.focusId! });
		await f.runtime.review.command(stop); await f.runtime.review.whenIdle();
		assert.equal(f.store.policyGeneration(receipt.focusId!)!.status, 'cancelled'); assert.equal(f.store.policyGeneration(receipt.focusId!)!.candidateDigest, null);
		const usage = f.store.policyReview().generations[0]; assert.equal(usage.requests, 1); assert.equal(usage.totalTokens, null);
		assert.deepEqual(await f.runtime.review.command(cmd), receipt); await f.runtime.review.whenIdle(); assert.equal(f.generator.length, 1);
	} finally { await f.close(); }
});

test('shared request and token limits, unknown usage and tool-free results cannot qualify a source evaluation', { timeout: 20000 }, async () => {
	for (const mode of ['cap', 'tokens', 'unknown', 'no_tools', 'forbidden', 'wrong_answer'] as const) {
		const f = await fixture(mode === 'cap' || mode === 'tokens' ? 'complete' : mode);
		try {
			const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle(); const evaluate = evaluation(f, cmd.operationId, mode === 'cap' ? 4 : 6);
			if (mode === 'tokens') { assert.equal(evaluate.kind, 'policy_evaluate'); evaluate.payload.budget.tokenStopThreshold = 40; }
			const receipt = await f.runtime.review.command(evaluate); await f.runtime.review.whenIdle(); const batch = f.store.policyBatch(receipt.focusId!)!;
			assert.equal(batch.evaluation?.status, mode === 'wrong_answer' ? 'failed' : 'incomplete', mode);
			assert.equal(f.store.policyReview().reviews.at(-1)!.eligible, mode === 'wrong_answer');
			const accounting = f.store.policyAccounting(f.choice.policyId, batch.authorization.id);
			if (mode === 'cap') assert.equal(accounting.attempts.length, 4);
			if (mode === 'tokens') assert.equal(accounting.attempts.length, 3);
			if (mode === 'unknown') { assert.equal(accounting.attempts.length, 1); assert.equal(accounting.totalTokens, null); assert.equal(f.store.policyReview().reviews.at(-1)!.sides[0].totalTokens, null); }
			for (const row of batch.evidence ?? []) { assert.equal(row.cleanup.processExited, true); assert.equal(row.cleanup.directoryRemoved, true); assert.equal(existsSync(row.cleanup.temporaryRoot), false); }
			assert.equal(f.store.policySelection('workspace')!.id, f.choice.id);
		} finally { await f.close(); }
	}
});

test('evaluation authorization rejects changed lineage/source/budget and active choice; pending stop and disposal release owned processes', async () => {
	const f = await fixture('hang');
	try {
		const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
		const evaluate = evaluation(f, cmd.operationId); assert.equal(evaluate.kind, 'policy_evaluate');
		for (const field of ['candidateDigest', 'snapshotDigest', 'baselineDigest', 'generationId'] as const) await assert.rejects(f.runtime.review.command({ ...evaluate, operationId: randomUUID(), payload: { ...evaluate.payload, [field]: field === 'generationId' ? randomUUID() : 'a'.repeat(64) } }));
		assert.equal(f.runtime.requests.length, 0);
		const receipt = await f.runtime.review.command(evaluate); await until(() => f.runtime.requests.length === 1);
		const batchId = receipt.focusId!; const resource = f.store.policyBatch(batchId)!.progress[0].resource!;
		await f.runtime.review.command(command(f.store, 'policy_stop', { workspaceId: 'workspace', target: 'evaluation', jobId: batchId })); await f.runtime.review.whenIdle();
		assert.equal(f.store.policyBatch(batchId)!.status, 'cancelled'); assert.equal(f.store.policyBatch(batchId)!.evaluation!.status, 'incomplete');
		assert.equal(f.store.policyAccounting(f.choice.policyId, batchId).totalTokens, null); assert.equal(existsSync(resource.temporaryRoot), false); assert.throws(() => process.kill(resource.pid!, 0), /ESRCH/);
		assert.deepEqual(await f.runtime.review.command(evaluate), receipt); await f.runtime.review.whenIdle(); assert.equal(f.runtime.requests.length, 1);
		const next = evaluation(f, cmd.operationId); const newer = await f.runtime.review.command(next); await until(() => f.runtime.requests.length === 2);
		const owned = f.store.policyBatch(newer.focusId!)!.progress[0].resource!;
		await f.runtime.dispose(); assert.equal(f.store.policyBatch(newer.focusId!)!.status, 'cancelled'); assert.equal(existsSync(owned.temporaryRoot), false); assert.throws(() => process.kill(owned.pid!, 0), /ESRCH/);

	} finally { await f.close(); }
});

test('process loss after committed generation or evaluation intent interrupts without replay and preserves historical raw rows', { timeout: 15000 }, async () => {
	const f = await fixture();
	try {
		const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
		const evaluate = evaluation(f, cmd.operationId); await f.runtime.dispose(); f.store.close();
		const raw = new DatabaseSync(f.file); const legacy = raw.prepare("SELECT id,data FROM policy_generations WHERE json_extract(data,'$.authorization.source') IS NULL").all(); const batches = raw.prepare("SELECT id,data FROM policy_batches").all(); raw.close();
		const code = `import {openStore} from ${JSON.stringify(new URL('../src/store.ts', import.meta.url).pathname)}; import {policyReviewRuntime} from ${JSON.stringify(new URL('../scripts/policy-review-fixture.ts', import.meta.url).pathname)}; const store=openStore(${JSON.stringify(f.file)}); const runtime=await policyReviewRuntime(store,${JSON.stringify(f.root)},'hang'); await runtime.review.command(${JSON.stringify(evaluate)}); while(runtime.requests.length===0) await new Promise(r=>setTimeout(r,5)); process.exit(77);`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'pipe'] }); let errors = ''; child.stderr.on('data', data => errors += data);
		const exit = await new Promise<number | null>(resolve => child.once('exit', resolve)); assert.equal(exit, 77, errors);
		const recovered = openStore(f.file); const batch = recovered.policyBatch(evaluate.operationId)!; const resource = batch.progress[0].resource!;
		try {
			assert.equal(batch.status, 'interrupted'); assert.equal(recovered.policyAccounting(f.choice.policyId, evaluate.operationId).totalTokens, null);
			await until(() => { try { process.kill(resource.pid!, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; } }, 'Disconnected worker ' + resource.pid);
			await until(() => !existsSync(resource.temporaryRoot), 'Disconnected home ' + resource.temporaryRoot);
			const runtime = await policyReviewRuntime(recovered, f.root); try { const receipt = await runtime.review.command(evaluate); assert.equal(receipt.focusId, batch.authorization.id); await runtime.review.whenIdle(); assert.equal(runtime.requests.length, 0); } finally { await runtime.dispose(); }
		} finally { recovered.close(); }
		const after = new DatabaseSync(f.file); try { for (const row of legacy) assert.equal(after.prepare('SELECT data FROM policy_generations WHERE id=?').get(row.id as string)!.data, row.data); for (const row of batches) assert.equal(after.prepare('SELECT data FROM policy_batches WHERE id=?').get(row.id as string)!.data, row.data); } finally { after.close(); }
	} finally { await f.close(); }
});

test('unknown or invalid generator output never authorizes evaluation, and loss before launch keeps an unreplayed exact receipt', async () => {
	for (const mode of ['unknown', 'scope', 'partial', 'before-launch']) {
		const f = await fixture('complete', mode === 'before-launch' ? 'complete' : mode);
		try {
			const cmd = generation(f);
			if (mode !== 'before-launch') {
				await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
				assert.equal(f.store.policyGeneration(cmd.operationId)!.status, 'failed'); assert.equal(f.store.policyGeneration(cmd.operationId)!.candidateDigest, null);
				const payload = { ...f.intent, generationId: cmd.operationId, baselineDigest: f.choice.digest, candidateDigest: 'b'.repeat(64), budget: { maxRequests: 6, tokenStopThreshold: 1000, maxDurationMs: 30000 } };
				await assert.rejects(f.runtime.review.command(command(f.store, 'policy_evaluate', payload))); assert.equal(f.runtime.requests.length, 0);
			} else {
				const receipt = f.store.policyCommand(cmd, f.root); await f.runtime.dispose(); f.store.close();
				const recovered = openStore(f.file); const runtime = await policyReviewRuntime(recovered, f.root); const calls = registerPolicyGenerationAdapter(runtime.ctx, recovered);
				try { assert.equal(recovered.policyGeneration(cmd.operationId)!.status, 'interrupted'); assert.deepEqual(await runtime.review.command(cmd), receipt); await runtime.review.whenIdle(); assert.equal(calls.length, 0); assert.equal(recovered.snapshot().attempts.some(row => row.ownerId === cmd.operationId), false); }
				finally { await runtime.dispose(); recovered.close(); }
			}
		} finally { await f.close(); }
	}
});

test('source authorization and independent evaluation receipts fail closed on corruption without clearing historical rows', async () => {
	const f = await fixture();
	try {
		const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle(); const evaluate = evaluation(f, cmd.operationId);
		await f.runtime.review.command(evaluate); await f.runtime.review.whenIdle(); await f.runtime.dispose(); f.store.close();
		for (const id of [cmd.operationId, evaluate.operationId]) {
			const raw = new DatabaseSync(f.file); const saved = String(raw.prepare('SELECT command FROM g1_operations WHERE id=?').get(id)!.command); const changed = JSON.parse(saved); changed.payload.snapshotDigest = 'c'.repeat(64); raw.prepare('UPDATE g1_operations SET command=? WHERE id=?').run(JSON.stringify(changed), id); raw.close();
			assert.throws(() => openStore(f.file), /authorization receipt/);
			const after = new DatabaseSync(f.file); assert.equal(after.prepare('SELECT command FROM g1_operations WHERE id=?').get(id)!.command, JSON.stringify(changed)); after.prepare('UPDATE g1_operations SET command=? WHERE id=?').run(saved, id); after.close();
		}
		const recovered = openStore(f.file); try { assert.equal(recovered.policyBatch(evaluate.operationId)!.evaluation!.status, 'passed'); } finally { recovered.close(); }
	} finally { await f.close(); }
});


test('an IPC worker refuses an unowned cwd without deleting its files', async () => {
	const root = mkdtempSync(join(tmpdir(), 'rsi-unowned-')); writeFileSync(join(root, 'sentinel'), 'preserve');
	try {
		const child = fork(new URL('../src/policy-worker.ts', import.meta.url), [], { cwd: root, env: { PATH: process.env.PATH }, execArgv: [], silent: true }); child.stdout?.resume(); child.stderr?.resume();
		const code = await new Promise<number | null>(resolve => child.once('exit', resolve)); assert.notEqual(code, 0); assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'preserve');
	} finally { rmSync(root, { recursive: true, force: true }); }
});


test('synchronous child startup failure retains authorization but releases its recorded owned directory', async t => {
	const f = await fixture();
	try {
		const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
		const spy = t.mock.method(childProcesses, 'fork', () => { throw new Error('Controlled fork failure'); }); syncBuiltinESMExports();
		try {
			const evaluate = evaluation(f, cmd.operationId); await f.runtime.review.command(evaluate); await f.runtime.review.whenIdle();
			const batch = f.store.policyBatch(evaluate.operationId)!; assert.equal(batch.status, 'failed'); assert.equal(batch.evaluation!.status, 'incomplete'); assert.equal(f.runtime.requests.length, 0);
			assert.equal(existsSync(batch.progress[0].resource!.temporaryRoot), false); assert.ok(f.store.businessReceipt(evaluate));
		} finally { spy.mock.restore(); syncBuiltinESMExports(); }
	} finally { await f.close(); }
});


test('a sealed source lost after evaluation authorization blocks the first adapter dispatch without fallback', async () => {
	const f = await fixture();
	try {
		const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
		const evaluate = evaluation(f, cmd.operationId); f.store.policyCommand(evaluate, f.root, undefined, policyExecutionRuntime());
		unlinkSync(join(f.root, 'repository-snapshots', f.intent.snapshotDigest + '.json'));
		await executeAuthorizedPolicyBatch(f.runtime.ctx, f.store, evaluate.operationId);
		const batch = f.store.policyBatch(evaluate.operationId)!; assert.equal(batch.evaluation!.status, 'incomplete'); assert.equal(f.runtime.requests.length, 0); assert.equal(f.store.policyAccounting(f.choice.policyId, evaluate.operationId).attempts.length, 0);
		assert.equal(f.store.policyGeneration(cmd.operationId)!.status, 'sealed'); for (const row of batch.evidence ?? []) assert.equal(existsSync(row.cleanup.temporaryRoot), false);
	} finally { await f.close(); }
});

test('stopping during home preparation or failing PID persistence releases every owned resource before returning', async t => {
	for (const mode of ['stop', 'persist'] as const) {
		const f = await fixture(); let pid: number | null = null; let root = '';
		try {
			const cmd = generation(f); await f.runtime.review.command(cmd); await f.runtime.review.whenIdle();
			const evaluate = evaluation(f, cmd.operationId); f.store.policyCommand(evaluate, f.root, undefined, policyExecutionRuntime());
			const controller = new AbortController(); const record = f.store.recordPolicyResource;
			const resource = t.mock.method(f.store, 'recordPolicyResource', (...args: Parameters<typeof record>) => {
				root = args[2]; pid = args[3];
				if (mode === 'persist' && pid !== null) throw new Error('Controlled PID persistence failure');
				return record(...args);
			});
			const write = filePromises.writeFile;
			const marker = t.mock.method(filePromises, 'writeFile', async (...args: Parameters<typeof write>) => {
				await write(...args);
				if (mode === 'stop' && String(args[0]).endsWith('/owner.json')) { f.store.stopPolicyBatch(evaluate.operationId, 'cancelled'); controller.abort(); }
			}); syncBuiltinESMExports();
			try {
				await executeAuthorizedPolicyBatch(f.runtime.ctx, f.store, evaluate.operationId, controller.signal);
				assert.equal(f.store.policyBatch(evaluate.operationId)!.evaluation!.status, 'incomplete');
				assert.equal(f.runtime.requests.length, 0); assert.equal(existsSync(root), false, mode);
				if (pid !== null) assert.throws(() => process.kill(pid!, 0), /ESRCH/);
			} finally { marker.mock.restore(); resource.mock.restore(); syncBuiltinESMExports(); }
		} finally {
			if (pid !== null) { try { process.kill(pid, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } await until(() => { try { process.kill(pid!, 0); return false; } catch { return true; } }); }
			if (root) rmSync(root, { recursive: true, force: true });
			await f.close();
		}
	}
});
