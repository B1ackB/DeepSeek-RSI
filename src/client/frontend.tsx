import React, { useState } from 'react';
import type { G1Snapshot, ManagedSkill } from '../g1-contracts.ts';
import { dimensions, questions, type Answer, type DesignTask, type Preference } from '../frontend-contracts.ts';
import type { createPanelModel } from './model.ts';

type Run = (kind: Parameters<ReturnType<typeof createPanelModel>['command']>[0], payload: Parameters<ReturnType<typeof createPanelModel>['command']>[1]) => Promise<void>;
const scopes = { task: '仅本次', project: '当前项目', personal: '个人通用' };

function Questions({ task, disabled, run }: { task: DesignTask; disabled: boolean; run: Run }) {
	const batch = task.batches.find(b => !b.answered);
	const [answers, setAnswers] = useState<Answer[]>(() => batch?.dimensions.map(dimension => ({ dimension, kind: 'value', value: '', scope: 'project' })) ?? []);
	if (!batch) return <p>已完成可选问题，可以确认上下文。</p>;
	return <section aria-label="设计偏好问题">
		<p>第 {task.batches.length} / 2 批 · 固定问题，不消耗 Token。保存范围默认当前项目，可改为仅本次。</p>
		{answers.map((answer, index) => {
			const question = questions[answer.dimension];
			const update = (change: Partial<Answer>) => setAnswers(rows => rows.map((row, i) => i === index ? { ...row, ...change } : row));
			return <fieldset key={answer.dimension}><legend>{question.prompt}</legend>
				<label>{question.label}回答方式<select value={answer.kind} disabled={disabled} onChange={e => update({ kind: e.target.value as Answer['kind'], value: e.target.value === 'value' ? '' : null, scope: e.target.value === 'value' ? 'project' : 'task' })}><option value="value">填写偏好</option><option value="no_preference">没有偏好</option><option value="skip">暂时跳过</option></select></label>
				{answer.kind === 'value' && <><label>{question.label}偏好<input maxLength={500} value={answer.value ?? ''} placeholder={question.example} disabled={disabled} onChange={e => update({ value: e.target.value })} /></label><label>{question.label}保存范围<select value={answer.scope} disabled={disabled} onChange={e => update({ scope: e.target.value as Answer['scope'] })}>{Object.entries(scopes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></>}
			</fieldset>;
		})}
		<button disabled={disabled || answers.some(a => a.kind === 'value' && !a.value?.trim())} onClick={() => void run('design_answer', { taskId: task.id, answers })}>确认本批答案与保存范围</button>
	</section>;
}

function Preferences({ snapshot, workspaceId, disabled, run }: { snapshot: G1Snapshot; workspaceId: string; disabled: boolean; run: Run }) {
	const [scope, setScope] = useState<Preference['scope']>('project');
	const [dimension, setDimension] = useState<Preference['dimension']>('palette');
	const [value, setValue] = useState('');
	const [enabled, setEnabled] = useState(true);
	const rows = snapshot.business.frontend.preferences.filter(p => p.scope === 'personal' || p.workspaceId === workspaceId);
	return <details><summary>管理已保存的偏好（{rows.length}）</summary>
		<p className="rsi-muted">修改影响尚未确认和后续的设计准备；已确认上下文保持不变。移除当前偏好会保留历史任务中的原有记录。</p>
		{rows.map(p => <div className="rsi-card" key={p.id}><strong>{questions[p.dimension].label} · {scopes[p.scope]}{p.enabled ? '' : ' · 已停用'}</strong><p>{p.value}</p><div className="rsi-actions"><button disabled={disabled} onClick={() => { setScope(p.scope); setDimension(p.dimension); setValue(p.value); setEnabled(p.enabled); }}>编辑</button><button disabled={disabled} onClick={() => void run('preference_save', { workspaceId, scope: p.scope, dimension: p.dimension, value: p.value, enabled: !p.enabled })}>{p.enabled ? '停用' : '启用'}</button><button disabled={disabled} onClick={() => void run('preference_remove', { preferenceId: p.id })}>移除当前偏好</button></div></div>)}
		<label>偏好作用范围<select value={scope} onChange={e => setScope(e.target.value as Preference['scope'])}><option value="project">当前项目</option><option value="personal">个人通用（跨项目）</option></select></label>
		<label>偏好维度<select value={dimension} onChange={e => setDimension(e.target.value as Preference['dimension'])}>{dimensions.map(d => <option key={d} value={d}>{questions[d].label}</option>)}</select></label>
		<label>偏好内容<textarea maxLength={500} value={value} onChange={e => setValue(e.target.value)} /></label>
		<label><span><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> 启用此偏好</span></label>
		<button disabled={disabled || !value.trim()} onClick={() => void run('preference_save', { workspaceId, scope, dimension, value, enabled })}>确认保存到{scopes[scope]}</button>
	</details>;
}

function TaskOverrides({ task, disabled, run }: { task: DesignTask; disabled: boolean; run: Run }) {
	const [chosen, setChosen] = useState<Answer['dimension']>('palette');
	const [kind, setKind] = useState<Answer['kind']>('value');
	const [value, setValue] = useState('');
	const available = dimensions.filter(d => !task.batches.some(b => !b.answered && b.dimensions.includes(d)));
	const dimension = available.includes(chosen) ? chosen : available[0];
	if (!dimension) return null;
	return <details><summary>仅本次调整已保存或已回答的偏好</summary><p className="rsi-muted">本次调整优先于项目与个人偏好；当前正在提问的维度在上方作答。</p>
		<label>本次调整维度<select value={dimension} onChange={e => setChosen(e.target.value as Answer['dimension'])}>{available.map(d => <option key={d} value={d}>{questions[d].label}</option>)}</select></label>
		<label>本次调整方式<select value={kind} onChange={e => setKind(e.target.value as Answer['kind'])}><option value="value">填写偏好</option><option value="no_preference">没有偏好</option><option value="skip">暂时跳过</option></select></label>
		{kind === 'value' && <label>本次偏好内容<input maxLength={500} value={value} onChange={e => setValue(e.target.value)} /></label>}
		<button disabled={disabled || (kind === 'value' && !value.trim())} onClick={() => void run('design_override', { taskId: task.id, answer: { dimension, kind, value: kind === 'value' ? value : null, scope: 'task' } })}>保存本次调整</button>
		{task.answers.map(a => <small key={a.dimension}>{questions[a.dimension].label}：{a.value ?? (a.kind === 'skip' ? '已跳过' : '没有偏好')}</small>)}
	</details>;
}

export function FrontendPreparation({ snapshot, skills, workspaceId, disabled, run, budget }: { snapshot: G1Snapshot; skills: ManagedSkill[]; workspaceId: string; disabled: boolean; run: Run; budget: G1Snapshot['config']['analysis'] }) {
	const [chosenSkill, setSkill] = useState('');
	const [brief, setBrief] = useState('');
	const skill = skills.find(s => s.id === chosenSkill) ?? skills.find(s => s.name === 'rsi-frontend-design') ?? skills[0];
	const task = snapshot.business.frontend.tasks.find(t => t.skillId === skill?.id && t.status !== 'closed');
	return <section aria-label="前端设计准备"><h3>前端设计准备</h3><p className="rsi-muted">先明确页面需求和偏好，再预览优化分析。初始 Skill：rsi-frontend-design，可从上方纳入管理。</p>
		{skills.length > 0 && <label>设计 Skill<select value={skill?.id ?? ''} disabled={disabled} onChange={e => setSkill(e.target.value)}>{skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
		{skill && !task && <><label>页面需求<textarea maxLength={4000} value={brief} onChange={e => setBrief(e.target.value)} placeholder="页面用途、必须保留的内容与交互、技术栈及产物位置；审美偏好将在下一步确认。" /></label><button disabled={disabled || !brief.trim()} onClick={() => void run('design_create', { skillId: skill.id, brief })}>开始设计准备（不调用模型）</button></>}
		{task && <div className="rsi-card"><strong>{task.status === 'ready' ? '设计上下文已确认' : '正在确认设计偏好'}</strong><p>{task.brief}</p>
			{task.status === 'collecting' && <><Questions key={`${task.id}:${task.batches.length}:${task.batches.at(-1)?.answered}`} task={task} disabled={disabled} run={run} /><TaskOverrides key={task.id} task={task} disabled={disabled} run={run} /><p className="rsi-muted">可停止本次提问并确认上下文；未回答的维度不会被猜测为你的喜好。</p><button disabled={disabled} onClick={() => void run('design_finish', { taskId: task.id })}>确认上下文，停止本次提问</button></>}
			{task.frozen && <><ul>{task.frozen.preferences.map(p => <li key={p.dimension}>{questions[p.dimension].label}：{p.value ?? (p.kind === 'no_preference' ? '没有偏好' : p.kind === 'skip' ? '已跳过' : '未指定')} · {p.source === 'default' ? '未指定' : scopes[p.source]}</li>)}</ul><details><summary>复制已确认上下文</summary><p className="rsi-muted">可全选复制到普通 Harness 设计任务。当前不会自动注入会话。</p><textarea aria-label="已确认设计上下文" readOnly value={JSON.stringify(task.frozen, null, '\t')} rows={12} onFocus={e => e.target.select()} /></details><button disabled={disabled} onClick={() => void run('prepare_design_analysis', { taskId: task.id, budget })}>预览设计优化分析</button><small>预览不调用模型；检查发送内容和预算后可另行确认一次分析。</small></>}
			<button disabled={disabled} onClick={() => void run('design_close', { taskId: task.id })}>结束本次准备</button>
		</div>}
		<Preferences snapshot={snapshot} workspaceId={workspaceId} disabled={disabled} run={run} />
	</section>;
}
