import type { Context } from '@deepseek-ai/cordis';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import { policyRunSchema, policyCaseIdSchema, policyDigest } from '../src/policy-contracts.ts';
import { policyCase } from '../src/policy-evaluation.ts';
import { POLICY_AUTHORITY, policyTools, policyUsage } from '../src/policy.ts';
import { openStore } from '../src/store.ts';
import { restrictWorker } from '../src/worker.ts';

export const fixtureModeSchema = z.enum(['complete', 'forbidden', 'path_escape', 'unknown', 'provider_error', 'partial', 'hang', 'wrong_route', 'crash', 'wrong_answer', 'bad_citation', 'no_tools', 'missing_disposal', 'snapshot']);
export const policyHandoffSchema = z.strictObject({ file: z.string().startsWith('/'), batchId: z.uuid(), policyId: z.uuid(), runtimeDigest: z.string().regex(/^[a-f0-9]{64}$/), caseId: policyCaseIdSchema, deadline: z.number().int().nonnegative() });
export const fixtureJobSchema = z.strictObject({ run: policyRunSchema, mode: fixtureModeSchema, runtimeDigest: z.string().regex(/^[a-f0-9]{64}$/), handoff: policyHandoffSchema.optional() });
export const name = 'rsi-policy-fixture';
export const inject = ['llm', 'tools', 'systemPrompt', 'agents'];

export async function apply(ctx: Context) {
	const home = process.env.DSH_HOME!;
	const { run, mode, runtimeDigest, handoff } = fixtureJobSchema.parse(JSON.parse(readFileSync(process.env.RSI_POLICY_FIXTURE_JOB!, 'utf8')));
	if (Object.keys(process.env).some(key => /api[_-]?key|authorization|password|secret|access[_-]?token/i.test(key))) throw new Error('Fixture worker received an ambient credential variable');
	const store = openStore(handoff?.file ?? join(home, 'attempts.sqlite'), handoff?.batchId);
	const policyId = handoff?.policyId ?? randomUUID(); const batchId = handoff?.batchId ?? randomUUID();
	if (!handoff) store.sealPolicyVersion(policyId, run.policy);
	else {
		const binding = store.policyRunBinding(run.runId);
		if (!binding || policyDigest(binding.entry.run) !== policyDigest(run) || binding.batch.authorization.id !== batchId || binding.batch.authorization.policyId !== policyId || binding.batch.authorization.runtimeDigest !== runtimeDigest || handoff.runtimeDigest !== runtimeDigest || binding.batch.authorization.evaluationSpec?.caseId !== handoff.caseId || binding.progress.status !== 'running' || binding.batch.status !== 'running') { store.close(); throw new Error('Shared worker differs from its active authorization'); }
		const resource = binding.progress.resource;
		if (!resource || handoff.deadline !== Math.min(binding.batch.deadline, binding.progress.startedAt! + run.conditions.budget.maxDurationMs)) { store.close(); throw new Error('Worker has no matching owned home/deadline'); }
		store.recordPolicyResource(batchId, run.runId, resource.temporaryRoot, process.pid);
	}
	const fixed = handoff ? policyCase(handoff.caseId) : undefined;
	let requests = 0;
	let forbiddenExecutions = 0;
	writeFileSync(join(home, 'worker.json'), JSON.stringify({ pid: process.pid, runId: run.runId, policyId, batchId, credentialsAbsent: true }));
	ctx.effect(() => () => {
		if (mode !== 'missing_disposal') writeFileSync(join(home, 'disposed.json'), JSON.stringify({ requests, forbiddenExecutions, agents: ctx.agents.roots().length }));
		store.close();
	});
	ctx.systemPrompt.section({ name: 'rsi-policy-authority', order: 0, text: POLICY_AUTHORITY });
	ctx.systemPrompt.section({ name: 'rsi-execution-policy', order: 500, text: run.policy.instructions });
	const tools = policyTools(run);
	ctx.on('agent/created', ({ agent }) => {
		if (agent.session.id !== run.runId) throw new Error('Unexpected worker session');
		if (!handoff) {
			store.authorizePolicyBatch({ id: batchId, policyId, runtimeDigest, runs: [{ side: 'candidate', run }], budget: { maxRequests: run.conditions.budget.maxRequests, tokenStopThreshold: run.conditions.budget.tokenStopThreshold, maxDurationMs: run.conditions.budget.maxDurationMs } });
			store.startPolicyRun(batchId, run.runId);
		}
		restrictWorker(agent.ctx, new Set(tools.map(tool => tool.name)));
		for (const tool of tools) agent.ctx.tools.register(tool);
	});
	ctx.on('session/event', (session, event) => {
		if (handoff || session.id !== run.runId || event.type !== 'turn/end') return;
		const outcome = event.data.reason.kind === 'completed' ? 'completed' : event.data.reason.kind === 'aborted' ? 'cancelled' : 'failed';
		try { store.finishPolicyRun(batchId, run.runId, outcome); }
		catch (error) { if (outcome !== 'completed') throw error; store.finishPolicyRun(batchId, run.runId, 'failed'); }
	});
	// The fixed child has no other prompt providers; scoped tools are attached at creation.
	const system = renderPrompt(await ctx.systemPrompt.assemble());
	const schemas = tools.map(({ name, description, parameters }) => ({ name, description, parameters })).sort((a, b) => a.name < b.name ? -1 : 1);
	ctx.on('llm/stream', policyUsage(store, run, system, schemas));
	if (mode === 'wrong_route') ctx.on('agent/request', async (_event, next) => ({ ...await next(), model: 'unauthorized-model' }));
	class Adapter extends LlmAdapter {
		async resolveModel(provider: string, model: string) { return { provider, id: model, name: model }; }
		async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
			const rows = store.snapshot().attempts.filter(row => row.sessionId === run.runId);
			if (rows.length !== requests + 1 || rows.at(-1)?.state !== 'in_flight') throw new Error('Attempt was not durably reserved before adapter dispatch');
			appendFileSync(join(home, 'dispatch.jsonl'), `${JSON.stringify({ attemptId: rows.at(-1)!.attemptId, state: rows.at(-1)!.state, request: ++requests, policyPresent: options.system?.includes(run.policy.instructions), authorityPresent: options.system?.includes(POLICY_AUTHORITY), system: options.system, tools: options.tools ?? [], messages: options.messages })}\n`);
			if (mode === 'crash') process.exit(42);
			if (mode === 'hang') {
				yield { type: 'block-start', index: 0, blockType: 'text' };
				yield { type: 'text-delta', index: 0, text: 'partial' };
				await new Promise<void>((_resolve, reject) => {
					if (options.signal?.aborted) { reject(options.signal.reason); return; }
					options.signal?.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
				});
				return;
			}
			if (mode === 'partial') { yield { type: 'block-start', index: 0, blockType: 'text' }; yield { type: 'text-delta', index: 0, text: 'incomplete' }; return; }
			if (mode === 'provider_error') { yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } }; yield { type: 'finish', reason: { kind: 'error', failure: { code: 'FIXTURE', message: 'Controlled provider failure' } } }; return; }
			const toolSteps = fixed ? [{ name: 'rsi_search', args: { query: 'export' } }, ...fixed.reads.map(path => ({ name: 'rsi_read', args: { path } }))] : mode === 'snapshot' ? [{ name: 'rsi_search', args: { query: 'export' } }, { name: 'rsi_read', args: { path: run.conditions.files[0].path } }] : undefined;
			if (mode !== 'no_tools' && requests <= (toolSteps?.length ?? 2) && !(mode === 'path_escape' && requests === 2)) {
				let name = requests === 1 ? 'rsi_search' : 'rsi_read';
				let args: object = requests === 1 ? { query: 'total' } : { path: 'sample.js' };
				if (toolSteps) ({ name, args } = toolSteps[requests - 1]);
				if (mode === 'path_escape') { name = 'rsi_read'; args = { path: '/etc/passwd' }; }
				if (mode === 'forbidden') {
					name = 'fixture_forbidden'; args = {};
					ctx.agents.get(run.runId as Parameters<typeof ctx.agents.get>[0])!.ctx.tools.register({ name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => { forbiddenExecutions++; return 'FORBIDDEN'; } });
				}
				const id = ToolCallId(`fixture-${requests}`);
				const argumentsJson = JSON.stringify(args);
				yield { type: 'block-start', index: 0, blockType: 'tool-call' };
				yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson };
				yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } };
				if (mode !== 'unknown') yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
				yield { type: 'finish', reason: { kind: 'tool-calls' } };
				return;
			}
			if (!fixed && mode === 'complete' && !JSON.stringify(options.messages).includes('return value + 1')) throw new Error('Read evidence did not reach the final request');
			if (mode === 'snapshot' && !JSON.stringify(options.messages).includes(JSON.stringify(`${run.conditions.files[0].path}:1:${run.conditions.files[0].content.split('\n')[0]}`).slice(1, -1))) throw new Error('Captured source did not reach the final request');
			const answer = fixed?.answer;
			if (answer && mode === 'wrong_answer') answer.claims[0].value = 'incorrect controlled answer';
			if (answer && mode === 'bad_citation') answer.claims[0].citations = [{ path: 'outside.js', startLine: 1, endLine: 999 }];
			const text = answer ? JSON.stringify(answer) : mode === 'snapshot' ? 'Frozen source inspected. This fixed response checks execution only, not repository answer quality.' : mode === 'path_escape' ? 'The requested path is unavailable.' : 'total adds 1. Source: sample.js:1-3.';
			yield { type: 'block-start', index: 0, blockType: 'text' };
			yield { type: 'text-delta', index: 0, text };
			yield { type: 'block-end', index: 0, block: { type: 'text', text } };
			yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
			yield { type: 'finish', reason: { kind: 'stop' } };
		}
	}
	ctx.llm.registerAdapter([run.conditions.provider], new Adapter());
}
