import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = resolve(process.argv[2] ?? process.cwd());
const selectedSide = process.argv[3] ?? 'all';
assert.ok(['all', 'baseline', 'candidate', 'restored'].includes(selectedSide));
const harnessRoot = resolve(await realpath(join(repo, 'node_modules/@deepseek-ai/dsh-agent')), '../../..');
const harnessCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, encoding: 'utf8' }).trim();
assert.equal(harnessCommit, 'd347e703908d0406b7a7ef80e3a0e594d86b2215', 'The experiment requires the pinned Harness');
const load = name => import(`${repo}/node_modules/@deepseek-ai/${name}/lib/index.js`);
const { Context } = await load('cordis');
const { default: LlmRuntime, LlmAdapter, createUserMessage, ToolCallId } = await load('dsh-llm');
const { default: SessionStore, SessionId } = await load('dsh-session');
const { default: SessionProjections } = await load('dsh-session-projection');
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const { default: AgentRegistry } = await load('dsh-agent');
const { default: AgentLoop } = await load('dsh-agent-loop');
const { restrictWorker } = await import(`${repo}/src/worker.ts`);
const dir = await mkdtemp(join(tmpdir(), 'rsi-evolution-data-'));
const source = 'export function total(value) {\n\treturn value + 1;\n}\n';
await writeFile(join(dir, 'sample.js'), source);
const hash = value => createHash('sha256').update(value).digest('hex');
const ctx = new Context();
let forbiddenExecutions = 0;
const requests = [];
const steps = [];
const runs = [];
const handles = [];

function response(block, reason) {
	return [
		{ type: 'block-start', index: 0, blockType: block.type },
		...(block.type === 'text' ? [{ type: 'text-delta', index: 0, text: block.text }] : [{ type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }]),
		{ type: 'block-end', index: 0, block },
		{ type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
		{ type: 'finish', reason: { kind: reason } },
	];
}
class Adapter extends LlmAdapter {
	async resolveModel(provider, model) { return { provider, id: model, name: model }; }
	async *stream(options) {
		const previous = requests.filter(r => r.sessionId === options.sessionId);
		requests.push(structuredClone({ sessionId: options.sessionId, system: options.system, messages: options.messages, tools: options.tools }));
		const index = previous.length;
		assert.ok(index < 3, 'Unexpected additional dispatch');
		if (index < 2) {
			const name = index === 0 ? 'audit_search' : 'audit_read';
			const args = index === 0 ? { query: 'total' } : { path: 'sample.js' };
			yield* response({ type: 'tool-call', id: ToolCallId(`${options.sessionId}-${index}`), name, arguments: JSON.stringify(args) }, 'tool-calls');
		} else {
			assert.ok(JSON.stringify(options.messages).includes('return value + 1'), 'Tool evidence must feed the final request');
			yield* response({ type: 'text', text: 'total adds 1. Source: sample.js:1-3.' }, 'stop');
		}
	}
}
const definition = (name, properties, execute) => ({
	name, description: name,
	parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
	output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
	execute,
});
try {
	await ctx.plugin(LlmRuntime);
	await ctx.plugin(SessionStore);
	await ctx.plugin(SessionProjections);
	await ctx.plugin(SystemPrompt, { persona: 'Fixed external controller. Read-only evidence task.' });
	await ctx.plugin(ToolRuntime);
	await ctx.plugin(AgentRegistry);
	await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
	ctx.llm.registerAdapter(['audit-fixture'], new Adapter());
	ctx.tools.register(definition('audit_forbidden', {}, async () => { forbiddenExecutions++; return 'FORBIDDEN'; }));
	ctx.on('agent/pre-step', async ({ agent, turn, step }, next) => { steps.push({ id: agent.id, turn, step }); return next(); });
	const policies = [['baseline', 'BASELINE_POLICY: inspect the repository before answering.'], ['candidate', 'CANDIDATE_POLICY: search, read evidence, then cite the source.'], ['restored', 'BASELINE_POLICY: inspect the repository before answering.']];
	for (const [side, policy] of policies.filter(([side]) => selectedSide === 'all' || selectedSide === side)) {
		const sessionId = SessionId(`rsi-audit-${side}`);
		const handle = await ctx.agents.create({
			sessionId, meta: { cwd: dir }, agentOptions: { provider: 'audit-fixture', model: 'offline', maxTokens: 512 },
			setup: async scoped => {
				scoped.systemPrompt.section({ name: 'rsi-execution-policy', order: 500, text: policy });
				restrictWorker(scoped, new Set(['audit_search', 'audit_read']));
				scoped.tools.register(definition('audit_search', { query: { type: 'string' } }, async ({ query }) => {
					assert.equal(query, 'total');
					const content = await readFile(join(dir, 'sample.js'), 'utf8');
					return content.includes(query) ? 'sample.js:1:export function total(value)' : 'No matches';
				}));
				scoped.tools.register(definition('audit_read', { path: { type: 'string' } }, async ({ path }) => {
					assert.equal(path, 'sample.js');
					return readFile(join(dir, 'sample.js'), 'utf8');
				}));
			},
		});
		handles.push(handle);
		const blocked = await ctx.tools.execute({ agent: handle.agent, name: 'audit_forbidden', arguments: {}, callId: ToolCallId(`blocked-${side}`), signal: new AbortController().signal });
		assert.equal(blocked.isError, true);
		handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Explain total and cite the implementation.' }] }));
		await handle.agent.whenIdle();
		const seen = requests.filter(r => r.sessionId === sessionId);
		assert.equal(seen.length, 3);
		for (const request of seen) {
			assert.ok(request.system.includes(policy), 'Policy exists from first dispatch');
			assert.ok(request.system.includes('Fixed external controller'));
			assert.equal(request.system.includes(side === 'candidate' ? 'BASELINE_POLICY:' : 'CANDIDATE_POLICY:'), false);
			assert.deepEqual(request.tools.map(t => t.name).sort(), ['audit_read', 'audit_search']);
		}
		const events = handle.agent.session.snapshotEvents();
		assert.equal(events.filter(e => e.type === 'tool/result').length, 2);
		assert.equal(events.at(-1).type, 'turn/end');
		assert.equal(events.at(-1).data.reason.kind, 'completed');
		runs.push({ side, requests: seen.length, toolResults: 2, completed: true, policyInFirstRequest: true, unrelatedPolicyAbsent: true, forbiddenToolBlocked: true });
		await handle.dispose();
	}
	assert.equal(forbiddenExecutions, 0);
	assert.equal(ctx.agents.roots().length, 0);
	assert.equal(await readFile(join(dir, 'sample.js'), 'utf8'), source);
	const evidence = { runtime: process.version, processId: process.pid, selectedSide, modelMode: 'deterministic fixture only', paidRequests: 0, harnessCommit, sourceDigest: hash(source), runs, totalFixtureRequests: requests.length, forbiddenExecutions, rootsAfterDisposal: ctx.agents.roots().length, evidenceReachedFinalRequest: true, inputUnchanged: true, limitations: ['Not real-model quality evidence', 'Not OS sandbox validation', 'Does not implement candidate lifecycle, adoption, or durable policy binding'], steps };
	console.log(JSON.stringify(evidence, null, '\t'));
} finally {
	for (const handle of handles) await handle.dispose();
	await ctx.fiber.dispose();
	await rm(dir, { recursive: true, force: true });
}
