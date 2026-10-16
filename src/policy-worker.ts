import { rm } from 'node:fs/promises';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import Sessions, { SessionId } from '@deepseek-ai/dsh-session';
import Projections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Agents from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import { POLICY_AUTHORITY, policyTools, checkPolicySessionRequest } from './policy.ts';
import { restrictWorker } from './worker.ts';
import { policyProcessOwnershipSchema, policyProcessInputSchema, policyProcessRequestSchema, policyProcessResultSchema, boundedPolicyMessage } from './policy-process-contracts.ts';
import type { PolicyRun } from './policy-contracts.ts';

if (!process.send || Object.keys(process.env).some(key => /api[_-]?key|authorization|password|secret|access[_-]?token/i.test(key))) throw new Error('Isolated policy IPC worker required');
const ownedRoot = realpathSync(process.cwd()); const marker = join(ownedRoot, 'owner.json');
if (dirname(ownedRoot) !== realpathSync(tmpdir()) || !basename(ownedRoot).startsWith('rsi-policy-evaluation-') || !lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink() || lstatSync(marker).size > 256) throw new Error('Policy worker has no owned temporary home');
const ownership = policyProcessOwnershipSchema.parse(JSON.parse(readFileSync(marker, 'utf8')));
if (ownership.parentPid !== process.ppid) throw new Error('Policy worker parent identity differs');
const ctx = new Context(); let started = false; let finished = false; let request = 0;
let reply: ((value: Extract<ReturnType<typeof policyProcessInputSchema.parse>, { type: 'response' }>) => void) | undefined;
// On controller loss there can be no disposal receipt. Exit and remove only the verified owned cwd.
let abandoning = false;
function abandon() {
	if (abandoning) return; abandoning = true;
	for (const agent of ctx.get('agents')?.roots() ?? []) agent.cancel({ kind: 'disposed' });
	const timer = setTimeout(() => process.exit(1), 1000);
	void rm(ownedRoot, { recursive: true }).finally(() => { clearTimeout(timer); process.exit(1); });
}
process.on('disconnect', () => { if (!finished) abandon(); });
process.on('message', raw => {
	try {
		const message = policyProcessInputSchema.parse(boundedPolicyMessage(raw));
		if (message.type === 'response') { if (!reply || message.request !== request) throw new Error('Unexpected policy response'); const resolve = reply; reply = undefined; resolve(message); }
		else if (message.type === 'abort') { for (const agent of ctx.agents.roots()) agent.cancel({ kind: 'user' }); }
		else { if (message.run.runId !== ownership.runId) throw new Error('Policy worker run identity differs'); if (started) throw new Error('Policy worker cannot replay'); started = true; void run(message.run); }
	} catch { process.exit(1); }
});
async function run(run: PolicyRun) {
	let result: ReturnType<typeof policyProcessResultSchema.parse>['result'] = null; let error: string | null = null;
	try {
		class Bridge extends LlmAdapter {
			async resolveModel(provider: string, model: string) { return { provider, id: model, name: model }; }
			async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
				checkPolicySessionRequest(run, options);
				let cancel!: () => void;
				const waiting = new Promise<Extract<ReturnType<typeof policyProcessInputSchema.parse>, { type: 'response' }>>((resolve, reject) => { reply = resolve; cancel = () => reject(new Error('Policy request aborted')); if (options.signal?.aborted) cancel(); else options.signal?.addEventListener('abort', cancel, { once: true }); });
				process.send!(boundedPolicyMessage(policyProcessRequestSchema.parse({ type: 'request', request: ++request, options: { sessionId: options.sessionId, provider: options.provider, model: options.model, maxTokens: options.maxTokens, system: options.system, messages: options.messages, tools: options.tools } })), error => { if (error) cancel(); });
				const response = await waiting.finally(() => { options.signal?.removeEventListener('abort', cancel); reply = undefined; }); if (response.error) throw new Error(response.error);
				for (const chunk of response.chunks) yield chunk as StreamChunk;
			}
		}
		await ctx.plugin(LlmRuntime); ctx.llm.registerAdapter(['rsi-policy-fixture'], new Bridge());
		await ctx.plugin(Sessions); await ctx.plugin(Projections);
		await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
		await ctx.plugin(Tools); await ctx.plugin(Agents); await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
		ctx.systemPrompt.section({ name: 'rsi-policy-authority', order: 0, text: POLICY_AUTHORITY });
		ctx.systemPrompt.section({ name: 'rsi-execution-policy', order: 500, text: run.policy.instructions });
		const handle = await ctx.agents.create({ sessionId: SessionId(run.runId), agentOptions: { provider: run.conditions.provider, model: run.conditions.model, maxTokens: run.conditions.budget.maxOutputTokens }, setup(scoped) { restrictWorker(scoped, new Set(['rsi_search', 'rsi_read'])); for (const tool of policyTools(run)) scoped.tools.register(tool); } });
		try {
			handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: run.conditions.question }] })); await handle.agent.whenIdle();
			const events = handle.agent.session.snapshotEvents(); const last = events.findLast(event => event.type === 'assistant/message');
			const finalResponse = last?.type === 'assistant/message' ? last.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('') : '';
			result = JSON.parse(JSON.stringify({ sessionId: run.runId, finalResponse, events }));
		} finally { await handle.dispose(); }
	} catch (failure) { error = failure instanceof Error ? failure.message.slice(0, 4000) : 'Policy worker failed'; }
	finally {
		const agentsDisposed = (ctx.get('agents')?.roots().length ?? 0) === 0;
		await ctx.fiber.dispose();
		if (!process.connected) { abandon(); return; }
		process.send!(boundedPolicyMessage(policyProcessResultSchema.parse({ type: 'result', result, agentsDisposed, error })), failure => { if (failure) abandon(); else { finished = true; process.disconnect?.(); } });
	}
}
