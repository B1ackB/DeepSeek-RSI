// 仅由本地测试覆盖层加载；不随插件发布，不自动发起模型请求。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import { createUserMessage, ToolCallId, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { z } from 'zod';
import type {} from '../src/index.ts';
import { sealFixture, installFixtureProvider } from '../src/skills.ts';
import { restrictWorker } from '../src/worker.ts';
import { runDocker } from '../src/docker.ts';
import { summarizeWithLlm } from '@deepseek-ai/dsh-compaction-basic/src/summarizer.ts';

export const inject = ['rsiG0', 'connection', 'agents', 'skills', 'tools', 'llm'];
export function apply(ctx: Context) {
	let running = false;
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-g0-probe', async (endpoint, payload) => {
		try {
			assert.equal(endpoint, 'run');
			const { mode } = z.strictObject({ mode: z.enum(['offline', 'live', 'compression']) }).parse(payload);
			assert.equal(running, false, 'Probe already running');
			running = true;
			try { return { ok: true, value: await run(mode) }; } finally { running = false; }
		} catch (error) { return { ok: false, error: { code: 'probe_failed', message: String(error), details: {} } }; }
	}));
	async function run(mode: 'offline' | 'live' | 'compression') {
		const { store, rsiSessions, probeSessions, active } = ctx.rsiG0;
		const root = process.env.RSI_G0_REPO;
		assert.ok(root, 'RSI_G0_REPO is required');
		const skillId = randomUUID();
		const versions = await Promise.all(['v1', 'v2'].map(v => sealFixture(resolve(root, 'fixtures', v), join(process.env.DSH_HOME!, 'rsi', 'objects'), skillId, root)));
		const handles = new Set<AgentHandle>();
		const controller = new AbortController();
		active.add(controller);
		const timer = setTimeout(() => controller.abort(), 180000);
		let toolRuns = 0;
		let forbiddenRuns = 0;
		const options = { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('high'), maxTokens: 4096 };
		async function make(version: number, id = SessionId(randomUUID()), resume = false) {
			const object = versions[version]!;
			store.bind(id, skillId, object.snapshot.versionDigest);
			const setup = async (scope: Context) => { await scope.plugin(Object.assign((inner: Context) => {
				installFixtureProvider(inner, object.snapshot, object.root);
				restrictWorker(inner, new Set(['rsi_probe_python']));
				inner.tools.register({ name: 'rsi_probe_python', description: 'Run the fixed version probe in Docker. No arguments.', parameters: { type: 'object', properties: {}, additionalProperties: false }, output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: String(value) }] }, execute: async () => {
					toolRuns++;
					assert.ok(toolRuns <= 1, 'Only one fixed tool execution is authorized');
					const result = await runDocker(object.root, ['python', 'probe.py'], controller.signal);
					assert.equal(result.exitCode, 0);
					return result.stdout;
				} });
				inner.tools.register({ name: 'rsi_probe_forbidden', description: 'Must be denied by the worker guard', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => { forbiddenRuns++; return 'FORBIDDEN'; } });
			}, { inject: ['skills', 'tools'] })); };
			const handle = resume ? await ctx.agents.resume({ resumeSessionId: id, agentOptions: options, setup }) : await ctx.agents.create({ sessionId: id, meta: { cwd: root }, agentOptions: options, setup });
			handles.add(handle);
			const definition = await ctx.skills.get('g0-probe', { scope: scopeOf(handle.agent.ctx) });
			assert.match(definition!.content, new RegExp(`G0_V${version + 1}`));
			assert.deepEqual(definition!.resourceBase, { kind: 'directory', path: object.root });
			const denied = await ctx.tools.execute({ agent: handle.agent, signal: controller.signal, callId: ToolCallId(randomUUID()), name: 'rsi_probe_forbidden', arguments: {} });
			assert.equal(denied.isError, true); assert.equal(forbiddenRuns, 0);
			return handle;
		}
		try {
			const a = await make(0);
			const b = await make(1);
			const id = a.agent.session.id;
			await a.dispose(); handles.delete(a);
			const resumed = await make(0, id, true);
			if (mode === 'offline') return { check: 'real_host_agent_setup_resume', status: 'passed', versionA: versions[0]!.snapshot.versionDigest, versionB: versions[1]!.snapshot.versionDigest, forbiddenRuns };
			probeSessions.add(b.agent.session.id);
			rsiSessions.add(resumed.agent.session.id);
			if (mode === 'compression') {
				const result = await summarizeWithLlm(ctx, { summarizationProvider: options.provider, summarizationModel: options.model, maxTokens: 4096 }, { messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'G0 integration check: A is pinned to Skill v1; B to v2. Python and Shell probes passed. Remaining work is to verify metering. Preserve those facts in the checkpoint.' }] })] }, resumed.agent, controller.signal);
				assert.ok(result.summary.length > 0);
				const rows = store.snapshot().attempts.filter(a => a.sessionId === resumed.agent.session.id);
				assert.ok(rows.length === 1 && rows[0]!.callKind === 'compression' && rows[0]!.usageState === 'confirmed');
				return { check: 'native_harness_summarizer_usage', status: 'passed', snapshot: store.snapshot() };
			}
			const cancel = () => { for (const h of handles) h.agent.cancel({ kind: 'user' }); };
			controller.signal.addEventListener('abort', cancel, { once: true });
			try {
				b.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'This is an authorized integration probe. Do not use tools. Reply exactly G0_DAILY_OK.' }] }));
				await b.agent.whenIdle();
				assert.ok(store.snapshot().attempts.some(a => a.sessionId === b.agent.session.id && a.state === 'succeeded' && a.usageState === 'confirmed'), 'Daily request must settle with usage');
				resumed.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'This is an authorized integration probe. Call rsi_probe_python exactly once with {}. Then reply with its output only. Do not call other tools.' }] }));
				await resumed.agent.whenIdle();
				assert.equal(toolRuns, 1, 'Model must execute the fixed container tool');
				const rows = store.snapshot().attempts.filter(a => a.sessionId === resumed.agent.session.id);
				assert.ok(rows.length >= 2 && rows.every(a => a.usageState === 'confirmed'), 'RSI tool roundtrip usage must settle');
				return { check: 'real_provider_and_worker', status: 'passed', toolRuns, forbiddenRuns, snapshot: store.snapshot() };
			} finally { controller.signal.removeEventListener('abort', cancel); }
		} finally {
			clearTimeout(timer); controller.abort();
			for (const handle of handles) await handle.dispose();
			active.delete(controller);
		}
	}
}
