import { useState } from 'react';
import { flowChecks, type FlowTask } from '../mainflow-contracts.ts';
import type { G1Command, G1Snapshot } from '../g1-contracts.ts';

const labels: Record<FlowTask['status'], string> = { confirming: '确认偏好、修改范围与预算', generating: '独立模型正在生成候选', clarifying: '等待具体偏好澄清', checking: '宿主正在检查候选', review: '检查完成，等待启用确认', failed: '本次未采用新版，等待选择', ready: '已选择版本，正在衔接页面任务', dispatched: '页面任务已派发', stopped: '本次任务已停止' };
export function MainflowCard({ task, snapshot, disabled, run, openSession }: { task: FlowTask; snapshot: G1Snapshot; disabled: boolean; openSession: (id: string) => Promise<void>; run: (kind: G1Command['kind'], payload: G1Command['payload']) => Promise<void> }) {
	const [preference, setPreference] = useState(task.preference);
	const [brief, setBrief] = useState(task.brief);
	const [scope, setScope] = useState(task.scope);
	const [paths, setPaths] = useState(task.paths);
	const [budget, setBudget] = useState(task.budget);
	const [navigationError, setNavigationError] = useState('');
	const [answers, setAnswers] = useState<string[]>([]);
	const rows = snapshot.attempts.filter(a => a.owner === 'rsi' && a.ownerId === task.id);
	const known = rows.filter(a => a.usageState === 'confirmed');
	const choose = (choice: 'candidate' | 'baseline' | 'stop' | 'reject') => run('flow_choose', { taskId: task.id, choice, digest: choice === 'candidate' ? task.candidate!.snapshot.versionDigest : choice === 'baseline' ? task.baseline.versionDigest : null });
	return <section className="rsi-card" aria-label="偏好驱动 Skill 修改">
		<h3>{labels[task.status]}</h3><strong>{task.name}</strong>
		<small>起始版本 {task.baseline.versionDigest.slice(0, 16)} · 本次任务 {task.id.slice(0, 8)}</small>
		{task.error && <p role="alert">{task.error}</p>}
		{task.status === 'confirming' && <>
			<p>确认后先修改独立 Skill 副本，审阅启用后开始本次页面。原目录保留。</p>
			<label>本次页面需求与必需项目约束<textarea value={brief} maxLength={16000} onChange={e => setBrief(e.target.value)} /></label>
			<small>已有会话用过旧 Skill 时会创建关联新会话；请在上方补齐继续任务必需的约束。</small>
			<label>自然语言偏好<textarea aria-label="自然语言偏好" value={preference} maxLength={4000} onChange={e => setPreference(e.target.value)} placeholder="例如：更紧凑的排版，少用装饰；保留清楚的操作层级。" /></label>
			<label>偏好保存与新版范围<select value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="project">当前项目（保存偏好；启用后作为项目版本）</option><option value="task">仅本次（不改变项目默认版本）</option><option value="personal">个人默认偏好（新版只启用于当前项目）</option></select></label>
			{task.inherited.length > 0 && <details><summary>已保存的适用偏好</summary>{task.inherited.map((p, i) => <p key={i}>{p}</p>)}<small>本次原文优先；存在具体冲突时由模型澄清。</small></details>}
			<fieldset><legend>允许修改的文件</legend>{task.files.map(f => <label key={f.path}><input type="checkbox" checked={paths.includes(f.path)} onChange={e => setPaths(e.target.checked ? [...paths, f.path] : paths.filter(p => p !== f.path))} />{f.path}</label>)}</fieldset>
			<details><summary>完整发送文件与固定检查</summary>{task.files.map(f => <details key={f.path}><summary>{f.path}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{f.content}</pre></details>)}{flowChecks.map(c => <p key={c}>{c}</p>)}</details>
			<p>DeepSeek-V4-Flash / Low · 无工具调用、不自动重试。澄清也计入以下总预算。</p>
			<label>最多请求数（含澄清，1–3）<input type="number" min={1} max={3} value={budget.maxRequests} onChange={e => setBudget({ ...budget, maxRequests: e.target.valueAsNumber })} /></label>
			<label>每次输出 Token 上限（含推理）<input type="number" min={128} max={4096} value={budget.maxOutputTokens} onChange={e => setBudget({ ...budget, maxOutputTokens: e.target.valueAsNumber })} /></label>
			<small>单次完整输入上限 {budget.maxInputBytes} 字节；已确认累计 {budget.tokenStopThreshold} Token 停止追加；总窗口 {budget.maxDurationMs / 60000} 分钟，等待回答不延长。阈值不保证单次调用不会跨过。</small>
			<button disabled={disabled || !preference.trim() || !brief.trim() || !paths.length} onClick={() => void run('flow_authorize', { taskId: task.id, previewDigest: task.previewDigest, brief, preference, scope, paths, budget })}>确认偏好、范围与预算，生成候选</button>
		</>}
		{task.status === 'clarifying' && <><p>仅补充原方向与文件范围内的答案；扩大范围请停止并重新确认。空答案表示跳过，不表示同意。</p>{task.clarifications.at(-1)!.questions.map((q, i) => <label key={`${task.clarifications.length}:${i}`}>{q}<textarea value={answers[i] ?? ''} maxLength={2000} onChange={e => setAnswers(a => { const b = [...a]; b[i] = e.target.value; return b; })} /></label>)}<button disabled={disabled} onClick={() => { void run('flow_answer', { taskId: task.id, answers: task.clarifications.at(-1)!.questions.map((_, i) => answers[i] ?? '') }); setAnswers([]); }}>提交本批答案，沿用剩余预算</button></>}
		{task.candidate && <><p>{task.candidate.reason}</p><small>候选摘要 {task.candidate.snapshot.versionDigest}</small><details open={task.status === 'review'}><summary>完整变更对照</summary>{task.candidate.changes.map(f => <details key={f.path}><summary>{f.path}</summary><strong>修改前</strong><pre style={{ whiteSpace: 'pre-wrap' }}>{task.files.find(b => b.path === f.path)?.content}</pre><strong>修改后</strong><pre style={{ whiteSpace: 'pre-wrap' }}>{f.content}</pre></details>)}</details></>}
		{task.checks.map((c, i) => <p key={i}>{c.status === 'passed' ? '通过' : c.status === 'failed' ? '失败' : '未评测/不适用'} · {c.name}<small>{c.detail}</small></p>)}
		<p>RSI 修改/澄清：{rows.length} / {task.budget.maxRequests} 次请求 · {known.length ? known.reduce((n, a) => n + a.tokens.total!, 0).toLocaleString() : '—'} 已确认 Token · {rows.length - known.length} 次待结算</p>
		<small>语法与完整性检查不证明页面效果提升；正式页面编写另计入日常会话。</small>
		{task.status === 'review' && <div className="rsi-actions"><button disabled={disabled} onClick={() => void choose('candidate')}>确认启用此候选并开始页面</button><button disabled={disabled} onClick={() => void choose('reject')}>拒绝新版</button></div>}
		{['confirming', 'failed', 'review', 'clarifying'].includes(task.status) && <button disabled={disabled} onClick={() => void choose('baseline')}>{task.status === 'confirming' ? '本次不修改 Skill，用旧版继续' : '用旧版继续'}</button>}
		{!['dispatched', 'stopped'].includes(task.status) && <button disabled={disabled} onClick={() => void choose('stop')}>停止本次任务</button>}
		{((task.status === 'ready' && task.error) || (task.status === 'failed' && task.chosenDigest && task.delivery !== 'admitted')) && <button disabled={disabled} onClick={() => void run('flow_resume', { taskId: task.id })}>恢复页面启动</button>}
		{navigationError && <p role="alert">{navigationError}</p>}
		{task.executionSessionId && task.executionSessionId !== task.sessionId && <button onClick={() => void openSession(task.executionSessionId!).catch(e => setNavigationError(String(e)))}>打开关联页面会话</button>}
		{task.executionSessionId && <p>页面执行会话：<code>{task.executionSessionId}</code><small>{task.executionSessionId !== task.sessionId ? '已建立关联新会话，原会话及旧绑定保留。可在 Harness 会话列表打开。' : '使用当前会话。'}</small></p>}
	</section>;
}
