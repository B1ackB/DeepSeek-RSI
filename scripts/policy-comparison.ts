import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { openStore, type Store } from '../src/store.ts';
import { policyCase } from '../src/policy-evaluation.ts';
import { freezePolicyRun, policyBatchInputSchema, policyContentSchema, policyCaseIdSchema, type PolicyEvidence } from '../src/policy-contracts.ts';
import { fixtureModeSchema } from './policy-fixture-worker.ts';
import { policyRuntime, runPolicyFixture } from './policy-fixture.ts';

export const comparisonFixtureSchema = z.strictObject({ caseId: policyCaseIdSchema, baseline: policyContentSchema, candidate: policyContentSchema, budget: policyBatchInputSchema.shape.budget.optional() });
/** One concrete offline comparison. Each call is a new explicit fixture authorization. */
async function preparePolicyComparison(file: string, input: unknown) {
	const config = comparisonFixtureSchema.parse(input);
	const fixed = policyCase(config.caseId); const runtime = await policyRuntime();
	file = resolve(file);
	let store: Store | undefined = openStore(file);
	const id = randomUUID(); const policyId = randomUUID();
	const baseline = freezePolicyRun(config.baseline, fixed.conditions); const candidate = freezePolicyRun(config.candidate, fixed.conditions);
	try {
		store.sealPolicyVersion(policyId, baseline.policy);
		if (baseline.policyDigest !== candidate.policyDigest) store.sealPolicyVersion(policyId, candidate.policy, baseline.policyDigest);
		const batch = store.authorizePolicyBatch({ id, policyId, runtimeDigest: runtime.runtimeDigest, evaluationSpec: fixed.spec, runs: [{ side: 'baseline', run: baseline }, { side: 'candidate', run: candidate }], budget: config.budget ?? { maxRequests: 2 * (fixed.reads.length + 2), tokenStopThreshold: 2000, maxDurationMs: 30000 } });
		return batch.authorization.id;
	} finally { store.close(); }
}

export async function runPolicyComparison(file: string, input: unknown, modesInput: unknown = ['complete', 'complete'], cancelSide?: 'baseline' | 'candidate') {
	z.tuple([fixtureModeSchema, fixtureModeSchema]).parse(modesInput);
	const id = await preparePolicyComparison(file, input);
	return executePolicyComparison(file, id, modesInput, cancelSide);
}
/** Execute only a separately authorized, never-started batch. */
export async function executePolicyComparison(file: string, id: string, modesInput: unknown = ['complete', 'complete'], cancelSide?: 'baseline' | 'candidate') {
	const modes = z.tuple([fixtureModeSchema, fixtureModeSchema]).parse(modesInput); const runtime = await policyRuntime();
	file = resolve(file);
	let store: Store | undefined = openStore(file, id);
	const batch = store.policyBatch(id)!; const policyId = batch.authorization.policyId;
	if (batch.status !== 'authorized' || batch.authorization.runtimeDigest !== runtime.runtimeDigest || batch.authorization.evaluationSpec?.evaluator !== 'repository-evidence-v1') { store.close(); throw new Error('Batch cannot start, change runtime or replay'); }
	const caseId = batch.authorization.evaluationSpec.caseId;
	const workers: Awaited<ReturnType<typeof runPolicyFixture>>[] = []; let error: string | null = null;
	try {
		for (const [index, entry] of batch.authorization.runs.entries()) {
			store.startPolicyRun(id, entry.run.runId);
			const active = store.policyBatch(id)!;
			const deadline = Math.min(active.deadline, active.progress[index].startedAt! + entry.run.conditions.budget.maxDurationMs);
			store.close(); store = undefined;
			const worker = await runPolicyFixture(entry.run, modes[index], cancelSide === entry.side, { file, batchId: id, policyId, runtimeDigest: runtime.runtimeDigest, caseId, deadline });
			workers.push(worker);
			store = openStore(file, id);
			const evidence: PolicyEvidence = {
				runId: entry.run.runId, policyDigest: entry.run.policyDigest, conditionsDigest: entry.run.conditionsDigest, runtimeDigest: worker.runtimeDigest, workerPid: worker.worker?.pid ?? null,
				result: worker.result ? { sessionId: worker.result.sessionId, finalResponse: worker.result.finalResponse, events: JSON.parse(JSON.stringify(worker.result.events)) } : null,
				dispatch: worker.dispatch, error: worker.error,
				cleanup: { ...worker.cleanup, agentsDisposed: worker.disposed?.agents === 0, forbiddenExecutions: worker.disposed?.forbiddenExecutions ?? 0 },
			};
			store.recordPolicyEvidence(id, evidence);
			const reason = worker.result?.events.findLast(event => event.type === 'turn/end')?.data.reason.kind;
			const complete = reason === 'completed' && worker.attempts.length > 0 && worker.attempts.every(row => row.state === 'succeeded' && row.usageState === 'confirmed');
			if (reason && !worker.attempts.some(row => ['reserved', 'in_flight', 'interrupted'].includes(row.state))) store.finishPolicyRun(id, entry.run.runId, complete ? 'completed' : reason === 'aborted' ? 'cancelled' : 'failed');
			if (!complete) { error = worker.error ?? `Incomplete ${entry.side} task: ${reason ?? 'missing terminal event'}`; break; }
		}
	} catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
	finally { store?.close(); }
	// All owned SDK calls have closed before normal recovery can interrupt unfinished work.
	let recovered: Store;
	try { recovered = openStore(file); }
	catch (failure) { throw new Error(`Policy recovery is unverified; retained ${file}. ${error ?? ''}`, { cause: failure }); }
	try {
		const batch = recovered.policyBatch(id);
		if (!batch) throw new Error(error ?? 'Batch was not authorized');
		const evaluation = recovered.evaluatePolicy(id);
		return { file, batch: recovered.policyBatch(id)!, evaluation, accounting: recovered.policyAccounting(policyId, id), workers, error, runtime, unverifiedResources: batch.progress.flatMap(row => row.resource && !batch.evidence?.some(item => item.runId === row.runId && item.cleanup.processExited && item.cleanup.directoryRemoved) ? [row.resource] : []) };
	} finally { recovered.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = resolve(import.meta.dirname, '..', '.cache', `policy-comparison-${randomUUID()}`); await mkdir(root, { recursive: true });
	const result = await runPolicyComparison(join(root, 'controller.sqlite'), { caseId: 'symbol', baseline: { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Inspect source before answering.' }, candidate: { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Search, read and cite repository evidence.' } });
	await writeFile(join(root, 'result.json'), `${JSON.stringify(result, null, '\t')}\n`);
	if (result.evaluation.status !== 'passed') throw new Error(`Comparison failed; retained ${root}`);
	console.log(`Offline paired task passed: ${result.accounting.attempts.length} requests, ${result.accounting.totalTokens} synthetic tokens; ${root}`);
}
