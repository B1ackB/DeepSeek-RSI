import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { renderSkillContent } from '@deepseek-ai/dsh-skill';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { applyG1 } from '../src/g1.ts';
import { defaultAnalysisBudget, type G1Command } from '../src/g1-contracts.ts';

export const inject = ['rsiG1', 'workspaceRegistry', 'skills', 'sessions', 'connection'];
// 只有用户批准的测试覆盖层加载它；准备不会派发，仍经生产命令确认精确摘要。
export async function apply(ctx: Context) {
	if (process.env.RSI_G1_LIVE_PROBE !== '2026-09-08-low-one-request') throw new Error('Explicit G1 live probe authorization required');
	const business = ctx.get('rsiG1') as ReturnType<typeof applyG1>;
	const root = '/Users/black/Documents/ChatGPT/DeepSeek-RSI/.cache/g1-live-low-workspace';
	const source = join(root, 'sample');
	const workspace = await ctx.workspaceRegistry.create(root, 'RSI G1 Low 真实验收');
	ctx.skills.register({ name: 'g1-live-low-sample', description: 'G1 专用测试 Skill', source: 'fixture', content: await readFile(join(source, 'SKILL.md'), 'utf8'), resourceBase: { kind: 'directory', path: source } });
	const command = (kind: G1Command['kind'], payload: unknown) => business.command({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: business.snapshot().business.revision, kind, payload });
	let analysisId: string | undefined;
	let dispatched = false;
	ctx.on('llm/stream', async function* (options, next) {
		if (!analysisId || options.sessionId !== `rsi-analysis/${analysisId}` || dispatched) throw new Error('G1 live batch permits only its one approved analysis request');
		dispatched = true; yield* next();
	});
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-g1-live-probe', async (endpoint, payload) => {
		if (JSON.stringify(payload) !== '{}') throw new Error('Only the fixed approved sample is accepted');
		if (endpoint === 'prepare') {
			if (analysisId || business.snapshot().business.skills.some(s => s.name === 'g1-live-low-sample')) throw new Error('This paid batch is already prepared; no replay');
			await command('manage', { workspaceId: workspace.id, sessionId: null, name: 'g1-live-low-sample' });
			const session = ctx.sessions.create(SessionId('g1-live-low-approved-2026-09-08'), { meta: { cwd: root } });
			session.append('turn/start', { turn: 1 });
			session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '希望 Skill 执行完只给简洁结论，必须保留版本标记和任何错误，不需要逐步解释。' }] }), { surfaceOp: 'append' });
			const definition = (await ctx.skills.get('g1-live-low-sample', { cwd: root }))!;
			session.append('user/message', createUserMessage({ source: { kind: 'skill-invocation', name: definition.name, form: 'instructions' }, content: [{ type: 'text', text: renderSkillContent(definition) }] }), { surfaceOp: 'append' });
			session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
			await business.whenObserved();
			const opportunity = business.snapshot().business.opportunities.find(o => o.evidence.some(e => e.sessionId === session.id));
			if (!opportunity) throw new Error('No verified observation');
			analysisId = (await command('prepare_analysis', { opportunityId: opportunity.id, budget: defaultAnalysisBudget })).focusId!;
		}
		if (endpoint === 'cleanup') {
			for (const skill of business.snapshot().business.skills.filter(s => s.name === 'g1-live-low-sample')) await command('observe', { skillId: skill.id, enabled: false });
			await ctx.workspaceRegistry.delete(workspace.id);
		}
		const snapshot = business.snapshot();
		return { ok: true, value: { analysis: snapshot.business.analyses.find(a => a.id === analysisId), calls: snapshot.attempts.filter(a => a.ownerId === analysisId).length } };
	}));
}
