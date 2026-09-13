import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { fault } from './contracts.ts';
import type { Store } from './store.ts';
import type { FlowTask } from './mainflow-contracts.ts';
import type { G1Command } from './g1-contracts.ts';
import { comparisonSchema, type ComparisonRun } from './comparison-contracts.ts';
import { artifactSchema } from './scenarios/contracts.ts';
import { verify } from './candidates.ts';
import { redact } from './text.ts';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function applyComparison(ctx: Context, store: Store, sessions: Map<string, string>, checkedSkill: (id: string) => Promise<unknown>) {
	const controllers = new Map<string, AbortController>();
	const jobs = new Set<Promise<void>>();
	const root = join(process.env.DSH_HOME!, 'rsi', 'artifacts');
	const get = (id: string) => { const task = store.business().mainflow.tasks.find(t => t.id === id); if (!task) throw fault('task_missing', '任务不存在'); return task; };
	const update = (id: string, change: (task: FlowTask) => void) => store.mutateBusiness(s => change(s.mainflow.tasks.find(t => t.id === id)!));
	async function run(taskId: string) {
		const task = get(taskId); const comparison = task.comparison!;
		const controller = new AbortController(); controllers.set(taskId, controller);
		const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, comparison.deadline - Date.now()))]);
		try {
			for (const frozen of comparison.runs) {
				signal.throwIfAborted();
				await checkedSkill(task.skillId);
				const snap = frozen.side === 'baseline' ? task.baseline : task.candidate!.snapshot;
				await verify(frozen.side === 'baseline' ? task.baselineRoot : task.candidate!.root, snap);
				const started = performance.now();
				update(taskId, t => { const r = t.comparison!.runs.find(r => r.side === frozen.side)!; r.status = 'running'; r.startedAt = Date.now(); });
				sessions.set(frozen.sessionId, comparison.id);
				try {
					let output = ''; let finished = false;
					for await (const chunk of ctx.llm.stream({ provider: comparison.budget.provider, model: comparison.budget.model, reasoningEffort: ReasoningEffortId(comparison.budget.reasoningEffort), maxTokens: comparison.budget.maxOutputTokens, sessionId: SessionId(frozen.sessionId), system: comparison.system, messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: frozen.input }] })], signal })) {
						if (chunk.type === 'text-delta') { output += chunk.text; if (Buffer.byteLength(output) > 524288) throw fault('output_limit', '对照产物超过接收上限'); }
						if (chunk.type === 'finish') { if (chunk.reason.kind !== 'stop') throw fault('model_incomplete', `对照响应未完整结束：${chunk.reason.kind}`); finished = true; }
					}
					if (!finished) throw fault('model_incomplete', '对照响应缺少完成记录');
					const rows = store.snapshot().attempts.filter(a => a.ownerId === comparison.id && a.sessionId === frozen.sessionId);
					if (rows.length !== 1 || rows[0]!.usageState !== 'confirmed') throw fault('usage_unknown', '本次对照用量尚未确认');
					const scenario = ctx.rsiScenarios.get(comparison.scenario.id, comparison.scenario.version);
					const artifact = artifactSchema.parse(await scenario.compile(output, signal));
					if (artifact.kind !== comparison.scenario.kind) throw fault('artifact_kind', '场景返回了不同类型的产物');
					signal.throwIfAborted();
					const digest = hash(artifact.content);
					await mkdir(root, { recursive: true, mode: 0o700 });
					await writeFile(join(root, digest), artifact.content, { mode: 0o600 });
					signal.throwIfAborted();
					update(taskId, t => { const r = t.comparison!.runs.find(r => r.side === frozen.side)!; r.status = 'passed'; r.artifact = { digest, kind: artifact.kind, detail: artifact.detail }; });
				} catch (e) {
					update(taskId, t => { const r = t.comparison!.runs.find(r => r.side === frozen.side)!; r.status = 'failed'; r.error = redact(e instanceof Error ? e.message : String(e)).slice(0, 4000); });
				} finally {
					sessions.delete(frozen.sessionId);
					update(taskId, t => { const r = t.comparison!.runs.find(r => r.side === frozen.side)!; r.endedAt = Date.now(); r.durationMs = Math.max(0, Math.round(performance.now() - started)); });
				}
			}
			update(taskId, t => { if (t.comparison!.status === 'running') t.comparison!.status = t.comparison!.runs.every(r => r.status === 'passed') ? 'completed' : 'failed'; });
		} catch (e) {
			update(taskId, t => { if (t.comparison!.status === 'running') t.comparison!.status = controller.signal.aborted ? 'cancelled' : 'failed'; for (const r of t.comparison!.runs) if (['pending', 'running'].includes(r.status)) { r.status = 'failed'; r.error = redact(String(e)).slice(0, 4000); } });
		} finally { controller.abort(); controllers.delete(taskId); }
	}
	async function command(cmd: G1Command) {
		if (cmd.kind !== 'flow_compare' && cmd.kind !== 'flow_cancel_comparison') return undefined;
		const previous = store.businessReceipt(cmd); if (previous) return previous;
		const task = get(cmd.payload.taskId);
		if (cmd.kind === 'flow_cancel_comparison') {
			const receipt = store.mutateBusiness(s => { const t = s.mainflow.tasks.find(t => t.id === task.id)!; if (t.comparison?.status !== 'running') throw fault('state_conflict', '对照没有运行'); t.comparison.status = 'cancelled'; return task.id; }, cmd);
			controllers.get(task.id)?.abort(new Error('用户取消对照')); return receipt;
		}
		if (task.status !== 'review' || !task.candidate || task.candidate.snapshot.versionDigest !== cmd.payload.candidateDigest || task.comparison) throw fault('state_conflict', '仅能为尚未对照的当前候选确认一次对照');
		await checkedSkill(task.skillId); await verify(task.baselineRoot, task.baseline); await verify(task.candidate.root, task.candidate.snapshot);
		const scenario = ctx.rsiScenarios.get(task.scenario.id, task.scenario.version);
		const id = randomUUID();
		const runs = await Promise.all((['baseline', 'candidate'] as const).map(async side => {
			const snapshot = side === 'baseline' ? task.baseline : task.candidate!.snapshot;
			const directory = side === 'baseline' ? task.baselineRoot : task.candidate!.root;
			const files = await Promise.all(snapshot.files.map(async f => ({ path: f.path, content: await readFile(join(directory, f.path), 'utf8') })));
			const input = JSON.stringify({ brief: task.brief, preference: task.preference, inherited: task.inherited, clarifications: task.clarifications, skill: task.name, files });
			if (redact(input) !== input || Buffer.byteLength(JSON.stringify([scenario.instructions, input])) > cmd.payload.budget.maxInputBytes) throw fault('input_limit', '完整对照输入超出预算或包含疑似凭据');
			return { side, versionDigest: snapshot.versionDigest, sessionId: `rsi-comparison/${id}/${side}`, input, status: 'pending', startedAt: null, endedAt: null, durationMs: null, artifact: null, error: null };
		}));
		const comparison = comparisonSchema.parse({ id, operationId: cmd.operationId, authorizedAt: Date.now(), deadline: Date.now() + cmd.payload.budget.maxDurationMs, scenario: task.scenario, system: scenario.instructions, budget: cmd.payload.budget, status: 'running', runs });
		const receipt = store.mutateBusiness(s => { const t = s.mainflow.tasks.find(t => t.id === task.id)!; if (t.status !== 'review' || t.comparison || t.candidate?.snapshot.versionDigest !== cmd.payload.candidateDigest) throw fault('state_conflict', '候选已变化'); t.comparison = comparison; return task.id; }, cmd);
		const work = run(task.id); jobs.add(work); void work.finally(() => jobs.delete(work)).catch(e => ctx.logger.error('RSI comparison: %s', String(e)));
		return receipt;
	}
	async function preview(taskId: string, side: ComparisonRun['side']) {
		const r = get(taskId).comparison?.runs.find(r => r.side === side);
		if (r?.status !== 'passed' || !r.artifact) return new Response('Preview unavailable', { status: 404 });
		const content = await readFile(join(root, r.artifact.digest), 'utf8');
		if (hash(content) !== r.artifact.digest) throw fault('artifact_corrupt', '预览产物摘要不匹配');
		return new Response(content, { headers: { 'content-type': r.artifact.kind === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } });
	}
	// 测试用的最小 connection 替身没有 fetch；真实 Web 宿主沿用认证通道。
	if (ctx.connection.fetch) ctx.effect(() => ctx.connection.fetch.register({ path: '/api/rsi-preview', methods: ['GET'], requestBody: 'buffered', async fetch(request) {
		try { const query = new URL(request.url).searchParams; return await preview(z.uuid().parse(query.get('task')), z.enum(['baseline', 'candidate']).parse(query.get('side'))); }
		catch { return new Response('Preview unavailable', { status: 404 }); }
	} }));
	return { command, preview, busy: (id: string) => controllers.has(id), cancel: (id: string) => controllers.get(id)?.abort(new Error('用户停止任务')), whenIdle: () => Promise.allSettled(jobs), async dispose() { for (const c of controllers.values()) c.abort(new Error('宿主关闭')); await Promise.allSettled(jobs); } };
}
