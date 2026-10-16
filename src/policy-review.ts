import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session-persistence';
import type {} from '@deepseek-ai/dsh-api-session-controller/types';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { Store } from './store.ts';
import { fault } from './contracts.ts';
import { policyCommandSchema, policySessionId, policySourceRequestSchema, policyQaRequestSchema } from './policy-review-contracts.ts';
import { captureRepository } from './policy-snapshot.ts';
import { POLICY_AUTHORITY, policyTools } from './policy.ts';
import { generatePolicyCandidate } from './policy-generation.ts';
import { executeAuthorizedPolicyBatch, executeAuthorizedPolicyPack, policyExecutionRuntime } from './policy-execution.ts';
import { restrictWorker } from './worker.ts';

/** Explicit fixture-pilot entry. Ordinary sessions never acquire a project policy. */
export function applyPolicyReview(ctx: Context, store: Store) {
	const installed = new WeakSet<Agent>();
	const scopes = new WeakSet<Context>();
	const handles = new Map<string, AgentHandle>();
	const pending = new Map<string, Promise<void>>();
	const executions = new Map<string, AbortController>();
	const jobs = new Set<Promise<unknown>>(); const controller = new AbortController();
	function compose(scoped: Context, id: string, usedCalls: number) {
		if (scopes.has(scoped)) return;
		const run = store.policySessionRun(id); if (!run) throw fault('policy_binding_missing', '只读会话版本绑定缺失');
		restrictWorker(scoped, new Set(['rsi_search', 'rsi_read']));
		for (const tool of policyTools(run, usedCalls)) scoped.tools.register(tool);
		scoped.systemPrompt.section({ name: 'rsi-policy-authority', order: 490, text: POLICY_AUTHORITY });
		scoped.systemPrompt.section({ name: 'rsi-execution-policy', order: 500, text: run.policy.instructions });
		scopes.add(scoped);
	}
	function install(agent: Agent) {
		if (!agent.id.startsWith('rsi-policy/')) return;
		const run = store.policySessionRun(agent.id); const binding = store.policySession(agent.id);
		if (!run || !binding || agent.session.header.cwd !== binding.workspacePath) throw fault('policy_binding_missing', '只读会话版本或工作区绑定缺失');
		if (installed.has(agent)) return;
		compose(agent.ctx, agent.id, agent.session.snapshotEvents().filter(event => event.type === 'tool/call').length);
		// API Session reads the logged selection before a first header exists.
		if (!agent.session.snapshotEvents().some(event => event.type === 'model/selection' || event.type === 'request/header')) agent.session.append('model/selection', { provider: run.conditions.provider, model: run.conditions.model });
		agent.ctx.on('agent/request', async (_event, next) => {
			const config = await next();
			return { ...config, maxTokens: config.maxTokens ?? run.conditions.budget.maxOutputTokens };
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		agent.ctx.on('agent/pre-step', async (_event, next) => {
			if (!timer) {
				const first = store.snapshot().attempts.find(row => row.sessionId === agent.id)?.createdAt ?? Date.now();
				timer = setTimeout(() => agent.cancel({ kind: 'hook', reason: '只读会话时间窗口已结束' }), Math.max(1, first + run.conditions.budget.maxDurationMs - Date.now()));
			}
			return next();
		});
		agent.ctx.on('session/event', (session, event) => { if (session.id === agent.id && event.type === 'turn/end') { clearTimeout(timer); timer = undefined; } });
		agent.ctx.effect(() => () => clearTimeout(timer));
		installed.add(agent);
	}
	// Native announcements are synchronous and precede prompt assembly, including UI resume.
	ctx.on('agent/created', ({ agent }) => install(agent));
	for (const agent of ctx.agents.roots()) install(agent);
	async function open(id: string) {
		const binding = store.policySession(id);
		const workspace = ctx.workspaceRegistry.list().find(row => row.id === binding?.workspaceId && row.path === binding.workspacePath);
		if (!workspace) throw fault('workspace_missing', '只读会话的工作区缺失或已移动');
		const current = ctx.agents.get(SessionId(id)); if (current) { install(current); await workspace.attachSession(SessionId(id)); return; }
		const existing = pending.get(id); if (existing) return existing;
		const work = (async () => {
			const binding = store.policySession(id); const run = store.policySessionRun(id);
			if (!binding || !run) throw fault('policy_binding_missing', '只读会话版本绑定缺失');
			const options = { provider: run.conditions.provider, model: run.conditions.model, maxTokens: run.conditions.budget.maxOutputTokens };
			const persisted = await ctx.get('sessionPersistence')?.stat(SessionId(id));
			if (!persisted && store.snapshot().attempts.some(row => row.sessionId === id)) throw fault('policy_history_missing', '只读会话历史缺失；保留绑定与用量，请创建新会话');
			const setup = (scoped: Context) => {
				// Both setup and the synchronous announcement validate before any model request.
				store.policySessionRun(id);
				if (!persisted) compose(scoped, id, 0);
			};
			const handle = persisted
				? await ctx.agents.resume({ resumeSessionId: SessionId(id), agentOptions: options, setup })
				: await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: binding.workspacePath }, agentOptions: options, setup });
			handles.set(id, handle);
			await workspace.attachSession(SessionId(id));
		})();
		pending.set(id, work); try { await work; } finally { pending.delete(id); }
	}
	function source(input: unknown) {
		const request = policySourceRequestSchema.parse(input); const row = store.policySource(request.sourceId);
		const workspace = ctx.workspaceRegistry.list().find(item => item.id === request.workspaceId);
		if (!row || !workspace || row.workspaceId !== workspace.id || row.workspacePath !== workspace.path) throw fault('policy_source_missing', '本工作区没有该快照预览');
		return row;
	}
	function qa(input: unknown) {
		const request = policyQaRequestSchema.parse(input); const pack = store.policyQaPack(request.packId, true);
		if (!pack) throw fault('policy_qa_missing', '本工作区没有该问答包');
		const row = source({ workspaceId: request.workspaceId, sourceId: pack.content.sourceId });
		if (pack.workspaceId !== row.workspaceId || pack.workspacePath !== row.workspacePath) throw fault('policy_qa_missing', '问答包不属于当前工作区');
		return pack;
	}
	async function execute(input: unknown, signal?: AbortSignal) {
		const abort = AbortSignal.any([controller.signal, ...signal ? [signal] : []]); abort.throwIfAborted();
		const cmd = policyCommandSchema.parse(input);
		const workspace = ctx.workspaceRegistry.list().find(row => row.id === cmd.payload.workspaceId);
		if (!workspace) throw fault('workspace_missing', '请先登记工作区');
		const workspacePath = workspace.path;
		let receipt = store.businessReceipt(cmd); const fresh = !receipt;
		if (!receipt) {
			store.checkPolicyCommand(cmd, workspacePath);
			let captured;
			if (cmd.kind === 'policy_preview' || cmd.kind === 'policy_seal') {
				const row = cmd.kind === 'policy_seal' ? source({ workspaceId: cmd.payload.workspaceId, sourceId: cmd.payload.sourceId }) : undefined;
				if (cmd.kind === 'policy_seal' && (row!.status !== 'preview' || row!.choiceId !== cmd.payload.expectedActive || row!.conditions.sourceSnapshot!.digest !== cmd.payload.snapshotDigest)) throw fault('policy_source_conflict', '快照或版本已变化，请重新预览');
				const paths = cmd.kind === 'policy_preview' ? cmd.payload.paths : row!.conditions.files.map(file => file.path);
				captured = await captureRepository(workspacePath, paths, abort);
			}
			abort.throwIfAborted();
			if (ctx.workspaceRegistry.list().find(row => row.id === cmd.payload.workspaceId)?.path !== workspacePath) throw fault('workspace_conflict', '工作区已变化，请重新预览');
			receipt = store.policyCommand(cmd, workspacePath, captured, (cmd.kind === 'policy_evaluate' || cmd.kind === 'policy_evaluate_pack') ? policyExecutionRuntime() : undefined);
		}
		if (fresh && (cmd.kind === 'policy_generate' || cmd.kind === 'policy_evaluate' || cmd.kind === 'policy_evaluate_pack')) launch(cmd.operationId, cmd.kind);
		if (cmd.kind === 'policy_stop') executions.get(receipt.focusId!)?.abort();
		if (cmd.kind === 'policy_session' || cmd.kind === 'policy_source_session' || cmd.kind === 'policy_open') await open(policySessionId(receipt.focusId!));
		return receipt;
	}
	function launch(id: string, kind: 'policy_generate' | 'policy_evaluate' | 'policy_evaluate_pack') {
		const own = new AbortController(); executions.set(id, own);
		const signal = AbortSignal.any([controller.signal, own.signal]);
		const task = (kind === 'policy_generate' ? generatePolicyCandidate(ctx, store, id, signal) : kind === 'policy_evaluate_pack' ? executeAuthorizedPolicyPack(ctx, store, id, signal) : executeAuthorizedPolicyBatch(ctx, store, id, signal)).catch(error => {
			if (kind === 'policy_generate') { const row = store.policyGeneration(id); if (row && ['authorized', 'running'].includes(row.status)) store.failPolicyGeneration(id, signal.aborted ? 'cancelled' : 'failed', row.response, error instanceof Error ? error.message.slice(0, 4000) : 'Generation failed'); }
			else if (kind === 'policy_evaluate_pack') store.stopPolicyPack(id, signal.aborted ? 'cancelled' : 'failed');
			else { store.stopPolicyBatch(id, signal.aborted ? 'cancelled' : 'failed'); try { store.evaluatePolicy(id); } catch {} }
		}).finally(() => { executions.delete(id); jobs.delete(task); });
		jobs.add(task);
	}
	function command(input: unknown, signal?: AbortSignal) { const work = execute(input, signal); jobs.add(work); return work.finally(() => jobs.delete(work)); }
	async function dispose() { controller.abort(); await Promise.allSettled(jobs); await Promise.allSettled(pending.values()); await Promise.all([...handles.values()].map(handle => handle.dispose())); handles.clear(); }
	return { command, source, qa, open, dispose, whenIdle: () => Promise.allSettled(jobs) };
}
