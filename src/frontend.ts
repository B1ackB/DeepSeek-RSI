import { createHash, randomUUID } from 'node:crypto';
import { fault } from './contracts.ts';
import { dimensions, type Answer, type DesignTask, type FrontendState, type FrozenDesign, type Preference } from './frontend-contracts.ts';

export const designDigest = (value: FrozenDesign) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function resolveDesign(state: FrontendState, task: DesignTask): FrozenDesign {
	return { brief: task.brief, versionDigest: task.versionDigest, preferences: dimensions.map(dimension => {
		const answer = task.answers.find(a => a.dimension === dimension);
		if (answer) return { dimension, kind: answer.kind, value: answer.value, source: 'task' as const, preferenceId: null, preferenceRevision: null };
		const preference = state.preferences.find(p => p.enabled && p.dimension === dimension && p.scope === 'project' && p.workspaceId === task.workspaceId)
			?? state.preferences.find(p => p.enabled && p.dimension === dimension && p.scope === 'personal');
		return preference ? { dimension, kind: 'value' as const, value: preference.value, source: preference.scope, preferenceId: preference.id, preferenceRevision: preference.revision }
			: { dimension, kind: 'unspecified' as const, value: null, source: 'default' as const, preferenceId: null, preferenceRevision: null };
	}) };
}
function nextBatch(state: FrontendState, task: DesignTask) {
	if (task.batches.length >= 2 || task.batches.some(b => !b.answered)) return;
	const missing = resolveDesign(state, task).preferences.filter(p => p.kind === 'unspecified').map(p => p.dimension).filter(d => !task.batches.some(b => b.dimensions.includes(d))).slice(0, 3);
	if (missing.length) task.batches.push({ dimensions: missing, answered: false });
}
export function createDesign(state: FrontendState, input: Pick<DesignTask, 'skillId' | 'workspaceId' | 'versionDigest' | 'brief'>) {
	if (state.tasks.some(t => t.skillId === input.skillId && t.status !== 'closed')) throw fault('design_busy', '请先结束该 Skill 的已有设计准备');
	const task: DesignTask = { ...input, id: randomUUID(), revision: 1, status: 'collecting', createdAt: Date.now(), batches: [], answers: [], frozen: null, frozenDigest: null };
	nextBatch(state, task); state.tasks.push(task); return task.id;
}
export function savePreference(state: FrontendState, input: Omit<Preference, 'id' | 'revision'>) {
	const existing = state.preferences.find(p => p.scope === input.scope && p.workspaceId === input.workspaceId && p.dimension === input.dimension);
	if (existing) { Object.assign(existing, input); existing.revision++; return existing.id; }
	const record = { ...input, id: randomUUID(), revision: 1 }; state.preferences.push(record); return record.id;
}
export function answerDesign(state: FrontendState, task: DesignTask, answers: Answer[]) {
	const batch = task.batches.find(b => !b.answered);
	if (task.status !== 'collecting' || !batch) throw fault('state_conflict', '此轮问题已经结束，请刷新');
	if (answers.length !== batch.dimensions.length || new Set(answers.map(a => a.dimension)).size !== answers.length || answers.some(a => !batch.dimensions.includes(a.dimension))) throw fault('invalid_answers', '只接受当前一批问题，不能缺失或重复');
	for (const answer of answers) {
		if (task.answers.some(a => a.dimension === answer.dimension)) throw fault('state_conflict', '同一维度不能重复回答');
		task.answers.push(answer);
		if (answer.scope !== 'task' && answer.kind === 'value') savePreference(state, { dimension: answer.dimension, value: answer.value!, scope: answer.scope, workspaceId: answer.scope === 'project' ? task.workspaceId : null, enabled: true });
	}
	batch.answered = true; task.revision++; nextBatch(state, task);
}
export function finishDesign(state: FrontendState, task: DesignTask) {
	if (task.status !== 'collecting') throw fault('state_conflict', '此准备已确认或结束');
	for (const batch of task.batches.filter(b => !b.answered)) {
		for (const dimension of batch.dimensions) task.answers.push({ dimension, kind: 'skip', value: null, scope: 'task' });
		batch.answered = true;
	}
	task.frozen = resolveDesign(state, task); task.frozenDigest = designDigest(task.frozen); task.status = 'ready'; task.revision++;
}
export function overrideDesign(task: DesignTask, answer: Answer) {
	if (task.status !== 'collecting') throw fault('state_conflict', '只能调整尚未确认的上下文');
	if (answer.scope !== 'task' || task.batches.some(b => !b.answered && b.dimensions.includes(answer.dimension))) throw fault('invalid_answers', '当前问题请在本批作答；其他偏好只允许本次覆盖');
	const existing = task.answers.find(a => a.dimension === answer.dimension);
	if (existing) Object.assign(existing, answer); else task.answers.push(answer);
	task.revision++;
}
export function requireDesign(state: FrontendState, id: string) {
	const task = state.tasks.find(t => t.id === id);
	if (!task) throw fault('design_missing', '设计准备不存在');
	return task;
}
export function frozenDesign(state: FrontendState, id: string, skillId: string, version: string) {
	const task = requireDesign(state, id);
	if (task.status !== 'ready' || task.skillId !== skillId || task.versionDigest !== version || !task.frozen || task.frozenDigest !== designDigest(task.frozen)) throw fault('design_changed', '设计准备未确认、已结束或与当前 Skill 不匹配');
	return task;
}
