import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { DeepSeekHarness, type RunResult } from '@deepseek-ai/dsh-sdk-client';
import { attemptSchema } from '../src/contracts.ts';
import { freezePolicyRun, policyDigest, policyRunSchema, policyBatchSchema, policyVersionSchema, policyDispatchSchema } from '../src/policy-contracts.ts';
import { openStore } from '../src/store.ts';
import { fixtureModeSchema, policyHandoffSchema } from './policy-fixture-worker.ts';

const root = resolve(import.meta.dirname, '..');
const worker = join(root, '.cache', `policy-fixture-worker-${process.pid}.js`);
let bundled: Promise<unknown> | undefined;
const workerInfoSchema = z.strictObject({ pid: z.number().int().positive(), runId: z.uuid(), policyId: z.uuid(), batchId: z.uuid(), credentialsAbsent: z.literal(true) });
const disposedSchema = z.strictObject({ requests: z.number().int().nonnegative(), forbiddenExecutions: z.number().int().nonnegative(), agents: z.number().int().nonnegative() });
function gone(pid: number) {
	try { process.kill(pid, 0); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error; }
}
async function optional(path: string) { try { return await readFile(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } }
function persisted(file: string) {
	const db = new DatabaseSync(file, { readOnly: true });
	try { return { attempts: db.prepare('SELECT data FROM attempts ORDER BY rowid').all().map(row => attemptSchema.parse(JSON.parse(String(row.data)))), batches: db.prepare('SELECT data FROM policy_batches ORDER BY rowid').all().map(row => policyBatchSchema.parse(JSON.parse(String(row.data)))), versions: db.prepare('SELECT data FROM policy_versions ORDER BY rowid').all().map(row => policyVersionSchema.parse(JSON.parse(String(row.data)))), schemaVersion: db.prepare('PRAGMA user_version').get()!.user_version }; }
	finally { db.close(); }
}

/** Native SDK lifecycle and fixture provider only. Never reads an existing Harness home. */
export async function policyRuntime() {
	const cliPackage = createRequire(import.meta.resolve('@deepseek-ai/dsh-sdk-client')).resolve('@deepseek-ai/dsh/package.json');
	const harnessRoot = resolve(cliPackage, '../../..');
	const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, encoding: 'utf8' }).trim();
	if (commit !== 'd347e703908d0406b7a7ef80e3a0e594d86b2215') throw new Error('Policy fixture requires the pinned Harness');
	bundled ??= build({ entryPoints: [join(root, 'scripts/policy-fixture-worker.ts')], outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
	await bundled;
	const runtimeDigest = policyDigest([commit, await readFile(worker, 'utf8'), await readFile(fileURLToPath(import.meta.url), 'utf8'), await readFile(join(root, 'scripts/policy-comparison.ts'), 'utf8'), await readFile(join(root, 'src/policy-evaluation.ts'), 'utf8')]);
	return { commit, runtimeDigest };
}
export async function runPolicyFixture(input: unknown, modeInput: unknown = 'complete', cancelAfterDispatch = false, handoffInput?: unknown) {
	const run = policyRunSchema.parse(input); const mode = fixtureModeSchema.parse(modeInput);
	const handoff = handoffInput === undefined ? undefined : policyHandoffSchema.parse(handoffInput);
	const { commit, runtimeDigest } = await policyRuntime();
	if (handoff && handoff.runtimeDigest !== runtimeDigest) throw new Error('Worker runtime changed after authorization');
	const temporaryRoot = await mkdtemp(join(tmpdir(), 'rsi-policy-sdk-'));
	if (handoff) {
		try {
			const controller = openStore(handoff.file, handoff.batchId);
			try { controller.recordPolicyResource(handoff.batchId, run.runId, temporaryRoot, null); } finally { controller.close(); }
		} catch (error) { await rm(temporaryRoot, { recursive: true }); throw error; }
	}
	const home = join(temporaryRoot, 'home');
	const cwd = join(temporaryRoot, 'workspace');
	const profile = join(home, 'profiles', 'rsi-policy-fixture');
	await mkdir(profile, { recursive: true }); await mkdir(cwd);
	const job = join(home, 'job.json');
	await writeFile(job, JSON.stringify({ run, mode, runtimeDigest, handoff }), { mode: 0o400 });
	await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'rsi-policy-fixture', private: true, type: 'module', dsh: { profile: { bundles: [], patchReload: 'startup' } } }));
	const entries = [
		{ id: 'app', name: '@deepseek-ai/dsh-sdk-app', config: { profile: 'rsi-policy-fixture' } },
		{ id: 'llm', name: '@deepseek-ai/dsh-llm' },
		{ id: 'session', name: '@deepseek-ai/dsh-session' },
		{ id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
		{ id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: { includeHarnessIdentity: false, includeRuntimeContext: false } },
		{ id: 'tools', name: '@deepseek-ai/dsh-tools' },
		{ id: 'agent', name: '@deepseek-ai/dsh-agent' },
		{ id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [], maxParallelToolCalls: 1 } },
		{ id: 'fixture', name: pathToFileURL(worker).href },
		{ id: 'server', name: '@deepseek-ai/dsh-sdk-jsonrpc-server', inject: ['sdkAppStartup', 'loader'], config: { maxTokensAsSuccess: false } },
	];
	await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([{ insert: entries }]));
	const sdk = new DeepSeekHarness({ profile: 'rsi-policy-fixture', dshHome: home, processCwd: cwd, cwd, provider: run.conditions.provider, model: run.conditions.model, maxTokens: run.conditions.budget.maxOutputTokens,
		env: { PATH: process.env.PATH, DSH_TELEMETRY_DISABLED: '1', DSH_TELEMETRY_MODE: 'DISABLED', RSI_POLICY_FIXTURE_JOB: job },
		initializeTimeoutMs: 10000, requestTimeoutMs: 10000, shutdownTimeoutMs: 300, disposeEofGraceMs: 500, disposeGraceMs: 1000 });
	let result: RunResult | undefined;
	let error: string | null = null;
	let cancelled = false;
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let workerInfo: z.infer<typeof workerInfoSchema> | undefined;
	try {
		await sdk.start();
		workerInfo = workerInfoSchema.parse(JSON.parse(await readFile(join(home, 'worker.json'), 'utf8')));
		if (workerInfo.runId !== run.runId) throw new Error('Worker identity changed');
		const running = sdk.run(run.conditions.question, { sessionId: run.runId }).then(result => ({ result, error: null }), failure => ({ result: undefined, error: failure instanceof Error ? failure.message : String(failure) }));
		timer = setTimeout(() => { timedOut = true; void sdk.close().catch(() => {}); }, Math.max(0, Math.min(run.conditions.budget.maxDurationMs, (handoff?.deadline ?? Infinity) - Date.now())));
		if (cancelAfterDispatch) {
			const deadline = Date.now() + 5000;
			while (!(await optional(join(home, 'dispatch.jsonl')))) { if (Date.now() >= deadline) throw new Error('Worker never reached dispatch'); await delay(10); }
			cancelled = true; await sdk.close();
		}
		const settled = await running; result = settled.result; error = settled.error;
	} catch (failure) {
		error = failure instanceof Error ? failure.message : String(failure);
	} finally {
		clearTimeout(timer);
		// Native SDK owns shutdown/EOF/SIGTERM/SIGKILL. Retain the home if cleanup cannot be proved.
		try { await sdk.close(); } catch (failure) { throw new Error(`Policy fixture cleanup failed; retained ${temporaryRoot}`, { cause: failure }); }
		if (workerInfo && !gone(workerInfo.pid)) throw new Error(`Policy worker still alive; retained ${temporaryRoot}`);
	}
	const ledger = handoff?.file ?? join(home, 'attempts.sqlite');
	let ledgerExists = true;
	try { await access(ledger); } catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ENOENT') throw failure; ledgerExists = false; }
	const before = ledgerExists ? persisted(ledger) : null;
	const beforeRecovery = before?.attempts.filter(row => row.sessionId === run.runId) ?? [];
	if (!handoff && mode === 'crash' && ledgerExists) { const recovery = openStore(ledger); recovery.close(); }
	const records = ledgerExists ? persisted(ledger) : null;
	const rows = records?.attempts.filter(row => row.sessionId === run.runId) ?? [];
	const disposed = await optional(join(home, 'disposed.json'));
	const disposal = disposed ? disposedSchema.parse(JSON.parse(disposed)) : null;
	if (mode !== 'crash' && (!disposal || disposal.agents !== 0)) throw new Error(`Policy Agent cleanup is unverified; retained ${temporaryRoot}`);
	if (disposal && disposal.forbiddenExecutions !== 0) throw new Error(`Forbidden policy tool executed; retained ${temporaryRoot}`);
	const dispatch = (await optional(join(home, 'dispatch.jsonl')) ?? '').trim().split('\n').filter(Boolean).map(line => policyDispatchSchema.parse(JSON.parse(line)));
	const evidence = { run, runId: run.runId, policyDigest: run.policyDigest, conditionsDigest: run.conditionsDigest, runtimeDigest, harnessCommit: commit, worker: workerInfo, result, error, cancelled, timedOut, attempts: rows, beforeRecovery, beforeBatches: before?.batches ?? [], batches: records?.batches ?? [], versions: records?.versions ?? [], schemaVersion: records?.schemaVersion, dispatch, disposed: disposal, cleanup: { processExited: true, temporaryRoot, directoryRemoved: false } };
	await rm(temporaryRoot, { recursive: true });
	try { await access(temporaryRoot); throw new Error('Policy fixture directory remains'); } catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ENOENT') throw failure; }
	evidence.cleanup.directoryRemoved = true;
	return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const run = freezePolicyRun({ schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Search source, read evidence, then cite the implementation.' }, {
		schemaVersion: 1, question: 'Explain total and cite its implementation.', files: [{ path: 'sample.js', content: 'export function total(value) {\n\treturn value + 1;\n}\n' }],
		provider: 'rsi-policy-fixture', model: 'offline-v1', budget: { maxRequests: 3, maxOutputTokens: 512, maxInputBytes: 32768, tokenStopThreshold: 1000, maxToolCalls: 4, maxToolResultBytes: 4096, maxDurationMs: 5000 },
	});
	const result = await runPolicyFixture(run);
	const output = join(root, '.cache', 'policy-fixture-result.json');
	await writeFile(output, `${JSON.stringify(result, null, '\t')}\n`);
	if (result.error || result.result?.events.findLast(event => event.type === 'turn/end')?.data.reason.kind !== 'completed') throw new Error(`Policy fixture failed; evidence: ${output}`);
	console.log(`Policy fixture completed: ${result.attempts.length} requests, owned process exited and directory removed; ${output}`);
}
