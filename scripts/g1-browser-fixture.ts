import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, ReasoningEffortId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { renderSkillContent } from '@deepseek-ai/dsh-skill';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { applyG1 } from '../src/g1.ts';

export const inject = ['llm', 'rsiG1', 'workspaceRegistry', 'skills', 'sessions', 'connection'];
export async function apply(ctx: Context) {
	if (process.env.RSI_G1_FIXTURE !== '1' || !process.env.DSH_HOME?.endsWith('/g1-browser-home')) throw new Error('Only an isolated G1 browser fixture home is allowed');
	let calls = 0;
	class Adapter extends LlmAdapter {
		override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }], defaultEffort: ReasoningEffortId('low') } }; }
		async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
			calls++;
			const design = options.messages.some(m => m.content.some(c => c.type === 'text' && c.text.includes('"design":')));
			const request = options.sessionId?.startsWith('rsi-generation/') ? JSON.parse(options.messages[0]!.content.flatMap(c => c.type === 'text' ? [c.text] : []).join('')) : null;
			const compared = options.sessionId?.startsWith('rsi-comparison/');
			const candidate = options.sessionId?.endsWith('/candidate');
			const artifact = { title: candidate ? '新版笔记工具' : '旧版笔记工具', html: `<main><small>NOTEFLOW / ${candidate ? 'NEW' : 'BASELINE'}</small><h1>${candidate ? '写下想法，\n留下重点。' : '一个轻量的笔记工具'}</h1><p>在安静的空间里，把零散灵感整理成清晰的文字。</p><a href="#start">开始体验 →</a><section id="start"><h2>记录 · 整理 · 回顾</h2><p>这是一份隔离浏览器测试的预览。</p></section></main>`, css: `body{margin:0;background:${candidate ? '#f4efe5' : '#f2f5fa'};color:#243047;font-family:system-ui}main{padding:22px}small{font-size:9px;letter-spacing:2px}h1{font-size:${candidate ? '36' : '27'}px;line-height:1.15;letter-spacing:-1px;margin:28px 0 16px}p{font-size:12px;line-height:1.8}a{display:inline-block;margin:12px 0;background:#294d6d;color:white;padding:10px;border-radius:${candidate ? '0' : '14'}px;text-decoration:none;font-size:11px}section{margin-top:40px;border-top:1px solid #bbc5ce;padding-top:15px}h2{font-size:15px}`, javascript: '' };
			if (compared) await new Promise(resolve => setTimeout(resolve, candidate ? 120 : 260));
			const text = compared ? JSON.stringify(artifact) : request ? JSON.stringify({ kind: 'candidate', reason: '固定响应，仅验证主流程；不证明效果提升。', changes: [{ path: 'SKILL.md', content: request.files.find((f: {path: string}) => f.path === 'SKILL.md').content + '\n浏览器验收偏好：保持紧凑排版。\n' }] }) : options.system?.includes('仅返回完整 JSON') ? JSON.stringify({ conclusion: '固定测试响应；未做真实评测。', directions: [{ objective: design ? 'design' : 'brevity', title: design ? '落实已确认设计偏好' : '缩短结果说明', rationale: '依据用户确认的输入；固定样例不代表真实模型质量。', files: ['SKILL.md'], requiredInformation: [design ? '必需内容、功能和可访问性' : '执行结果与错误'], optionalInformation: ['逐步解释'] }] }) : '固定响应：本次流程验证完成，没有生成页面。';
			yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 30, totalTokens: compared ? (candidate ? 1200 : 2000) : 130 } };
			yield { type: 'block-start', index: 0, blockType: 'text' };
			yield { type: 'text-delta', index: 0, text };
			yield { type: 'block-end', index: 0, block: { type: 'text', text } };
			yield { type: 'finish', reason: { kind: 'stop' } };
		}
	}
	ctx.llm.registerAdapter(['deepseek-official'], new Adapter());
	const root = join(process.env.DSH_HOME, 'workspace');
	const source = join(root, 'sample');
	await ctx.workspaceRegistry.create(root, 'G1 隔离验证');
	ctx.skills.register({ name: 'g1-browser-sample', description: '固定浏览器验收样例，不使用真实 API', source: 'fixture', content: await readFile(join(source, 'SKILL.md'), 'utf8'), resourceBase: { kind: 'directory', path: source } });
	const business = ctx.get('rsiG1') as ReturnType<typeof applyG1>;
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-g1-fixture', async (endpoint, payload) => {
		if (JSON.stringify(payload) !== '{}') throw new Error('No arbitrary fixture inputs');
		if (endpoint === 'trace') {
			const session = ctx.sessions.create(SessionId('g1-browser-daily'), { meta: { cwd: root } });
			session.append('turn/start', { turn: 1 });
			session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请给出简洁结论，保留执行结果与错误。' }] }), { surfaceOp: 'append' });
			const definition = (await ctx.skills.get('g1-browser-sample', { cwd: root }))!;
			session.append('user/message', createUserMessage({ source: { kind: 'skill-invocation', name: definition.name, form: 'instructions' }, content: [{ type: 'text', text: renderSkillContent(definition) }] }), { surfaceOp: 'append' });
			session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
			await business.whenObserved();
		}
		return { ok: true, value: { calls, state: business.snapshot().business } };
	}));
}
