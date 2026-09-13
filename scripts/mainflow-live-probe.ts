// 本地真实验收覆盖层，不进入发布包；固定样例、五次请求（含首笔已完成澄清）、持久记录，不自动重试。
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage, ReasoningEffortId, type GenerateOptions, type TokenUsage } from '@deepseek-ai/dsh-llm';
import { renderSkillContent } from '@deepseek-ai/dsh-skill';
import type { applyG1 } from '../src/g1.ts';
import { restrictWorker } from '../src/worker.ts';

export const inject = ['rsiG0', 'rsiG1', 'agents', 'llm', 'skills', 'workspaceRegistry', 'connection'];
const repo = '/Users/black/Documents/ChatGPT/DeepSeek-RSI';
const evidence = join(repo, '.cache/live-guidance-evidence/real');
const root = join(repo, '.cache/live-guidance-workspace');
const pageId = SessionId('live-design-page-20260909-2');
const baselineId = SessionId('live-design-baseline-20260909');
export const brief = '以下是候选获准启用后的页面阶段需求，不是要求 Skill 编辑器现在输出 HTML：设计一个虚构写作工具 Paperlane 的英文产品落地页。交付方式：在最终回复中直接给出一个完整 HTML 文档（可用一个 html 代码围栏），由验收器保存为文件，不要调用工具或要求读取项目。只用内联 CSS，无外部图片、字体、网络或依赖。必须包含一个 h1、明确标记 Fictional product / concept demo、三个产品特点、两个可展开的原生 details FAQ、指向 id=start 的主 CTA，以及对应的开始区域。没有真实注册后端，明确这是演示。适配 390px 和 1440px 宽度，避免横向溢出。代码简洁，正文短，不需要代码外解释。';
export const preference = 'Skill 编辑阶段：请修改完整 SKILL.md，将下述设计偏好落实为可复用规则，允许新增风格映射小节；保留 YAML 元数据，不把 Paperlane 品牌和固定测试内容写进通用 Skill。页面阶段再根据已确认需求生成 HTML。设计方向：杂志排版。使用醒目的标题、充足留白与明确阅读顺序，优先用排版和分隔线组织内容，减少重复圆角卡片。进一步要求：米白底色、黑色文字、少量橙红强调色；不使用渐变、阴影或卡片网格。桌面首屏左右分栏，移动端单栏，标题有编辑感。保留可访问性和全部必需交互。把这些偏好落实为本次 Skill 的具体可执行设计规则，避免只是附加一句偏好；保留原有元数据和功能边界。';
type Call = { kind: string; sessionId: string; startedAt: number; endedAt: number | null; inputBytes: number; maxTokens: number; usage: TokenUsage | null; finish: unknown; error?: string };
export async function apply(ctx: Context) {
	assert.equal(process.env.RSI_MAINFLOW_LIVE, 'approved-20260909');
	assert.equal(process.env.DSH_HOME, '/Users/black/.dsh-rsi-dev');
	await mkdir(evidence, { recursive: true }); await mkdir(root, { recursive: true });
	const business = ctx.get('rsiG1') as ReturnType<typeof applyG1>;
	let handle: AgentHandle | undefined;
	let prepared = false;
	let candidateOptions: GenerateOptions | undefined;
	const calls: Call[] = JSON.parse(await readFile(join(evidence, 'calls.json'), 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return '[]'; }));
	const save = () => writeFile(join(evidence, 'calls.json'), JSON.stringify(calls, null, '\t') + '\n', { mode: 0o600 });
	const task = () => business.snapshot().business.mainflow.tasks.find(t => t.sessionId === pageId);
	const workspace = await ctx.workspaceRegistry.create(root, 'RSI 真实设计对照');
	ctx.on('llm/stream', async function* (options, next) {
		const current = task();
		const kind = options.sessionId === pageId ? 'candidate-page' : options.sessionId === baselineId ? 'baseline-page' : current && options.sessionId === `rsi-generation/${current.id}` ? `skill-rewrite-${calls.filter(c => c.kind.startsWith('skill-rewrite')).length + 1}` : null;
		assert.ok(kind, 'This test permits only its fixed batch requests');
		assert.ok(!calls.some(c => c.kind === kind), 'No replay or retry');
		assert.ok(calls.length < 5 && calls.every(c => c.endedAt && c.usage?.totalTokens !== undefined && (c.finish as {kind?: string})?.kind === 'stop'), 'Previous request must finish with known usage');
		assert.ok(calls.reduce((n, c) => n + (c.usage?.totalTokens ?? 0), 0) < 900000);
		assert.ok(!calls.length || Date.now() - calls[0]!.startedAt < 1200000);
		assert.equal(options.provider, 'deepseek-official'); assert.equal(options.model, 'deepseek-v4-flash'); assert.equal(options.reasoningEffort, 'low');
		assert.equal(options.purpose, undefined); assert.equal(options.tools?.length ?? 0, 0);
		assert.ok(options.maxTokens && options.maxTokens <= 16384);
		const inputBytes = Buffer.byteLength(JSON.stringify([options.system, options.messages])); assert.ok(inputBytes <= 65536, `Input too large: ${inputBytes}`);
		const policy = ctx.llm.providerRetryPolicy(options.provider); assert.ok(policy.mode === 'normal' && policy.maxRetries === 0);
		// Agent Loop 请求已冻结；用 Agent 的取消入口控制页面超时，不修改请求。
		const { signal: _signal, ...request } = options;
		await writeFile(join(evidence, `${kind}-request.json`), JSON.stringify(request, null, '\t') + '\n', { mode: 0o600 });
		if (kind === 'candidate-page') candidateOptions = structuredClone(request);
		const call: Call = { kind, sessionId: String(options.sessionId), startedAt: Date.now(), endedAt: null, inputBytes, maxTokens: options.maxTokens, usage: null, finish: null }; calls.push(call); await save();
		const timer = kind === 'candidate-page' ? setTimeout(() => handle?.agent.cancel({ kind: 'user' }), 300000) : undefined;
		let output = '';
		try {
			for await (const chunk of next()) {
				if (chunk.type === 'text-delta') output += chunk.text;
				if (chunk.type === 'usage') call.usage = chunk.usage;
				if (chunk.type === 'finish') call.finish = chunk.reason;
				yield chunk;
			}
		} catch (e) { call.error = String(e); throw e; }
		finally { clearTimeout(timer); call.endedAt = Date.now(); await writeFile(join(evidence, `${kind}-response.txt`), output); await save(); }
	}, { prepend: true, global: true });
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-mainflow-live', async (endpoint, payload) => {
		assert.equal(JSON.stringify(payload), '{}');
		if (endpoint === 'prepare') {
			assert.ok(!prepared && !task() && calls.length === 1, 'Only continuation after the recorded first clarification'); prepared = true;
			handle = await ctx.agents.create({ sessionId: pageId, meta: { cwd: root }, agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('low'), maxTokens: 16384 }, setup: async scope => { await scope.plugin(Object.assign((inner: Context) => restrictWorker(inner, new Set()), { inject: ['tools'] })); } });
			handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '/rsi-frontend-design ' + brief }] }));
		}
		if (endpoint === 'resume-page') {
			assert.ok(task()?.status === 'dispatched' && calls.length === 2 && !handle);
			handle = await ctx.agents.resume({ resumeSessionId: pageId, agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('low'), maxTokens: 16384 }, setup: async scope => { await scope.plugin(Object.assign((inner: Context) => restrictWorker(inner, new Set()), { inject: ['tools'] })); } });
			handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '已完成独立 Skill 修改并确认启用。现在是页面生成阶段，请按已确认的页面需求、设计偏好与已绑定 Skill 输出完整 HTML。此前本地验收器在 API 发送前出错，未生成任何页面。不要调用工具；输出 HTML 由验收器保存。' }] }));
		}
		if (endpoint === 'baseline') {
			await handle?.agent.whenIdle();
			const current = task(); assert.ok(current?.candidate && current.status === 'dispatched' && candidateOptions);
			const baseline = await ctx.skills.get(current.name, { cwd: root }); assert.ok(baseline);
			const text = renderSkillContent({ ...baseline, content: current.files.find(f => f.path === 'SKILL.md')!.content, resourceBase: { kind: 'directory', path: current.baselineRoot } });
			let replaced = 0;
			const messages = candidateOptions.messages.map(m => { if (m.role === 'user' && m.source.kind === 'skill-invocation' && m.source.name === current.name) { replaced++; return { ...m, content: [{ type: 'text' as const, text }] }; } return m; });
			assert.equal(replaced, 1);
			for await (const _ of ctx.llm.stream({ ...candidateOptions, messages, sessionId: baselineId, signal: AbortSignal.timeout(300000) })) { /* shared recorder stores the response */ }
		}
		if (endpoint === 'cleanup') {
			const current = task();
			if (current && !['dispatched', 'stopped'].includes(current.status)) await business.command({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: business.snapshot().business.revision, kind: 'flow_choose', payload: { taskId: current.id, choice: 'stop', digest: null } });
			await handle?.dispose();
			await ctx.workspaceRegistry.delete(workspace.id);
		}
		const current = task();
		if (current) {
			await writeFile(join(evidence, 'task.json'), JSON.stringify(current, null, '\t') + '\n');
			await writeFile(join(evidence, 'binding.json'), JSON.stringify(ctx.rsiG0.store.binding(pageId, current.skillId), null, '\t') ?? 'null');
		}
		const attempts = business.snapshot().attempts.filter(a => calls.some(c => c.sessionId === a.sessionId));
		await writeFile(join(evidence, 'attempts.json'), JSON.stringify(attempts, null, '\t') + '\n');
		return { ok: true, value: { task: current, calls, attempts, pageId, brief, preference, workspaceId: workspace.id, baselineSourceHash: createHash('sha256').update(await readFile(join(repo, 'fixtures/frontend/v0/SKILL.md'))).digest('hex') } };
	}));
}
