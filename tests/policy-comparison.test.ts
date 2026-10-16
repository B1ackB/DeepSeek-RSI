import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { openStore } from '../src/store.ts';
import { policyCase, evaluatePolicyBatch } from '../src/policy-evaluation.ts';
import { freezePolicyRun, policyCaseIdSchema, policyBatchSchema } from '../src/policy-contracts.ts';
import { runPolicyComparison } from '../scripts/policy-comparison.ts';

const baseline = { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Inspect the repository before answering.' };
const candidate = { ...baseline, instructions: 'Search, inspect and cross-check source evidence before citing it.' };
const config = { caseId: 'symbol', baseline, candidate };
function temporary() { return mkdtempSync(join(tmpdir(), 'rsi-paired-')); }
type Comparison = Awaited<ReturnType<typeof runPolicyComparison>>;
function cleaned(result: Comparison) {
	for (const worker of result.workers) {
		assert.equal(worker.cleanup.processExited, true); assert.equal(worker.cleanup.directoryRemoved, true); assert.equal(existsSync(worker.cleanup.temporaryRoot), false);
		assert.equal(worker.worker!.credentialsAbsent, true); assert.equal(worker.disposed?.forbiddenExecutions ?? 0, 0);
		if (worker.disposed) assert.equal(worker.disposed.agents, 0);
		assert.deepEqual(worker.dispatch.map(row => row.attemptId), worker.attempts.map(row => row.attemptId));
	}
}

test('six fixed complete-task cases run both isolated children in one durable batch per case', { timeout: 20000 }, async () => {
	const dir = temporary();
	try {
		for (const caseId of policyCaseIdSchema.options) {
			const file = join(dir, `${caseId}.sqlite`); const result = await runPolicyComparison(file, { ...config, caseId }); cleaned(result);
			assert.equal(result.error, null); assert.equal(result.batch.status, 'completed'); assert.equal(result.evaluation.status, 'passed', JSON.stringify(result.evaluation));
			assert.equal(result.workers.length, 2); assert.notEqual(result.workers[0].worker!.pid, result.workers[1].worker!.pid);
			assert.equal(result.batch.authorization.runs[0].run.conditionsDigest, result.batch.authorization.runs[1].run.conditionsDigest);
			assert.equal(new Set(result.workers.map(row => row.runtimeDigest)).size, 1);
			const requests = policyCase(caseId).reads.length + 2;
			assert.equal(result.accounting.attempts.length, 2 * requests); assert.equal(result.accounting.totalTokens, 30 * requests);
			assert.ok(result.accounting.attempts.every(row => row.owner === 'rsi' && row.ownerId === result.batch.authorization.id));
			assert.deepEqual(result.accounting.attempts.map(row => row.purpose), [...Array(requests).fill('baseline'), ...Array(requests).fill('evaluation')]);
			assert.deepEqual(result.batch.progress.map(row => row.resource!.pid), result.workers.map(row => row.worker!.pid));
			assert.equal(result.workers[1].beforeRecovery.length, requests, 'Candidate ledger evidence includes only its own session');
			const store = openStore(file);
			try { assert.deepEqual(store.policyBatch(result.batch.authorization.id), result.batch); assert.deepEqual(store.evaluatePolicy(result.batch.authorization.id), result.evaluation); } finally { store.close(); }
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('one cumulative batch budget limits the candidate and can stop before its process is launched', { timeout: 10000 }, async () => {
	const dir = temporary();
	try {
		for (const [index, budget] of [{ maxRequests: 4, tokenStopThreshold: 1000, maxDurationMs: 30000 }, { maxRequests: 6, tokenStopThreshold: 45, maxDurationMs: 30000 }, { maxRequests: 3, tokenStopThreshold: 1000, maxDurationMs: 30000 }].entries()) {
			const result = await runPolicyComparison(join(dir, `${index}.sqlite`), { ...config, budget }); cleaned(result);
			assert.equal(result.evaluation.status, 'incomplete'); assert.equal(result.workers.length, index === 0 ? 2 : 1);
			assert.equal(result.accounting.attempts.length, index === 0 ? 4 : 3); assert.equal(result.accounting.totalTokens, index === 0 ? 60 : 45);
			assert.equal(result.batch.progress[0].status, 'completed'); assert.notEqual(result.batch.progress[1].status, 'completed');
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unknown usage on either side persists, stops the batch and cannot be resumed by reopening authorization', { timeout: 10000 }, async () => {
	const dir = temporary();
	try {
		for (const modes of [['unknown', 'complete'], ['complete', 'unknown']]) {
			const file = join(dir, `${modes[0]}.sqlite`); const result = await runPolicyComparison(file, config, modes); cleaned(result);
			assert.equal(result.evaluation.status, 'incomplete'); assert.equal(result.accounting.totalTokens, null);
			assert.equal(result.workers.length, modes[0] === 'unknown' ? 1 : 2);
			const store = openStore(file);
			try {
				assert.deepEqual(store.authorizePolicyBatch(result.batch.authorization), result.batch);
				assert.equal(store.policyAccounting(result.batch.authorization.policyId).totalTokens, null);
				assert.throws(() => store.startPolicyRun(result.batch.authorization.id, result.batch.authorization.runs.at(-1)!.run.runId), /cannot start/);
				assert.equal(store.snapshot().attempts.length, result.accounting.attempts.length);
			} finally { store.close(); }
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('child loss on either side recovers shared reservations and resource ownership without replay', { timeout: 10000 }, async () => {
	const dir = temporary();
	try {
		for (const modes of [['crash', 'complete'], ['complete', 'crash']]) {
			const file = join(dir, `${modes[0]}.sqlite`); const result = await runPolicyComparison(file, config, modes); cleaned(result);
			assert.equal(result.batch.status, 'interrupted'); assert.equal(result.evaluation.status, 'incomplete'); assert.equal(result.accounting.totalTokens, null);
			assert.equal(result.accounting.attempts.at(-1)!.state, 'interrupted'); assert.equal(result.workers.at(-1)!.beforeRecovery[0].state, 'in_flight');
			if (modes[0] === 'complete') assert.equal(result.batch.progress[0].status, 'completed');
			const store = openStore(file); try { assert.deepEqual(store.policyBatch(result.batch.authorization.id), result.batch); assert.equal(store.snapshot().attempts.length, result.accounting.attempts.length); } finally { store.close(); }
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wrong facts and citations fail fixed checks, and a tool-free correct answer cannot pass infrastructure', { timeout: 10000 }, async () => {
	const dir = temporary();
	try {
		for (const mode of ['wrong_answer', 'bad_citation', 'no_tools']) {
			const result = await runPolicyComparison(join(dir, `${mode}.sqlite`), config, ['complete', mode]); cleaned(result);
			assert.equal(result.batch.status, 'completed', 'Execution outcome remains separate from fixed quality');
			assert.equal(result.evaluation.status, mode === 'no_tools' ? 'incomplete' : 'failed');
			if (mode === 'wrong_answer') assert.equal(result.evaluation.sides[1].facts, false);
			if (mode === 'bad_citation') assert.equal(result.evaluation.sides[1].citations, false);
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cancel and batch deadline stop a hanging candidate, retain baseline and reap both workers', { timeout: 10000 }, async () => {
	const dir = temporary();
	try {
		for (const cancel of [true, false]) {
			const result = await runPolicyComparison(join(dir, `${cancel}.sqlite`), { ...config, budget: { maxRequests: 6, tokenStopThreshold: 1000, maxDurationMs: cancel ? 30000 : 1500 } }, ['complete', 'hang'], cancel ? 'candidate' : undefined); cleaned(result);
			assert.equal(result.evaluation.status, 'incomplete'); assert.equal(result.accounting.totalTokens, null); assert.equal(result.batch.progress[0].status, 'completed');
			assert.equal(result.workers[1].cancelled, cancel); assert.equal(result.workers[1].timedOut, !cancel);
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixed evaluator rejects changed cases and missing, reassigned or unclean execution evidence', { timeout: 5000 }, async () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite');
	try {
		const result = await runPolicyComparison(file, config); cleaned(result);
		for (const change of [
			(batch: typeof result.batch) => { batch.evidence![1].cleanup.processExited = false; },
			(batch: typeof result.batch) => { batch.evidence![1].cleanup.agentsDisposed = false; },
			(batch: typeof result.batch) => { batch.evidence![1].cleanup.directoryRemoved = false; },
			(batch: typeof result.batch) => { batch.evidence![1].workerPid = batch.evidence![0].workerPid; },
			(batch: typeof result.batch) => { batch.evidence![1].result!.events = batch.evidence![1].result!.events.filter(event => event.type !== 'tool/result'); },
			(batch: typeof result.batch) => { batch.evidence![1].dispatch = []; },
			(batch: typeof result.batch) => { batch.evidence![1].dispatch[1].tools = []; },
			(batch: typeof result.batch) => { batch.evidence![1].dispatch[0].messages = []; },
		]) {
			const batch = structuredClone(result.batch); change(batch); assert.equal(evaluatePolicyBatch(batch, result.accounting.attempts).status, 'incomplete');
		}
		const store = openStore(file);
		try {
			const input = structuredClone(result.batch.authorization); input.id = randomUUID(); input.evaluationSpec!.digest = 'b'.repeat(64);
			assert.throws(() => store.authorizePolicyBatch(input), /fixed checker/);
			const changed = structuredClone(result.batch); changed.authorization.runs[1].run.conditions.question += 'Change the rule'; assert.equal(policyBatchSchema.safeParse(changed).success, false);
			assert.deepEqual(store.recordPolicyEvidence(result.batch.authorization.id, result.batch.evidence![0]), result.batch);
			const evidence = structuredClone(result.batch.evidence![0]); evidence.result!.finalResponse = 'Replacement'; assert.throws(() => store.recordPolicyEvidence(result.batch.authorization.id, evidence), /cannot be replaced/);
			assert.throws(() => store.recordPolicyResource(result.batch.authorization.id, evidence.runId, evidence.cleanup.temporaryRoot, 1), /terminal/);
		} finally { store.close(); }
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('handoff requires an existing batch, preserves active state only during an explicit handoff and does not alter old v7 rows', () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite');
	try {
		assert.throws(() => openStore(file, randomUUID()), /existing store/); assert.equal(existsSync(file), false);
		let store = openStore(file); const id = randomUUID(); const policyId = randomUUID(); const fixed = policyCase('symbol'); const run = freezePolicyRun(baseline, fixed.conditions);
		store.sealPolicyVersion(policyId, run.policy);
		const batch = store.authorizePolicyBatch({ id, policyId, runtimeDigest: 'a'.repeat(64), runs: [{ side: 'candidate', run }], budget: { maxRequests: 3, tokenStopThreshold: 1000, maxDurationMs: 30000 } });
		store.close(); assert.throws(() => openStore(file, randomUUID()), /existing v7 batch/);
		store = openStore(file, id); assert.deepEqual(store.policyBatch(id), batch); assert.throws(() => store.evaluatePolicy(id), /Stop or finish/); store.close();
		store = openStore(file); assert.equal(store.policyBatch(id)!.status, 'interrupted'); assert.equal(store.policyBatch(id)!.evidence, undefined); assert.equal(store.policyBatch(id)!.evaluation, undefined); assert.throws(() => store.evaluatePolicy(id), /no fixed evaluator/); store.close();
		let raw = new DatabaseSync(file); const before = raw.prepare('SELECT data FROM policy_batches WHERE id=?').get(id)!.data; raw.close();
		store = openStore(file); store.close(); raw = new DatabaseSync(file); assert.equal(raw.prepare('SELECT data FROM policy_batches WHERE id=?').get(id)!.data, before); raw.close();
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing cleanup receipt blocks the next child and retains explicit resource ownership for inspection', { timeout: 5000 }, async () => {
	const dir = temporary(); let retained: string | undefined;
	try {
		const result = await runPolicyComparison(join(dir, 'state.sqlite'), config, ['missing_disposal', 'complete']);
		assert.equal(result.evaluation.status, 'incomplete'); assert.equal(result.batch.status, 'interrupted'); assert.match(result.error!, /cleanup is unverified/);
		assert.equal(result.workers.length, 0); assert.equal(result.unverifiedResources.length, 1);
		const resource = result.unverifiedResources[0]; retained = resource.temporaryRoot;
		assert.equal(existsSync(retained), true); assert.throws(() => process.kill(resource.pid!, 0), { code: 'ESRCH' });
		assert.equal(result.accounting.attempts.length, 3, 'Candidate is never dispatched after uncertain cleanup');
	} finally { if (retained) rmSync(retained, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test('controller process loss closes its native child through EOF and restart retains unresolved cleanup without replay', { timeout: 10000 }, async () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); let resource: { root: string; pid: number } | undefined;
	const child = spawn(process.execPath, ['--input-type=module', '-e', "import { runPolicyComparison } from './scripts/policy-comparison.ts'; await runPolicyComparison(process.argv[1], JSON.parse(process.argv[2]), ['hang','complete']);", file, JSON.stringify(config)], { cwd: process.cwd(), detached: true, stdio: 'ignore' });
	const exited = once(child, 'exit');
	try {
		const limit = Date.now() + 5000;
		while (!resource && Date.now() < limit) {
			for (const name of readdirSync(tmpdir()).filter(name => name.startsWith('rsi-policy-sdk-'))) {
				const root = join(tmpdir(), name); const job = join(root, 'home/job.json'); const info = join(root, 'home/worker.json');
				try {
					if (JSON.parse(readFileSync(job, 'utf8')).handoff?.file === file && existsSync(join(root, 'home/dispatch.jsonl'))) resource = { root, pid: JSON.parse(readFileSync(info, 'utf8')).pid };
				} catch { /* Another test may be creating/removing its own home. */ }
			}
			if (!resource) await delay(10);
		}
		assert.ok(resource, 'Owned controller must reach durable first dispatch');
		child.kill('SIGKILL'); await exited;
		let gone = false; const exitLimit = Date.now() + 3000;
		while (!gone && Date.now() < exitLimit) {
			try { process.kill(resource.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; gone = true; }
			if (!gone) await delay(20);
		}
		assert.equal(gone, true, 'Native SDK server must exit on controller stdin EOF');
		const store = openStore(file);
		try {
			const id = store.policyRunBinding(store.snapshot().attempts[0].sessionId!)!.batch.authorization.id;
			const batch = store.policyBatch(id)!; assert.equal(batch.status, 'interrupted'); assert.deepEqual(batch.progress.map(row => row.status), ['interrupted', 'interrupted']);
			assert.equal(store.snapshot().attempts.length, 1); assert.equal(store.snapshot().attempts[0].state, 'interrupted'); assert.equal(store.snapshot().attempts[0].usageState, 'unknown');
			assert.equal(batch.progress[0].resource!.pid, resource.pid); assert.equal(batch.evidence, undefined); assert.equal(store.evaluatePolicy(id).status, 'incomplete');
			assert.equal(existsSync(resource.root), true, 'Restart reports the retained home instead of inventing cleanup proof');
		} finally { store.close(); }
	} finally {
		// This test created a dedicated process group; never use a historical/user PID for termination.
		try { process.kill(-child.pid!, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
		await exited;
		if (resource) rmSync(resource.root, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true });
	}
});
