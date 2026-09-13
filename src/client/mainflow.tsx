import { useState } from 'react';
import { flowChecks, type FlowTask } from '../mainflow-contracts.ts';
import type { G1Command, G1Snapshot } from '../g1-contracts.ts';
import { ComparisonCard, RevisionForm } from './comparison.tsx';
import { DesignStart, pageTypes, designStyles } from './design-start.tsx';

const checkLabels = ['修改范围', 'Skill 文件完整性', '脚本语法', '版本保存与用量'];
const checkLabel = (name: string) => checkLabels[flowChecks.findIndex(check => check === name)] ?? name;
const labels: Record<FlowTask['status'], string> = { confirming: '确认偏好、修改范围与预算', generating: '独立模型正在生成候选', clarifying: '等待具体偏好澄清', checking: '宿主正在检查候选', review: '检查完成，等待启用确认', failed: '本次未采用新版，等待选择', ready: '已选择版本，正在衔接任务', dispatched: '任务已派发', stopped: '本次任务已停止' };
export function MainflowCard({ task, snapshot, disabled, run, openSession }: { task: FlowTask; snapshot: G1Snapshot; disabled: boolean; openSession: (id: string) => Promise<void>; run: (kind: G1Command['kind'], payload: G1Command['payload']) => Promise<void> }) {
	const [preference, setPreference] = useState(task.preference);
	const [brief, setBrief] = useState(task.brief);
	const [scope, setScope] = useState(task.scope);
	const [paths, setPaths] = useState(task.paths);
	const [budget, setBudget] = useState(task.budget);
	const [navigationError, setNavigationError] = useState('');
	const [answers, setAnswers] = useState<string[]>([]);
	const [pageType, setPageType] = useState('');
	const [direction, setDirection] = useState('');
	const typePrompt = pageTypes.find(p => p.id === pageType)?.prompt;
	const finalBrief = [brief, typePrompt].filter(Boolean).join('\n\n');
	const finalPreference = [designStyles.find(s => s.id === direction)?.prompt, preference].filter(Boolean).join('\n\n');
	const tooLong = finalBrief.length > 16000 || finalPreference.length > 4000;
	const comparing = task.comparison?.status === 'running';
	const candidateReady = !task.comparison || (!comparing && task.comparison.runs[1].status === 'passed');
	const parent = snapshot.business.mainflow.tasks.find(t => t.id === task.parentId);
	const rows = snapshot.attempts.filter(a => a.owner === 'rsi' && a.ownerId === task.id);
	const known = rows.filter(a => a.usageState === 'confirmed');
	const choose = (choice: 'candidate' | 'baseline' | 'stop' | 'reject') => run('flow_choose', { taskId: task.id, choice, digest: choice === 'candidate' ? task.candidate!.snapshot.versionDigest : choice === 'baseline' ? task.baseline.versionDigest : null });
	return <section className="rsi-card" aria-label="偏好驱动 Skill 修改">
		<h3>{labels[task.status]}</h3><strong>{task.name}</strong>
		<small>{task.scenario.label} · {task.parentId ? '继续上一轮调整' : '本次调整'}</small>
		{task.error && <p role="alert">{task.error}</p>}
		{task.status === 'confirming' && <>
			<p>确认后先修改独立 Skill 副本，审阅启用后开始本次任务。原目录保留。</p>
			{task.scenario.id === 'frontend' && <DesignStart pageType={pageType} direction={direction} onType={setPageType} onDirection={setDirection} />}
			<label>本次任务需求与必需项目约束<textarea value={brief} maxLength={16000} onChange={e => setBrief(e.target.value)} /></label>
			<small>已有会话用过旧 Skill 时会创建关联新会话；请在上方补齐继续任务必需的约束。</small>
			<label>自然语言偏好<textarea aria-label="自然语言偏好" value={preference} maxLength={4000} onChange={e => setPreference(e.target.value)} placeholder={task.scenario.id === 'frontend' ? '选好风格后也可自由补充……' : '描述希望 Skill 如何工作、如何组织输出……'} /></label>
			{(typePrompt || finalPreference) && <div className="rsi-design-summary" aria-label="本次设计方向"><strong>本次将采用</strong>{typePrompt && <p>{typePrompt}</p>}<p>{finalPreference || '请再选一种感觉，或填写自己的偏好。'}</p><small>推荐与自由补充将一起发送；有具体冲突时由模型澄清。</small></div>}
			{tooLong && <p role="alert">合并后的需求或偏好超过长度上限，请缩短自由补充或取消推荐项。</p>}
			<label>偏好保存与新版范围<select value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="project">当前项目（保存偏好；启用后作为项目版本）</option><option value="task">仅本次（不改变项目默认版本）</option><option value="personal">个人默认偏好（新版只启用于当前项目）</option></select></label>
			{task.inherited.length > 0 && <details><summary>已保存的适用偏好</summary>{task.inherited.map((p, i) => <p key={i}>{p}</p>)}<small>本次原文优先；存在具体冲突时由模型澄清。</small></details>}
			<fieldset><legend>允许修改的文件</legend>{task.files.map(f => <label key={f.path}><input type="checkbox" checked={paths.includes(f.path)} onChange={e => setPaths(e.target.checked ? [...paths, f.path] : paths.filter(p => p !== f.path))} />{f.path}</label>)}</fieldset>
			<details><summary>完整发送文件与固定检查</summary>{task.files.map(f => <details key={f.path}><summary>{f.path}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{f.content}</pre></details>)}{task.referenceFiles.length > 0 && <details><summary>上一轮参考候选的完整文件</summary>{task.referenceFiles.map(f => <details key={f.path}><summary>{f.path}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{f.content}</pre></details>)}</details>}{flowChecks.map(c => <p key={c}>{checkLabel(c)}</p>)}</details>
			<p>DeepSeek-V4-Flash / Low · 无工具调用、不自动重试。澄清也计入以下总预算。</p>
			<label>最多请求数（含澄清，1–3）<input type="number" min={1} max={3} value={budget.maxRequests} onChange={e => setBudget({ ...budget, maxRequests: e.target.valueAsNumber })} /></label>
			<label>每次输出 Token 上限（含推理）<input type="number" min={128} max={4096} value={budget.maxOutputTokens} onChange={e => setBudget({ ...budget, maxOutputTokens: e.target.valueAsNumber })} /></label>
			<small>单次完整输入上限 {budget.maxInputBytes} 字节；已确认累计 {budget.tokenStopThreshold} Token 停止追加；总窗口 {budget.maxDurationMs / 60000} 分钟，等待回答不延长。阈值不保证单次调用不会跨过。</small>
			<button disabled={disabled || tooLong || !finalPreference.trim() || !brief.trim() || !paths.length} onClick={() => void run('flow_authorize', { taskId: task.id, previewDigest: task.previewDigest, brief: finalBrief, preference: finalPreference, scope, paths, budget })}>确认偏好、范围与预算，生成候选</button>
		</>}
		{task.status === 'clarifying' && <><p>仅补充原方向与文件范围内的答案；扩大范围请停止并重新确认。空答案表示跳过，不表示同意。</p>{task.clarifications.at(-1)!.questions.map((q, i) => <label key={`${task.clarifications.length}:${i}`}>{q}<textarea value={answers[i] ?? ''} maxLength={2000} onChange={e => setAnswers(a => { const b = [...a]; b[i] = e.target.value; return b; })} /></label>)}<button disabled={disabled} onClick={() => { void run('flow_answer', { taskId: task.id, answers: task.clarifications.at(-1)!.questions.map((_, i) => answers[i] ?? '') }); setAnswers([]); }}>提交本批答案，沿用剩余预算</button></>}
		{task.candidate && <><p>{task.candidate.reason}</p><small>新版已准备好</small><details open={task.status === 'review'}><summary>完整变更对照</summary>{task.candidate.changes.map(f => <details key={f.path}><summary>{f.path}</summary><strong>修改前</strong><pre style={{ whiteSpace: 'pre-wrap' }}>{task.files.find(b => b.path === f.path)?.content}</pre><strong>修改后</strong><pre style={{ whiteSpace: 'pre-wrap' }}>{f.content}</pre></details>)}</details></>}
		{task.checks.map((c, i) => <p key={i}>{c.status === 'passed' ? '通过' : c.status === 'failed' ? '未通过' : c.name === flowChecks[2] ? '无需检查' : '尚未生成'} · {checkLabel(c.name)}{c.status === 'failed' && <small>{c.detail}</small>}</p>)}
		<p>RSI 修改/澄清：{rows.length} / {task.budget.maxRequests} 次请求 · {known.length ? known.reduce((n, a) => n + a.tokens.total!, 0).toLocaleString() : '—'} 已确认 Token · {rows.length - known.length} 次待结算</p>
		<small>是否采用由你决定；对照产物费用与上述修改费用分别记账，正式任务另计入日常会话。</small>
		<ComparisonCard task={task} snapshot={snapshot} disabled={disabled} run={run} />
		{task.status === 'review' && <div className="rsi-actions"><button disabled={disabled || comparing || !candidateReady} onClick={() => void choose('candidate')}>采用新版并开始任务</button><button disabled={disabled || comparing} onClick={() => void choose('reject')}>拒绝新版</button></div>}
		{['confirming', 'failed', 'review', 'clarifying'].includes(task.status) && <button disabled={disabled || comparing} onClick={() => void choose('baseline')}>{task.status === 'confirming' ? '本次不修改 Skill，用旧版继续' : '用旧版继续'}</button>}
		{!['dispatched', 'stopped'].includes(task.status) && <button disabled={disabled} onClick={() => void choose('stop')}>停止本次任务</button>}
		{((task.status === 'ready' && task.error) || (task.status === 'failed' && task.chosenDigest && task.delivery !== 'admitted')) && <button disabled={disabled} onClick={() => void run('flow_resume', { taskId: task.id })}>恢复任务启动</button>}
		{navigationError && <p role="alert">{navigationError}</p>}
		{task.executionSessionId && task.executionSessionId !== task.sessionId && <button onClick={() => void openSession(task.executionSessionId!).catch(e => setNavigationError(String(e)))}>打开关联任务会话</button>}
		{task.executionSessionId && <small>{task.executionSessionId !== task.sessionId ? '已在关联会话中继续，原会话保留。' : '在当前会话中继续。'}</small>}
		{['review', 'failed', 'dispatched'].includes(task.status) && <RevisionForm task={task} disabled={disabled || comparing} run={run} />}
		{parent && <details><summary>上一轮记录与费用</summary><p>{parent.preference}</p><ComparisonCard task={parent} snapshot={snapshot} disabled run={run} historical /><small>修改调用已确认 Token：{snapshot.attempts.filter(a => a.ownerId === parent.id && a.usageState === 'confirmed').reduce((sum, a) => sum + a.tokens.total!, 0).toLocaleString()}</small></details>}
	</section>;
}
