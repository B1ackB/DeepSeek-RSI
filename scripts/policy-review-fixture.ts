import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openStore, type Store } from '../src/store.ts';
import { authorizeGeneratedPolicyEvaluation } from '../src/policy-evaluation.ts';
import { runPolicyGenerationFixture } from './policy-generation.ts';
import { executePolicyComparison } from './policy-comparison.ts';
import { policyRuntime } from './policy-fixture.ts';
import { applyPolicyReview } from '../src/policy-review.ts';
import { observeUsage } from '../src/usage.ts';

export async function preparePolicyReviewFixture(file: string, modes: Parameters<typeof executePolicyComparison>[2] = ['complete', 'complete']) {
	const store = openStore(file); const policyId = randomUUID(); const generationId = randomUUID(); let batchId: string;
	try {
		const baseline = store.sealPolicyVersion(policyId, { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Inspect the repository before answering.' });
		store.authorizePolicyGeneration({ id: generationId, policyId, baselineDigest: baseline.digest, requirements: 'Inspect implementations and cite sources.', budget: { provider: 'rsi-policy-generation-fixture', model: 'offline-v1', maxRequests: 1, maxOutputTokens: 1024, maxInputBytes: 16384, maxDurationMs: 5000 } });
		await runPolicyGenerationFixture(store, generationId);
		const runtime = await policyRuntime(); batchId = randomUUID();
		authorizeGeneratedPolicyEvaluation(store, generationId, { id: batchId, caseId: 'symbol', runtimeDigest: runtime.runtimeDigest, budget: { maxRequests: 10, tokenStopThreshold: 1000, maxDurationMs: 30000 } });
	} finally { store.close(); }
	await executePolicyComparison(file, batchId!, modes);
	return { policyId, generationId, batchId: batchId! };
}

/** Only fixed adapter; no real profile, credentials or provider registration. */
export type PolicyReviewMode = 'complete' | 'unknown_call_chain' | 'hang_call_chain' | 'unknown' | 'hang' | 'hang_after_read' | 'no_tools' | 'wrong_answer' | 'wrong_citation' | 'missing_read' | 'forbidden';
export async function policyReviewRuntime(store: Store, root: string, mode: PolicyReviewMode = 'complete') {
	const ctx = new Context();
	await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections);
	await ctx.plugin(SystemPrompt, { persona: 'Trusted test authority. Preserve the user instructions.' }); await ctx.plugin(Tools); await ctx.plugin(AgentRegistry);
	await ctx.plugin(JsonlPersistence, { root: join(root, 'sessions'), compression: 'none' });
	await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
	ctx.provide('workspaceRegistry', { list: () => [{ id: 'workspace', path: root, attachSession: async () => {} }] } as unknown as Context['workspaceRegistry']);
	const fixtureRequests = registerPolicyReviewAdapter(ctx, store, mode); ctx.on('llm/stream', observeUsage(store, new Set()));
	const review = applyPolicyReview(ctx, store);
	return { ctx, review, requests: fixtureRequests, async dispose() { await review.dispose(); const agents = ctx.agents.roots().length; await ctx.fiber.dispose(); return { agents, contextDisposed: true }; } };
}

export function registerPolicyReviewAdapter(ctx: Context, store: Store, mode: PolicyReviewMode = 'complete') {
	const requests: Array<{ sessionId: string | undefined; system: string | undefined; tools: unknown; messages: unknown }> = [];
	class Adapter extends LlmAdapter {
		async listModels(provider: string) { return [{ provider, id: 'offline-v1', name: '固定响应（离线验证）' }]; }
		async resolveModel(provider: string, model: string) { return { provider, id: model, name: model }; }
		async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
			const row = store.snapshot().attempts.findLast(row => row.sessionId === options.sessionId);
			if (row?.state !== 'in_flight') throw new Error('Daily request must reserve before dispatch');
			const binding = options.sessionId ? store.policyRunBinding(options.sessionId) : undefined;
			const callChain = binding?.batch.authorization.evaluationSpec && 'caseId' in binding.batch.authorization.evaluationSpec && binding.batch.authorization.evaluationSpec.caseId === 'call-chain';
			const index = requests.filter(row => row.sessionId === options.sessionId).length;
			if (mode === 'hang' || ((mode === 'hang_after_read' || (mode === 'hang_call_chain' && callChain)) && index === 2)) {
				requests.push({ sessionId: options.sessionId, system: options.system, tools: options.tools, messages: JSON.parse(JSON.stringify(options.messages)) });
				yield { type: 'block-start', index: 0, blockType: 'text' }; yield { type: 'text-delta', index: 0, text: 'partial response' };
				await new Promise<void>(resolve => { if (options.signal?.aborted) resolve(); else options.signal?.addEventListener('abort', () => resolve(), { once: true }); }); return;
			}
			requests.push({ sessionId: options.sessionId, system: options.system, tools: options.tools, messages: JSON.parse(JSON.stringify(options.messages)) });
			const fixed = binding?.batch.authorization.evaluationSpec ? store.policyEvaluationCase(binding.batch.authorization.evaluationSpec, binding.entry.run.conditions) : undefined;
			const bound = options.sessionId ? store.policySessionRun(options.sessionId) : undefined;
			const source = fixed ? binding!.entry.run.conditions.files[0] : bound?.conditions.sourceSnapshot ? bound.conditions.files[0] : undefined;
			const reads = mode === 'missing_read' ? fixed!.reads.slice(0, 1) : fixed?.reads ?? [source?.path ?? 'sample.js'];
			if (index > reads.length && reads.some(path => !JSON.stringify(options.messages).includes(`${path}:1:`))) throw new Error('Frozen repository read did not reach continuation');
			if (fixed && mode === 'wrong_answer') fixed.answer.claims[0].value = 'controlled incorrect result';
			if (fixed && mode === 'wrong_citation') fixed.answer.claims[0].citations = [{ path: 'fixtures/repository-qa-v1/unused.js', startLine: 2, endLine: 2 }];
			const block = mode !== 'no_tools' && index <= reads.length ? { type: 'tool-call' as const, id: ToolCallId(`daily-${index}`), name: mode === 'forbidden' ? 'shell' : index ? 'rsi_read' : 'rsi_search', arguments: JSON.stringify(index ? { path: reads[index - 1] } : { query: source ? 'export' : 'total' }) } : { type: 'text' as const, text: fixed ? JSON.stringify(fixed.answer) : source ? '已读取已确认的仓库快照（固定响应验证）。' : 'total adds 1. Source: sample.js:1-3.' };
			yield { type: 'block-start', index: 0, blockType: block.type };
			if (block.type === 'text') yield { type: 'text-delta', index: 0, text: block.text };
			else yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments };
			yield { type: 'block-end', index: 0, block };
			if (mode !== 'unknown' && !(mode === 'unknown_call_chain' && callChain)) yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
			yield { type: 'finish', reason: { kind: block.type === 'text' ? 'stop' : 'tool-calls' } };
		}
	}
	ctx.llm.registerAdapter(['rsi-policy-fixture'], new Adapter());
	return requests;
}
