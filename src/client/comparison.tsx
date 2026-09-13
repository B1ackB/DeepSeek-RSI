import { useEffect, useRef, useState } from 'react';
import type { G1Command, G1Snapshot } from '../g1-contracts.ts';
import type { FlowTask } from '../mainflow-contracts.ts';
import { comparisonBudget, previewPath } from '../comparison-contracts.ts';
import { requestMetrics } from '../comparison-metrics.ts';

type Run = (kind: G1Command['kind'], payload: G1Command['payload']) => Promise<void>;
const seconds = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(2)} 秒`;
function Bars({ title, values, format }: { title: string; values: (number | null)[]; format: (n: number | null) => string }) {
	const max = Math.max(1, ...values.map(v => v ?? 0));
	return <div className="rsi-metric"><strong>{title}</strong>{values.map((value, i) => <div key={i} className="rsi-bar-row"><span>{i ? '新版' : '旧版'}</span><div className="rsi-bar-track" aria-hidden="true">{value !== null && <div className={`rsi-bar rsi-bar-${i}`} style={{ width: `${100 * value / max}%` }} />}</div><span>{format(value)}</span></div>)}</div>;
}
function Preview({ title, src }: { title: string; src: string }) {
	const container = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(150);
	useEffect(() => {
		const observer = new ResizeObserver(entries => { const entry = entries[0]; if (entry) setWidth(entry.contentRect.width); });
		if (container.current) observer.observe(container.current);
		return () => observer.disconnect();
	}, []);
	return <div className="rsi-preview" ref={container}><iframe title={title} src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width: 390, height: 520, border: 0, transform: `scale(${width / 390})`, transformOrigin: 'top left' }} /></div>;
}
export function ComparisonCard({ task, snapshot, disabled, run, historical = false }: { task: FlowTask; snapshot: G1Snapshot; disabled: boolean; run: Run; historical?: boolean }) {
	const [budget, setBudget] = useState(comparisonBudget);
	const comparison = task.comparison;
	if (!comparison) return !historical && task.status === 'review' && task.candidate ? <section className="rsi-compare" aria-label="生成新旧对照">
		<h3>先看新旧产物，再决定是否采用</h3><p>{task.scenario.label} · 同一需求和偏好，旧版与新版各生成一次。</p>
		<small>{task.scenario.kind === 'html' ? '自包含单页预览；检查 CSS / JavaScript 编译，不检查交互或审美。' : '文本产物预览；不执行外部工具，内容由你判断。'}</small>
		<details><summary>对照输入与独立预算</summary><p>DeepSeek-V4-Flash / Low · 最多 2 次请求，无工具，不自动重试。</p><p>任务需求：{task.brief}</p><p>偏好：{task.preference}</p>{task.inherited.map((p, i) => <p key={i}>{p}</p>)}<small>完整使用本卡展示的旧版文件和候选文件。仅替换 Skill；同一场景指令、需求、澄清与模型设置。</small>
			<label>每个版本的输出 Token 上限<input type="number" min={128} max={16384} value={budget.maxOutputTokens} onChange={e => setBudget({ ...budget, maxOutputTokens: e.target.valueAsNumber })} /></label>
			<label>对照累计 Token 停止阈值<input type="number" min={1} max={100000} value={budget.tokenStopThreshold} onChange={e => setBudget({ ...budget, tokenStopThreshold: e.target.valueAsNumber })} /></label>
			<small>完整输入每次最多 {budget.maxInputBytes} 字节；总窗口 {budget.maxDurationMs / 60000} 分钟。另计于 Skill 修改费用，阈值不能保证在途请求不跨过。</small>
		</details>
		<button disabled={disabled} onClick={() => void run('flow_compare', { taskId: task.id, candidateDigest: task.candidate!.snapshot.versionDigest, budget })}>确认对照预算，生成旧版与新版</button>
	</section> : null;
	const metrics = comparison.runs.map(r => requestMetrics(snapshot.attempts, comparison.id, r.sessionId));
	return <section className="rsi-compare" aria-label="新旧产物对照">
		<h3>新旧产物对照</h3><small>{comparison.scenario.label} · {comparison.status === 'running' ? '正在生成对照' : comparison.status === 'completed' ? '对照已就绪，由你决定' : comparison.status === 'cancelled' ? '对照已取消，保留已有结果' : '部分结果未完成，请查看原因'}</small>
		<div className="rsi-result-grid">{comparison.runs.map((result, i) => <div className="rsi-result" key={result.side}>
			<strong>{i ? '新版' : '旧版'}</strong>
			<span>{result.status === 'passed' ? result.artifact?.kind === 'html' ? '编译通过' : '格式通过' : result.status === 'running' ? '生成中…' : result.status === 'pending' ? '等待生成' : '未完成'}</span>
			{result.artifact && <><Preview title={i ? '新版产物预览' : '旧版产物预览'} src={previewPath(task.id, result.side)} /><a href={previewPath(task.id, result.side)} target="_blank" rel="noopener noreferrer">打开{i ? '新版' : '旧版'}{result.artifact.kind === 'html' ? '网站' : '文本'}</a><small>{result.artifact.detail}</small></>}
			{result.error && <p role="alert">{result.error}</p>}
			<small>{metrics[i]!.requests} 次请求 · {metrics[i]!.pending} 次用量待结算{metrics[i]!.pending > 0 && metrics[i]!.knownTokens > 0 ? ` · 已确认 ${metrics[i]!.knownTokens} Token` : ''}</small>
		</div>)}</div>
		<Bars title="产物生成 Token" values={metrics.map(m => m.totalTokens)} format={n => n === null ? '—' : n.toLocaleString()} />
		<Bars title="生成与编译耗时" values={comparison.runs.map(r => r.durationMs)} format={seconds} />
		<small>耗时包含该版本请求和编译，不含等待你的时间。— 表示未知或尚未完成；不计为零。数值差异不代表质量排名。</small>
		{comparison.status === 'running' && !historical && <button disabled={disabled} onClick={() => void run('flow_cancel_comparison', { taskId: task.id })}>取消对照</button>}
	</section>;
}

export function RevisionForm({ task, disabled, run }: { task: FlowTask; disabled: boolean; run: Run }) {
	const [feedback, setFeedback] = useState('');
	const [reference, setReference] = useState<'candidate' | 'baseline'>(task.candidate ? 'candidate' : 'baseline');
	return <section className="rsi-compare" aria-label="继续迭代"><h3>还想调整什么？</h3>
		<label>参考版本<select value={reference} onChange={e => setReference(e.target.value as typeof reference)}><option value="baseline">旧版</option>{task.candidate && <option value="candidate">本轮候选</option>}</select></label>
		<label>下一轮要求<textarea value={feedback} maxLength={4000} onChange={e => setFeedback(e.target.value)} placeholder="例如：保留这一版的信息结构，再缩短说明……" /></label>
		<button disabled={disabled || !feedback.trim()} onClick={() => void run('flow_revise', { taskId: task.id, feedback, reference })}>带入要求，准备下一轮</button>
		<small>保留本轮产物与费用，下一轮先核对范围和预算；此按钮不调用模型。</small>
	</section>;
}
