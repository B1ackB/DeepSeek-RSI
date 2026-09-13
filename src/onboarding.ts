import type { Context } from '@deepseek-ai/cordis';
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-user-questions';
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm';
import { isUserInvocable, renderSkillContent, type SkillDefinition } from '@deepseek-ai/dsh-skill';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fault } from './contracts.ts';
import type {} from './scenarios/index.ts';
import type { Store } from './store.ts';
import type { Enrollment, ManagedSkill } from './g1-contracts.ts';

const userText = (messages: readonly UserMessage[]) => messages.filter(m => m.source.kind === 'user').flatMap(m => m.content.flatMap(c => c.type === 'text' ? [c.text] : [])).join('\n');

export function applyOnboarding(ctx: Context, store: Store, prepareManaged: (workspaceId: string, sessionId: string, name: string) => Promise<ManagedSkill>, startPage?: (agent: Agent, turn: number, skills: SkillDefinition[], decision: Extract<PreStepDecision, { kind: 'enter' }>, signal: AbortSignal) => Promise<PreStepDecision>) {
	const pending = new Map<string, Promise<Enrollment>>();
	const lifetime = new AbortController();
	const current = (sessionId: string) => store.business().enrollments.findLast(e => e.sessionId === sessionId && e.status === 'active');
	function options(agent: Agent, signal: AbortSignal) { return { cwd: agent.session.header.cwd, scope: agent, signal }; }
	function root(agent: Agent) { return ctx.agents.roots().includes(agent) && !agent.session.id.startsWith('rsi-'); }
	async function ask(agent: Agent, turn: number, skills: SkillDefinition[], proposed: boolean, callerSignal: AbortSignal) {
		const signal = AbortSignal.any([callerSignal, lifetime.signal]);
		signal.throwIfAborted();
		const before = current(agent.session.id); if (before) return before;
		const inFlight = pending.get(agent.session.id); if (inFlight) return inFlight;
		const work = (async (): Promise<Enrollment> => {
			const workspace = ctx.workspaceRegistry.list().find(w => w.path === agent.session.header.cwd);
			if (!workspace) throw fault('workspace_missing', '请先在 Harness 登记当前工作区，再开始 RSI 任务');
			const questions = ctx.get('userQuestions');
			if (!questions) throw fault('questions_unavailable', 'Harness 尚未提供用户问答服务，无法确认本次 RSI 范围');
			const labels = skills.map(skill => `纳入 ${skill.name}`);
			const answer = await questions.ask({ agent, signal, questions: [{ id: 'rsi-enrollment', header: 'RSI · 本次任务', question: proposed ? 'Skill 任务即将开始。是否选用以下 Skill，并纳入本次自我迭代范围？' : `本次将使用 ${skills.map(s => s.name).join('、')}。是否纳入自我迭代范围？`, detail: '仅记录本次任务的优化线索；不自动分析、修改或启用 Skill。同一会话内的连续修改沿用本次选择，可在右侧结束。暂不纳入时，原任务正常继续。', options: [...labels.map(label => ({ label, description: '仅本次任务；实际修改和启用仍需另行授权' })), { label: '暂不纳入，继续编写', description: '本次任务不记录为 RSI 优化线索' }] }] });
			signal.throwIfAborted();
			const selected = answer.answers.find(a => a.id === 'rsi-enrollment');
			const index = selected?.selected.length === 1 && !selected.custom?.trim() ? labels.indexOf(selected.selected[0]!) : -1;
			let managed: ManagedSkill | undefined;
			if (index >= 0) {
				const selectedSkill = skills[index]!;
				const now = await ctx.skills.get(selectedSkill.name, options(agent, signal));
				if (!now || renderSkillContent(now) !== renderSkillContent(selectedSkill)) throw fault('source_changed', '等待确认期间 Skill 已变化，请重新开始任务');
				managed = await prepareManaged(workspace.id, agent.session.id, selectedSkill.name);
			}
			signal.throwIfAborted();
			if (!ctx.workspaceRegistry.list().some(w => w.id === workspace.id && w.path === workspace.path)) throw fault('workspace_missing', '等待确认期间工作区已变化');
			const record: Enrollment = { id: randomUUID(), sessionId: agent.session.id, turn, workspaceId: workspace.id, decision: managed ? 'included' : 'declined', skillId: managed?.id ?? null, status: 'active', createdAt: Date.now() };
			store.mutateBusiness(state => {
				if (state.enrollments.some(e => e.sessionId === record.sessionId && e.status === 'active')) throw fault('state_conflict', '本次任务已有选择，请刷新');
				if (managed && !state.skills.some(s => s.id === managed.id)) state.skills.push({ ...managed, observing: false });
				state.enrollments.push(record);
			});
			return record;
		})();
		pending.set(agent.session.id, work);
		try { return await work; } finally { pending.delete(agent.session.id); }
	}
	ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
		const decision = await next();
		if (decision.kind === 'reject' || !root(agent)) return decision;
		if (startPage && store.business().mainflow.tasks.some(t => t.sessionId === agent.session.id && !['dispatched', 'stopped'].includes(t.status))) return startPage(agent, turn, [], decision, signal);
		if (current(agent.session.id)) return decision;
		const text = userText(messages);
		const explicit = [...new Set([...text.matchAll(/(?:^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g)].map(m => m[1]!))];
		const definitions: SkillDefinition[] = [];
		for (const name of explicit.slice(0, 32)) { const skill = await ctx.skills.get(name, options(agent, signal)); if (skill && isUserInvocable(skill)) definitions.push(skill); }
		const proposed = definitions.length === 0;
		const scenario = ctx.rsiScenarios.forRequest(text);
		if (proposed && !scenario) return decision;
		if (proposed) {
			const catalog = await ctx.skills.snapshot(options(agent, signal));
			if (!catalog.complete) throw fault('catalog_incomplete', 'Skill 目录尚未完整，请稍后重试');
			for (const entry of catalog.skills.filter(s => isUserInvocable(s) && s.resourceBase?.kind === 'directory' && scenario!.matchesSkill(s)).slice(0, 6)) { const skill = await ctx.skills.get(entry.name, options(agent, signal)); if (skill) definitions.push(skill); }
		}
		const supported = definitions.filter(s => s.resourceBase?.kind === 'directory').slice(0, 6);
		if (!supported.length) return decision;
		if (startPage) return startPage(agent, turn, supported, decision, signal);
		const record = await ask(agent, turn, supported, proposed, signal);
		if (!proposed || !record.skillId) return decision;
		const skill = supported.find(s => s.name === store.business().skills.find(m => m.id === record.skillId)?.name)!;
		return { ...decision, messages: [...decision.messages, createUserMessage({ source: { kind: 'skill-invocation', name: skill.name, form: 'instructions' }, content: [{ type: 'text', text: renderSkillContent(skill) }] })] };
	});
	ctx.on('tools/pre-execute', async (exec, next) => {
		const decision = await next();
		if (decision.kind !== 'allow' || exec.name !== 'skill' || !exec.agent || !root(exec.agent) || current(exec.agent.session.id)) return decision;
		const parsed = z.object({ name: z.string() }).safeParse(exec.arguments); if (!parsed.success) return decision;
		const skill = await ctx.skills.get(parsed.data.name, options(exec.agent, exec.signal));
		if (skill?.resourceBase?.kind === 'directory') {
			const turn = exec.agent.session.snapshotEvents().findLast(e => e.type === 'turn/start');
			if (turn?.type === 'turn/start') await ask(exec.agent, turn.data.turn, [skill], false, exec.signal);
		}
		return decision;
	});
	ctx.effect(() => async () => { lifetime.abort(); await Promise.allSettled(pending.values()); });
}
