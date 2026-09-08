import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, cpSync, readFileSync, writeFileSync, chmodSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, ReasoningEffortId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import Skills, { renderSkillContent } from '@deepseek-ai/dsh-skill';
import * as plugin from '../src/index.ts';
import type { applyG1 } from '../src/g1.ts';
import { defaultAnalysisBudget, defaultOptimizationBudget, type G1Command } from '../src/g1-contracts.ts';
import { openStore } from '../src/store.ts';

const result = { conclusion: '可以保留正确性检查并缩短说明，尚未评测。', directions: [{ objective: 'brevity', title: '缩短结果说明', rationale: '用户要求简洁', files: ['SKILL.md'], requiredInformation: ['必须保留执行结果和错误'], optionalInformation: ['逐步解释'] }] };

test('G1 native observation, explicit one-shot analysis, scope guards, cancellation and restart', async () => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rsi-g1-')));
	const previousHome = process.env.DSH_HOME; process.env.DSH_HOME = dir;
	const source = join(dir, 'skill'); cpSync(resolve('fixtures/v1'), source, { recursive: true });
	const original = readFileSync(join(source, 'SKILL.md'), 'utf8');
	const ctx = new Context();
	class Adapter extends LlmAdapter {
		calls = 0;
		override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }, { id: ReasoningEffortId('high'), name: 'High' }], defaultEffort: ReasoningEffortId('low') } }; }
		mode: 'ok' | 'invalid' | 'unknown' | 'wait' | 'max' = 'ok';
		async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
			this.calls++;
			assert.equal(options.tools, undefined);
			assert.equal(options.reasoningEffort, 'low');
			assert.ok(options.system?.includes('仅返回完整 JSON'));
			assert.equal(ctx.rsiG0.store.snapshot().attempts.length, this.calls);
			if (this.mode !== 'unknown') yield { type: 'usage', usage: { inputTokens: 70, outputTokens: 30, totalTokens: 100 } };
			if (this.mode === 'wait') {
				await new Promise<void>(resolve => { if (options.signal?.aborted) resolve(); else options.signal?.addEventListener('abort', () => resolve(), { once: true }); });
				return;
			}
			yield { type: 'text-delta', index: 0, text: this.mode === 'invalid' ? '{incomplete' : JSON.stringify(result) };
			yield { type: 'finish', reason: { kind: this.mode === 'max' ? 'max-tokens' : 'stop' } };
		}
	}
	const adapter = new Adapter();
	let disposed = false;
	try {
		await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections);
		await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry); await ctx.plugin(Skills);
		ctx.provide('connection', { rpc: { handle: () => () => {} } } as unknown as Context['connection']);
		ctx.provide('workspaceRegistry', { list: () => [{ id: 'workspace', path: dir }] } as unknown as Context['workspaceRegistry']);
		await ctx.plugin(plugin);
		ctx.llm.registerAdapter(['deepseek-official'], adapter);
		ctx.skills.register({ name: 'g1-sample', description: 'G1 sample', source: 'test', content: original, resourceBase: { kind: 'directory', path: source } });
		const business = ctx.get('rsiG1') as ReturnType<typeof applyG1>;
		assert.ok(business);
		const state = () => business.snapshot().business;
		const envelope = (kind: G1Command['kind'], payload: unknown) => ({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: state().revision, kind, payload });
		const command = (kind: G1Command['kind'], payload: unknown) => business.command(envelope(kind, payload));
		await assert.rejects(command('manage', { workspaceId: 'not-registered', sessionId: null, name: 'g1-sample' }), /登记/);
		await command('manage', { workspaceId: 'workspace', sessionId: null, name: 'g1-sample' });
		assert.equal(adapter.calls, 0);
		const skill = state().skills[0]!;
		const session = ctx.sessions.create(SessionId('daily-g1'), { meta: { cwd: dir } });
		let storedCwd: string | undefined = dir;
		let statCalls = 0;
		ctx.provide('sessionPersistence', { stat: async () => {
			statCalls++;
			return storedCwd === undefined ? undefined : { header: { ...session.header, id: SessionId('cold-g1'), cwd: storedCwd } };
		} } as unknown as Context['sessionPersistence']);
		assert.ok((await business.catalog('workspace', session.id)).some(s => s.name === 'g1-sample'));
		assert.equal(statCalls, 0);
		assert.equal(ctx.sessions.get(SessionId('cold-g1')), undefined);
		assert.ok((await business.catalog('workspace', 'cold-g1')).some(s => s.name === 'g1-sample'));
		assert.equal(statCalls, 1);
		storedCwd = join(dir, 'different');
		await assert.rejects(business.catalog('workspace', 'cold-g1'), /会话不属于/);
		storedCwd = undefined;
		await assert.rejects(business.catalog('workspace', 'cold-g1'), /会话不属于/);
		async function turn(n: number) {
			session.append('turn/start', { turn: n });
			session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请给出简洁结论，不需要逐步解释' }] }), { surfaceOp: 'append' });
			const definition = (await ctx.skills.get('g1-sample', { cwd: dir }))!;
			session.append('user/message', createUserMessage({ source: { kind: 'skill-invocation', name: definition.name, form: 'instructions' }, content: [{ type: 'text', text: renderSkillContent(definition) }] }), { surfaceOp: 'append' });
			session.append('turn/end', { turn: n, reason: { kind: 'completed' } });
			await business.whenObserved();
		}
		await turn(1);
		assert.equal(state().opportunities.length, 1, state().observationError ?? 'Missing observed preference');
		const opportunity = state().opportunities[0]!;
		await command('opportunity', { opportunityId: opportunity.id, status: 'ignored' });
		await turn(2);
		assert.equal(state().opportunities.length, 1);
		assert.equal(state().opportunities[0]!.status, 'ignored');
		assert.equal(state().opportunities[0]!.evidence.length, 2);
		assert.equal(adapter.calls, 0, 'Observation and ignoring cannot spend tokens');
		const stale = envelope('observe', { skillId: skill.id, enabled: false });
		await command('observe', { skillId: skill.id, enabled: true });
		await assert.rejects(business.command(stale), /状态已变化/);
		async function prepare() {
			const receipt = await command('prepare_analysis', { opportunityId: opportunity.id, budget: defaultAnalysisBudget });
			return state().analyses.find(a => a.id === receipt.focusId)!;
		}
		await assert.rejects(command('prepare_analysis', { opportunityId: opportunity.id, budget: { ...defaultAnalysisBudget, reasoningEffort: 'high' } }), /宿主配置/);
		const first = await prepare(); assert.equal(adapter.calls, 0);
		await assert.rejects(command('start_analysis', { analysisId: first.id, inputDigest: '0'.repeat(64) }), /重新审阅/);
		const start = envelope('start_analysis', { analysisId: first.id, inputDigest: first.inputDigest });
		await business.command(start); await business.command(start); await business.whenIdle();
		assert.equal(adapter.calls, 1, state().analyses[0]!.error ?? '');
		assert.equal(state().analyses[0]!.status, 'succeeded', state().analyses[0]!.error ?? '');
		assert.equal(business.snapshot().attempts[0]!.ownerId, first.id);
		assert.equal(business.snapshot().attempts[0]!.tokens.total, 100);
		await assert.rejects(command('save_draft', { analysisId: first.id, directionIndex: 0, files: ['../outside'], requiredInformation: '结果', optionalInformation: '', budget: defaultOptimizationBudget }), /清单/);
		const draft = await command('save_draft', { analysisId: first.id, directionIndex: 0, files: ['SKILL.md'], requiredInformation: '结果和错误', optionalInformation: '逐步解释', budget: defaultOptimizationBudget });
		await assert.rejects(command('authorize', { draftId: draft.focusId }), /正式评测/);
		await command('revoke_draft', { draftId: draft.focusId });
		assert.equal(state().drafts[0]!.status, 'revoked');
		// 已保存的 High 历史仍能读取，旧预览必须重新确认当前路线。
		const historic = await prepare();
		ctx.rsiG0.store.mutateBusiness(s => { s.analyses.find(a => a.id === historic.id)!.budget.reasoningEffort = 'high'; });
		await assert.rejects(command('start_analysis', { analysisId: historic.id, inputDigest: historic.inputDigest }), /重新准备预览/);
		assert.equal(state().analyses.find(a => a.id === historic.id)!.status, 'prepared');
		assert.equal(adapter.calls, 1);
		adapter.mode = 'invalid'; const invalid = await prepare();
		await command('start_analysis', { analysisId: invalid.id, inputDigest: invalid.inputDigest }); await business.whenIdle();
		assert.equal(state().analyses.find(a => a.id === invalid.id)!.status, 'failed'); assert.equal(adapter.calls, 2);
		adapter.mode = 'max'; const capped = await prepare();
		await command('start_analysis', { analysisId: capped.id, inputDigest: capped.inputDigest }); await business.whenIdle();
		assert.equal(state().analyses.find(a => a.id === capped.id)!.status, 'failed');
		assert.match(state().analyses.find(a => a.id === capped.id)!.error!, /含推理.*上限/); assert.equal(adapter.calls, 3);
		adapter.mode = 'wait'; const cancelled = await prepare();
		await command('start_analysis', { analysisId: cancelled.id, inputDigest: cancelled.inputDigest });
		await new Promise(resolve => setImmediate(resolve));
		await command('cancel_analysis', { analysisId: cancelled.id }); await business.whenIdle();
		assert.equal(state().analyses.find(a => a.id === cancelled.id)!.status, 'cancelled'); assert.equal(adapter.calls, 4);
		writeFileSync(join(source, 'SKILL.md'), original + '\nCHANGED');
		await assert.rejects(prepare(), /来源/);
		assert.equal(state().skills[0]!.observing, false);
		writeFileSync(join(source, 'SKILL.md'), original);
		await command('review_source', { skillId: skill.id });
		adapter.mode = 'unknown'; const unknown = await prepare();
		await command('start_analysis', { analysisId: unknown.id, inputDigest: unknown.inputDigest }); await business.whenIdle();
		assert.equal(state().analyses.find(a => a.id === unknown.id)!.status, 'failed');
		const blocked = await prepare();
		await assert.rejects(command('start_analysis', { analysisId: blocked.id, inputDigest: blocked.inputDigest }), /未知用量/);
		assert.equal(adapter.calls, 5);
		assert.equal(readFileSync(join(source, 'SKILL.md'), 'utf8'), original, 'No source changes by RSI');
		// 前端准备独立于日常会话线索，仍使用同一来源检查、一次分析预算和回执。
		assert.ok((await business.catalog('workspace', null)).some(s => s.name === 'rsi-frontend-design'));
		await assert.rejects(command('design_create', { skillId: randomUUID(), brief: '不存在的 Skill' }), /不存在/);
		const frontendSkill = (await command('manage', { workspaceId: 'workspace', sessionId: null, name: 'rsi-frontend-design' })).focusId!;
		const create = envelope('design_create', { skillId: frontendSkill, brief: '虚构产品落地页，HTML/CSS，必需键盘导航' });
		const designId = (await business.command(create)).focusId!;
		assert.equal((await business.command(create)).focusId, designId);
		assert.equal(state().frontend.tasks.length, 1);
		await assert.rejects(command('prepare_design_analysis', { taskId: designId, budget: defaultAnalysisBudget }), /未确认/);
		await command('design_answer', { taskId: designId, answers: [
			{ dimension: 'palette', kind: 'value', value: '浅色蓝色', scope: 'project' },
			{ dimension: 'density', kind: 'no_preference', value: null, scope: 'task' },
			{ dimension: 'typography', kind: 'skip', value: null, scope: 'task' },
		] });
		await command('design_override', { taskId: designId, answer: { dimension: 'palette', kind: 'value', value: '仅本次红色', scope: 'task' } });
		await command('design_finish', { taskId: designId });
		const frozen = state().frontend.tasks[0]!.frozen;
		await command('preference_save', { workspaceId: 'workspace', scope: 'project', dimension: 'palette', value: '紫色', enabled: true });
		assert.deepEqual(state().frontend.tasks[0]!.frozen, frozen);
		await assert.rejects(command('prepare_analysis', { opportunityId: opportunity.id, designTaskId: designId, budget: defaultAnalysisBudget }), /不匹配/);
		const previewId = (await command('prepare_design_analysis', { taskId: designId, budget: defaultAnalysisBudget })).focusId!;
		const preview = state().analyses.find(a => a.id === previewId)!;
		assert.deepEqual(JSON.parse(preview.input).design, frozen);
		assert.equal(preview.opportunityId, null);
		assert.equal(state().opportunities.length, 1, 'Explicit design requests cannot fabricate observation evidence');
		assert.equal(adapter.calls, 5, 'Preparation and preview use no model');
		adapter.mode = 'wait';
		await command('start_analysis', { analysisId: preview.id, inputDigest: preview.inputDigest });
		await new Promise(resolve => setImmediate(resolve));
		await assert.rejects(command('design_close', { taskId: designId }), /关联分析/);
		await command('cancel_analysis', { analysisId: preview.id }); await business.whenIdle();
		const closedPreviewId = (await command('prepare_design_analysis', { taskId: designId, budget: defaultAnalysisBudget })).focusId!;
		const closedPreview = state().analyses.find(a => a.id === closedPreviewId)!;
		await command('design_close', { taskId: designId });
		await assert.rejects(command('start_analysis', { analysisId: closedPreview.id, inputDigest: closedPreview.inputDigest }), /已结束/);
		assert.equal(adapter.calls, 6);
		const probeId = business.snapshot().probeId;
		// 模拟进程在状态提交后退出：重开数据库只能标记中断，不能重派发。
		ctx.rsiG0.store.mutateBusiness(s => { const pending = s.analyses.find(a => a.id === blocked.id)!; pending.status = 'running'; pending.startedAt = Date.now(); pending.deadline = Date.now() + 300000; });
		await ctx.fiber.dispose(); disposed = true;
		const reopened = openStore(join(dir, 'rsi', 'g0.sqlite'));
		try { assert.equal(reopened.business().analyses.find(a => a.id === historic.id)!.budget.reasoningEffort, 'high'); assert.equal(reopened.snapshot().probeId, probeId); assert.equal(reopened.snapshot().attempts.length, 6); assert.equal(reopened.business().drafts[0]!.status, 'revoked'); assert.equal(reopened.business().analyses.find(a => a.id === blocked.id)!.status, 'interrupted'); assert.deepEqual(reopened.business().frontend.tasks[0]!.frozen, frozen); assert.equal(adapter.calls, 6); }
		finally { reopened.close(); }
	} finally {
		if (!disposed) await ctx.fiber.dispose();
		if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
		function writable(root: string) { chmodSync(root, 0o700); for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) writable(join(root, e.name)); }
		writable(dir); rmSync(dir, { recursive: true, force: true });
	}
});
