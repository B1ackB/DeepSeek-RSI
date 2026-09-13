import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, readdirSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, ReasoningEffortId, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Skills from '@deepseek-ai/dsh-skill';
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill';
import UserQuestions from '@deepseek-ai/dsh-user-questions';
import * as plugin from '../src/index.ts';
import { comparisonBudget } from '../src/comparison-contracts.ts';
import type { applyG1 } from '../src/g1.ts';

test('main flow gates real Harness dispatch, seals exact candidate, separates usage, and links an old session', { timeout: 15000 }, async () => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rsi-onboarding-')));
	const previousHome = process.env.DSH_HOME; process.env.DSH_HOME = dir;
	const ctx = new Context();
	class Adapter extends LlmAdapter {
		override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }], defaultEffort: ReasoningEffortId('low') } }; }
		hold = false; abortObserved = false; omitUsage = false; inputs: GenerateOptions[] = []; responses: unknown[] = [];
		async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
			this.inputs.push(options);
			const text = options.sessionId?.startsWith('rsi-generation/') ? JSON.stringify(this.responses.shift()) : options.sessionId?.startsWith('rsi-comparison/') ? String(this.responses.shift() ?? 'Preview') : '固定页面响应';
			if (!this.omitUsage) yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
			this.omitUsage = false;
			if (this.hold) { this.hold = false; await new Promise<void>((_resolve, reject) => { const abort = () => { this.abortObserved = true; reject(new Error('fixture aborted')); }; if (options.signal?.aborted) abort(); else options.signal?.addEventListener('abort', abort, { once: true }); }); }
			yield { type: 'block-start', index: 0, blockType: 'text' };
			yield { type: 'text-delta', index: 0, text };
			yield { type: 'block-end', index: 0, block: { type: 'text', text } };
			yield { type: 'finish', reason: { kind: 'stop' } };
		}
	}
	try {
		await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections);
		await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry); await ctx.plugin(Skills); await ctx.plugin(UserQuestions);
		await ctx.plugin(ToolSkill, {});
		ctx.provide('connection', { rpc: { handle: () => () => {} } } as unknown as Context['connection']);
		ctx.provide('workspaceRegistry', { list: () => [{ id: 'workspace', path: dir }] } as unknown as Context['workspaceRegistry']);
		await ctx.plugin(plugin); await ctx.plugin(AgentLoop, { agents: [] });
		const business = ctx.get('rsiG1') as ReturnType<typeof applyG1>;
		const store = ctx.rsiG0.store;
		const adapter = new Adapter(); ctx.llm.registerAdapter(['deepseek-official', 'fixture'], adapter);
		const create = (id: string) => ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: dir }, agentOptions: { provider: 'fixture', model: 'fixture' } });
		const a = await create('frontend-a');
		const send = (text: string) => a.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }));
		async function until(predicate: () => boolean) {
			if (predicate()) return;
			await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { off(); reject(new Error('state wait timed out: ' + JSON.stringify(store.business().mainflow.tasks.map(t => [t.status, t.error])))); }, 3000); const off = store.subscribe(() => { if (predicate()) { clearTimeout(timer); off(); resolve(); } }); });
		}
		const command = (kind: string, payload: unknown) => ({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.business().revision, kind, payload });
		const latest = () => store.business().mainflow.tasks.at(-1)!;
		const authorize = () => command('flow_authorize', { taskId: latest().id, previewDigest: latest().previewDigest, brief: latest().brief, preference: '少用圆角，密度紧凑', scope: 'project', paths: ['SKILL.md'], budget: latest().budget });
		const choose = (choice: string, digest: string | null) => business.command(command('flow_choose', { taskId: latest().id, choice, digest }));
		// 模拟原生 /Skill 展开已经进入待提交 inbox，确认后必须去掉旧展开。
		const definition = (await ctx.skills.get('rsi-frontend-design', { scope: a.agent, cwd: dir }))!;
		a.agent.inject(createUserMessage({ source: { kind: 'skill-invocation', name: definition.name, form: 'instructions' }, content: [{ type: 'text', text: 'STALE_NATIVE_SKILL_TEXT' }] }));
		send('/rsi-frontend-design 请设计前端落地页');
		await until(() => latest()?.status === 'confirming');
		assert.equal(adapter.inputs.length, 0); assert.equal(store.business().enrollments.length, 0);
		const original = latest().files.find(f => f.path === 'SKILL.md')!.content;
		adapter.responses.push({ kind: 'candidate', reason: '落实明确偏好，无效果结论', changes: [{ path: 'SKILL.md', content: original + '\nNEW_CONFIRMED_SKILL\n' }] });
		const auth = authorize(); await business.command(auth); await business.command(auth);
		await business.whenIdle();
		assert.equal(latest().status, 'review', latest().error ?? '');
		assert.equal(adapter.inputs.length, 1); assert.equal(adapter.inputs[0]!.tools?.length ?? 0, 0);
		assert.equal(store.business().opportunities.length, 0, 'Explicit preferences do not require observation signals');
		assert.equal(latest().candidate!.snapshot.files.length, latest().baseline.files.length);
		await assert.rejects(choose('candidate', latest().baseline.versionDigest), /摘要/);
		const approved = latest().candidate!.snapshot.versionDigest;
		await choose('candidate', approved); await a.agent.whenIdle();
		assert.equal(latest().status, 'dispatched', latest().error ?? '');
		assert.equal(adapter.inputs.length, 2);
		const actual = JSON.stringify(adapter.inputs[1]!.messages);
		assert.match(actual, /NEW_CONFIRMED_SKILL/); assert.doesNotMatch(actual, /STALE_NATIVE_SKILL_TEXT/);
		assert.match(actual, new RegExp(approved));
		assert.equal(store.binding(a.agent.session.id, latest().skillId)!.versionDigest, approved);
		const source = await ctx.skills.get('rsi-frontend-design', { cwd: dir }); assert.doesNotMatch(source!.content, /NEW_CONFIRMED_SKILL/);
		const rows = store.snapshot().attempts;
		assert.deepEqual(rows.map(r => [r.owner, r.purpose, r.tokens.total]), [['rsi', 'generation', 15], ['session', 'daily', 15]]);
		const enrollment = store.business().enrollments.find(e => e.sessionId === a.agent.session.id && e.status === 'active')!;
		await business.command(command('end_enrollment', { enrollmentId: enrollment.id }));
		send('/rsi-frontend-design 设计另一个页面'); await until(() => latest().status === 'confirming');
		assert.equal(latest().baseline.versionDigest, approved);
		adapter.responses.push({ kind: 'clarify', reason: '确定密度', questions: ['正文要多紧凑？'] }, { kind: 'candidate', reason: '根据补充信息调整', changes: [{ path: 'SKILL.md', content: original + '\nSECOND_CONFIRMED_SKILL\n' }] });
		await business.command(authorize()); await business.whenIdle();
		assert.equal(latest().status, 'clarifying'); const deadline = latest().deadline;
		const answer = command('flow_answer', { taskId: latest().id, answers: ['保持易读即可'] });
		await business.command(answer); await business.command(answer); await business.whenIdle();
		assert.equal(latest().deadline, deadline); assert.equal(latest().status, 'review', latest().error ?? '');
		const nextDigest = latest().candidate!.snapshot.versionDigest;
		await choose('candidate', nextDigest); await a.agent.whenIdle();
		await until(() => latest().status === 'dispatched');
		const child = ctx.agents.get(SessionId(latest().executionSessionId!))!; await child.whenIdle();
		assert.notEqual(child.session.id, a.agent.session.id);
		assert.equal(child.session.header.parentSession, a.agent.session.id);
		assert.equal(store.binding(a.agent.session.id, latest().skillId)!.versionDigest, approved);
		assert.equal(store.binding(child.session.id, latest().skillId)!.versionDigest, nextDigest);
		const linkedInput = adapter.inputs.findLast(i => i.sessionId === child.session.id)!;
		assert.match(JSON.stringify(linkedInput.messages), /SECOND_CONFIRMED_SKILL/);
		assert.doesNotMatch(JSON.stringify(linkedInput.messages), /NEW_CONFIRMED_SKILL|STALE_NATIVE_SKILL_TEXT/);
		assert.equal(adapter.inputs.filter(i => i.sessionId === child.session.id).length, 1);
		assert.equal(store.snapshot().attempts.filter(r => r.ownerId === latest().id).length, 2);
		await a.dispose();
		// 越界候选保留消费且没有日常请求；停止不自动用旧版。
		const b = await create('frontend-b'); b.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '设计前端页面' }] }));
		await until(() => latest().sessionId === 'frontend-b');
		adapter.responses.push({ kind: 'candidate', reason: 'bad', changes: [{ path: '../escape', content: 'bad' }] });
		await business.command(authorize()); await business.whenIdle();
		assert.equal(latest().status, 'failed'); assert.match(latest().error!, /未授权/);
		assert.equal(adapter.inputs.filter(i => i.sessionId === 'frontend-b').length, 0);
		await choose('stop', null); await b.agent.whenIdle(); await b.dispose();
		const c = await create('frontend-c'); c.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '设计前端页面' }] }));
		await until(() => latest().sessionId === 'frontend-c');
		adapter.omitUsage = true; adapter.responses.push({ kind: 'candidate', reason: '无 usage', changes: [{ path: 'SKILL.md', content: original + '\nUNKNOWN_USAGE\n' }] });
		await business.command(authorize()); await business.whenIdle();
		assert.equal(latest().status, 'failed'); assert.match(latest().error!, /用量未知/);
		assert.equal(adapter.inputs.filter(i => i.sessionId === 'frontend-c').length, 0);
		await choose('baseline', latest().baseline.versionDigest); await c.agent.whenIdle();
		assert.equal(adapter.inputs.filter(i => i.sessionId === 'frontend-c').length, 1, 'Unknown RSI usage must not prevent explicit ordinary baseline continuation');
		await c.dispose();
		const d = await create('frontend-d'); d.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '设计前端页面' }] }));
		await until(() => latest().sessionId === 'frontend-d'); await d.dispose();
		assert.equal(latest().authorization, null); assert.equal(latest().status, 'failed');
		assert.equal(store.snapshot().attempts.filter(a => a.ownerId === latest().id).length, 0);

		const e = await create('frontend-e'); e.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '设计前端页面' }] }));
		await until(() => latest().sessionId === 'frontend-e');
		adapter.hold = true; adapter.responses.push({ kind: 'unchanged', reason: '等待取消' });
		await business.command(authorize());
		await until(() => store.snapshot().attempts.some(a => a.ownerId === latest().id && a.tokens.total === 15));
		await e.dispose(); await business.whenIdle();
		assert.equal(adapter.abortObserved, true, 'Cancelling the waiting page also aborts the independent generation stream');
		assert.equal(latest().status, 'failed');
		assert.equal(adapter.inputs.filter(i => i.sessionId === 'frontend-e').length, 0);
		assert.equal(store.snapshot().attempts.filter(a => a.ownerId === latest().id).length, 1);

		// 通用 Skill 走相同主流程；补充要求创建新确认卡，不花费、不自动启用。
		const notesRoot = resolve('fixtures/frontend/v0');
		ctx.skills.register({ name: 'rsi-notes', description: '整理读书笔记', source: 'fixture', content: readFileSync(join(notesRoot, 'SKILL.md'), 'utf8'), resourceBase: { kind: 'directory', path: notesRoot } });
		const notes = await create('notes'); notes.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '/rsi-notes 将给定内容整理成笔记' }] }));
		await until(() => latest().sessionId === 'notes'); assert.equal(latest().scenario.id, 'text');
		assert.deepEqual(latest().inherited, [], 'frontend preferences do not leak into text skills');
		adapter.responses.push({ kind: 'candidate', reason: '笔记结构', changes: [{ path: 'SKILL.md', content: latest().files.find(f => f.path === 'SKILL.md')!.content + '\nNOTE_CANDIDATE\n' }] });
		await business.command(authorize()); await business.whenIdle();
		const currentCandidate = latest().candidate!.snapshot.versionDigest;
		adapter.responses.push('旧版文本', '');
		await business.command(command('flow_compare', { taskId: latest().id, candidateDigest: currentCandidate, budget: comparisonBudget })); await business.whenIdle();
		assert.equal(latest().comparison!.runs[1].status, 'failed');
		await assert.rejects(choose('candidate', currentCandidate), /未编译通过/);
		const parent = latest(); const callsBeforeRevision = adapter.inputs.length;
		const revise = command('flow_revise', { taskId: parent.id, reference: 'candidate', feedback: '保留分段，再缩短句子' });
		await business.command(revise); await business.command(revise); await notes.agent.whenIdle();
		assert.equal(adapter.inputs.length, callsBeforeRevision); assert.equal(latest().authorization, null); assert.equal(latest().parentId, parent.id);
		assert.match(latest().referenceFiles.find(f => f.path === 'SKILL.md')!.content, /NOTE_CANDIDATE/);
		assert.equal(store.business().mainflow.tasks.find(t => t.id === parent.id)!.candidate!.snapshot.versionDigest, parent.candidate!.snapshot.versionDigest);
		assert.equal(store.business().mainflow.active.some(a => a.skillId === parent.skillId), false);
		adapter.responses.push({ kind: 'candidate', reason: '进一步修改', changes: [{ path: 'SKILL.md', content: original + '\nNOTE_REVISED\n' }] });
		await business.command(authorize()); await business.whenIdle(); assert.equal(latest().status, 'review');
		await choose('candidate', latest().candidate!.snapshot.versionDigest); await business.whenIdle(); await notes.agent.whenIdle();
		assert.equal(latest().status, 'dispatched'); assert.equal(store.binding('notes', parent.skillId)!.versionDigest, latest().candidate!.snapshot.versionDigest);
		await notes.dispose();

	} finally {
		await ctx.fiber.dispose();
		if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
		function writable(root: string) { chmodSync(root, 0o700); for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory()) writable(join(root, e.name)); }
		writable(dir); rmSync(dir, { recursive: true, force: true });
	}
});
