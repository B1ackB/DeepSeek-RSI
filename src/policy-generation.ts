import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { Store } from './store.ts';
import { fault } from './contracts.ts';
import { policyGeneratorPrompt, policyGenerationSession } from './policy-generation-contracts.ts';

/** One tool-free proposer call through the existing Harness service/observer. */
export async function generatePolicyCandidate(ctx: Context, store: Store, id: string, signal?: AbortSignal) {
	const task = store.policyGeneration(id); if (!task) throw fault('policy_generation_missing', 'Generation authorization is missing');
	store.startPolicyGeneration(id, task.revision);
	const abort = new AbortController(); const combined = AbortSignal.any([abort.signal, ...signal ? [signal] : []]);
	const timer = setTimeout(() => abort.abort(new Error('Policy generation deadline')), Math.max(0, task.deadline - Date.now()));
	let response = ''; let complete = false;
	try {
		combined.throwIfAborted();
		const prompt = policyGeneratorPrompt(store.policyContent(task.authorization.policyId, task.authorization.baselineDigest), task.authorization.requirements);
		const budget = task.authorization.budget;
		for await (const chunk of ctx.llm.stream({ provider: budget.provider, model: budget.model, maxTokens: budget.maxOutputTokens, system: prompt.system, messages: [createUserMessage({ content: [{ type: 'text', text: prompt.input }], source: { kind: 'user' } })], sessionId: SessionId(policyGenerationSession(id)), tools: [], signal: combined })) {
			combined.throwIfAborted();
			if (complete) throw fault('policy_generation_partial', 'Data after terminal generation event');
			if (chunk.type === 'text-delta') { if (Buffer.byteLength(response + chunk.text) > 65536) throw fault('policy_generation_output', 'Generation response exceeds 64 KiB'); response += chunk.text; store.recordPolicyGenerationResponse(id, response); }
			if (chunk.type === 'tool-call-delta' || (chunk.type === 'block-start' && chunk.blockType === 'tool-call')) throw fault('policy_generation_scope', 'Generator has no tool capability');
			if (chunk.type === 'finish') { if (chunk.reason.kind !== 'stop') throw fault('policy_generation_partial', 'Generation did not finish normally'); complete = true; }
		}
		combined.throwIfAborted();
		if (!complete) throw fault('policy_generation_partial', 'Generation stream has no complete terminal event');
		return store.sealPolicyGeneration(id, response);
	} catch (error) {
		if (store.policyGeneration(id)?.status === 'running') store.failPolicyGeneration(id, combined.aborted ? 'cancelled' : 'failed', response, error instanceof Error ? error.message.slice(0, 4000) : 'Policy generation failed');
		return store.policyGeneration(id)!;
	} finally { clearTimeout(timer); abort.abort(); }
}
