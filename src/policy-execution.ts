import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { fork } from 'node:child_process';
import { mkdtemp, rm, access, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Store } from './store.ts';
import { policyDigest, policyEvidenceSchema, type PolicyRun, type PolicyEvidence } from './policy-contracts.ts';
import { evaluatePolicyBatch, sourceEvaluation } from './policy-evaluation.ts';
import { POLICY_AUTHORITY, checkPolicySessionRequest } from './policy.ts';
import { boundedPolicyMessage, policyProcessOwnershipSchema, policyProcessRequestSchema, policyProcessResultSchema, policyProcessInputSchema } from './policy-process-contracts.ts';

const workerPath = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './policy-worker.ts' : './policy-worker.js', import.meta.url));
export function policyExecutionRuntime() {
	return policyDigest([process.version, evaluatePolicyBatch.toString(), sourceEvaluation.toString(), readFileSync(workerPath, 'utf8'), readFileSync(fileURLToPath(import.meta.url), 'utf8'), ...['@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-llm'].map(name => readFileSync(fileURLToPath(import.meta.resolve(name)), 'utf8'))]);
}
async function executeSide(ctx: Context, store: Store, batchId: string, run: PolicyRun, signal: AbortSignal): Promise<PolicyEvidence> {
	const root = await mkdtemp(join(tmpdir(), 'rsi-policy-evaluation-'));
	try { signal.throwIfAborted(); store.recordPolicyResource(batchId, run.runId, root, null); await writeFile(join(root, 'owner.json'), JSON.stringify(policyProcessOwnershipSchema.parse({ batchId, runId: run.runId, parentPid: process.pid })), { mode: 0o400, flag: 'wx' }); signal.throwIfAborted(); } catch (failure) { await rm(root, { recursive: true }); throw failure; }
	let child: ReturnType<typeof fork>;
	try { child = fork(workerPath, [], { cwd: root, env: { PATH: process.env.PATH, TMPDIR: tmpdir(), DSH_HOME: join(root, 'home'), DSH_TELEMETRY_MODE: 'DISABLED' }, execArgv: [], silent: true }); }
	catch (failure) { await rm(root, { recursive: true }); throw failure; }
	const closed = new Promise<void>(resolve => { child.once('exit', () => resolve()); child.once('error', () => resolve()); });
	let spawnFailed = false; child.once('error', () => { spawnFailed = true; });
	let result: ReturnType<typeof policyProcessResultSchema.parse> | undefined; let error: string | null = null; let requests = 0;
	const dispatch: PolicyEvidence['dispatch'] = []; const work = new Set<Promise<void>>();
	let term: ReturnType<typeof setTimeout> | undefined; let kill: ReturnType<typeof setTimeout> | undefined;
	const abort = () => { if (child.connected) child.send({ type: 'abort' }); term ??= setTimeout(() => { child.kill('SIGTERM'); kill = setTimeout(() => child.kill('SIGKILL'), 500); }, 500); };
	let bytes = 0; const output = (data: Buffer) => { if ((bytes += data.length) > 65536) { error = 'Policy worker output exceeded limit'; abort(); } };
	child.stdout?.on('data', output); child.stderr?.on('data', output);
	async function request(raw: unknown) {
		const message = policyProcessRequestSchema.parse(boundedPolicyMessage(raw));
		if (result || signal.aborted || message.request !== ++requests || message.options.sessionId !== run.runId) throw new Error('Policy request identity or sequence changed');
		const options = message.options as unknown as GenerateOptions;
		checkPolicySessionRequest(run, options);
		if (options.system !== `${POLICY_AUTHORITY}\n\n${run.policy.instructions}`) throw new Error('Policy authority differs from frozen request');
		const chunks: StreamChunk[] = []; let recorded = false; let failure: string | null = null;
		try {
			for await (const chunk of ctx.llm.stream({ ...options, signal })) {
				if (!recorded) {
					const attempt = store.snapshot().attempts.findLast(row => row.sessionId === run.runId);
					if (attempt?.state !== 'in_flight' || dispatch.some(row => row.attemptId === attempt.attemptId)) throw new Error('Policy dispatch has no new reserved attempt');
					dispatch.push({ ...message.options, attemptId: attempt.attemptId, state: 'in_flight', request: requests, policyPresent: true, authorityPresent: true, tools: message.options.tools, messages: message.options.messages }); recorded = true;
				}
				chunks.push(chunk); boundedPolicyMessage(chunks);
			}
		} catch (caught) { failure = caught instanceof Error ? caught.message.slice(0, 4000) : 'Policy model request failed'; }
		if (!signal.aborted && child.connected) child.send(policyProcessInputSchema.parse(boundedPolicyMessage({ type: 'response', request: message.request, chunks, error: failure })));
	}
	child.on('message', raw => {
		try {
			if (typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'result') { if (result || work.size) throw new Error('Unexpected policy terminal result'); result = policyProcessResultSchema.parse(boundedPolicyMessage(raw)); }
			else { if (work.size) throw new Error('Concurrent policy model requests denied'); const task = request(raw).catch(caught => { error = caught instanceof Error ? caught.message.slice(0, 4000) : 'Policy IPC failed'; abort(); }); work.add(task); void task.finally(() => work.delete(task)); }
		} catch (caught) { error = caught instanceof Error ? caught.message.slice(0, 4000) : 'Invalid policy worker result'; abort(); }
	});
	signal.addEventListener('abort', abort, { once: true });
	try { store.recordPolicyResource(batchId, run.runId, root, child.pid ?? null); if (signal.aborted) abort(); else child.send({ type: 'run', run }); await closed; await Promise.allSettled(work); }
	catch (failure) { error = failure instanceof Error ? failure.message.slice(0, 4000) : 'Policy worker startup failed'; abort(); await closed; await Promise.allSettled(work); }
	finally { signal.removeEventListener('abort', abort); clearTimeout(term); clearTimeout(kill); }
	let processExited = spawnFailed || child.exitCode !== null || child.signalCode !== null;
	if (child.pid) { try { process.kill(child.pid, 0); processExited = false; } catch (caught) { if ((caught as NodeJS.ErrnoException).code !== 'ESRCH') throw caught; } }
	if (!processExited) throw new Error(`Policy process cleanup unverified; retained ${root}`);
	await rm(root, { recursive: true });
	let removed = false; try { await access(root); } catch (caught) { if ((caught as NodeJS.ErrnoException).code !== 'ENOENT') throw caught; removed = true; }
	return policyEvidenceSchema.parse({ runId: run.runId, policyDigest: run.policyDigest, conditionsDigest: run.conditionsDigest, runtimeDigest: store.policyBatch(batchId)!.authorization.runtimeDigest, workerPid: child.pid ?? null, result: result?.result ?? null, dispatch: dispatch.map(({ attemptId, state, request, policyPresent, authorityPresent, system, tools, messages }) => ({ attemptId, state, request, policyPresent, authorityPresent, system, tools, messages })), error: error ?? result?.error ?? (result && child.exitCode === 0 ? null : 'Policy worker exited without complete evidence'), cleanup: { processExited, agentsDisposed: result?.agentsDisposed === true, directoryRemoved: removed, forbiddenExecutions: 0, temporaryRoot: root } });
}
/** Live sidebar path: one host ledger, two independent native Agent processes. */
export async function executeAuthorizedPolicyBatch(ctx: Context, store: Store, id: string, signal?: AbortSignal) {
	const batch = store.policyBatch(id); if (!batch || batch.status !== 'authorized' || batch.authorization.runtimeDigest !== policyExecutionRuntime()) throw new Error('Policy batch cannot start, change runtime or replay');
	const controller = new AbortController(); const abort = AbortSignal.any([controller.signal, ...signal ? [signal] : []]);
	const timer = setTimeout(() => controller.abort(), Math.max(0, batch.deadline - Date.now()));
	try {
		for (const { run } of batch.authorization.runs) {
			abort.throwIfAborted(); store.startPolicyRun(id, run.runId); const started = performance.now();
			const side = new AbortController(); const window = setTimeout(() => side.abort(), run.conditions.budget.maxDurationMs);
			let evidence: PolicyEvidence;
			try { evidence = await executeSide(ctx, store, id, run, AbortSignal.any([abort, side.signal])); } finally { clearTimeout(window); }
			store.recordPolicyEvidence(id, evidence);
			const rows = store.snapshot().attempts.filter(row => row.sessionId === run.runId);
			const end = evidence.result?.events.at(-1);
			const complete = !abort.aborted && !side.signal.aborted && performance.now() - started < run.conditions.budget.maxDurationMs && Date.now() >= batch.createdAt && Date.now() < batch.deadline && !evidence.error && end?.type === 'turn/end' && z.object({ reason: z.object({ kind: z.literal('completed') }) }).safeParse(end.data).success && rows.length > 0 && rows.every(row => row.state === 'succeeded' && row.usageState === 'confirmed');
			if (!['authorized', 'running'].includes(store.policyBatch(id)!.status)) break;
			store.finishPolicyRun(id, run.runId, complete ? 'completed' : abort.aborted ? 'cancelled' : 'failed');
			if (!complete) { store.stopPolicyBatch(id, abort.aborted ? 'cancelled' : 'failed'); break; }
		}
	} catch { store.stopPolicyBatch(id, abort.aborted ? 'cancelled' : 'failed'); }
	finally { clearTimeout(timer); controller.abort(); }
	return store.evaluatePolicy(id);
}
