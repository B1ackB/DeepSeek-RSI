import { useState } from 'react';
import type { G1Snapshot } from '../g1-contracts.ts';
import type { PolicySource } from '../policy-review-contracts.ts';
import type { createPanelModel } from './model.ts';
import { policyQaLabels } from './policy-qa.tsx';
import { policySourceCaseSchema, type PolicySourceCase } from '../policy-inputs.ts';

type Command = ReturnType<typeof createPanelModel>['command'];
export function PolicyAuthoring({ snapshot, source, disabled, command }: { snapshot: G1Snapshot; source: PolicySource; disabled: boolean; command: Command }) {
	const [requirements, setRequirements] = useState(''); const [output, setOutput] = useState(1024); const [input, setInput] = useState(16384); const [seconds, setSeconds] = useState(5);
	const [requests, setRequests] = useState(6); const [tokens, setTokens] = useState(1000); const [duration, setDuration] = useState(30);
	const [packId, setPackId] = useState('');
	const [caseId, setCaseId] = useState<PolicySourceCase | ''>('');
	const [confirmation, setConfirmation] = useState<{ kind: 'policy_generate' | 'policy_evaluate'; payload: Parameters<Command>[1]; label: string } | null>(null);
	const [busy, setBusy] = useState(false); const [error, setError] = useState('');
	const active = snapshot.policy.choices.findLast(row => row.workspaceId === source.workspaceId);
	const generations = snapshot.policy.generations.filter(row => row.workspaceId === source.workspaceId);
	const running = generations.some(row => ['authorized', 'running'].includes(row.status)) || snapshot.policy.reviews.some(row => row.workspaceId === source.workspaceId && ['authorized', 'running'].includes(row.executionStatus ?? ''));
	const blocked = disabled || busy || running || source.status !== 'sealed' || active?.id !== source.choiceId;
	const intent = { workspaceId: source.workspaceId, expectedActive: source.choiceId, sourceId: source.id, snapshotDigest: source.conditions.sourceSnapshot!.digest };
	const review = snapshot.policy.reviews.find(row => row.batchId === active?.batchId);
	const qaAvailable = snapshot.policy.sources.find(row => row.id === source.id)?.qaAvailable === true;
	const cases = policyQaLabels;
	const packs = snapshot.policy.qaPacks.filter(row => row.sourceId === source.id && row.workspaceId === source.workspaceId);
	const pack = packs.find(row => row.id === packId && row.status === 'sealed');
	const validQuestion = packId ? !!pack && !!caseId : !caseId || qaAvailable;
	const baseline = review?.sides.find(row => (row.side === 'baseline' ? review.baselineDigest : review.candidateDigest) === active?.digest)?.instructions;
	async function run(kind: Parameters<Command>[0], payload: Parameters<Command>[1]) {
		setBusy(true); setError('');
		try { await command(kind, payload as never); setConfirmation(null); }
		catch (caught) { const message = caught instanceof Error ? caught.message : '操作失败；保留已确认的记录与用量'; setError(message.startsWith('invalid_input:') ? '请检查修改要求和预算范围；本轮仅允许固定响应路线。' : message.replace(/^[a-z_]+:\s*/, '')); }
		finally { setBusy(false); }
	}
	const names = { authorized: '已授权，等待执行', running: '执行中', sealed: '候选已封存', failed: '失败', cancelled: '已停止', interrupted: '已中断' };
	return <section aria-label="策略生成与独立评测">
		<h4>生成策略候选</h4>
		<p>只修改策略文字。当前源码快照用于绑定和独立评测；源码正文、保留评测答案与旧会话不会发送给生成器。生成后需要另行确认评测。</p>
		<label>当前基线策略全文<textarea readOnly rows={3} value={baseline ?? ''} /></label>
		<fieldset disabled={blocked} onChange={() => setConfirmation(null)}>
			<label>本轮策略修改要求<textarea value={requirements} maxLength={4000} onChange={event => setRequirements(event.target.value)} /></label>
			<small>生成路线：固定响应（离线），仅 1 次请求。</small>
			<label>生成输出上限<input type="number" min={128} max={4096} value={output} onChange={event => setOutput(Number(event.target.value))} /></label>
			<label>生成输入字节上限<input type="number" min={1024} max={32768} value={input} onChange={event => setInput(Number(event.target.value))} /></label>
			<label>生成时限（秒）<input type="number" min={0.1} max={30} step={0.1} value={seconds} onChange={event => setSeconds(Number(event.target.value))} /></label>
			<button disabled={!requirements.trim()} onClick={() => setConfirmation({ kind: 'policy_generate', label: '授权生成候选', payload: { ...intent, baselineDigest: active!.digest, requirements, budget: { provider: 'rsi-policy-generation-fixture', model: 'offline-v1', maxRequests: 1, maxOutputTokens: output, maxInputBytes: input, maxDurationMs: Math.round(seconds * 1000) } } })}>准备生成授权</button>
		</fieldset>
		<h4>独立评测预算</h4>
		<p>两侧使用上方同一快照、相同问题、工具和单侧限制。人工包或预置包覆盖符号定位、调用链和错误路径；评测绑定所选封存包与精确快照。</p>
		{!qaAvailable && !pack && <small>当前快照不匹配预置问答包；可先配置并封存人工问答包，或使用首行传输检查。</small>}
		<fieldset disabled={blocked} onChange={() => setConfirmation(null)}>
			<label>评测问答包<select value={packId} onChange={event => { setPackId(event.target.value); if (event.target.value && !caseId) setCaseId('symbol'); }}><option value="">预置包或首行检查</option>{packs.map((row, index) => <option key={row.id} value={row.id} disabled={row.status !== 'sealed'}>人工包 {index + 1} · {row.status === 'sealed' ? '已封存' : '草稿，不可评测'}</option>)}</select></label>
			<label>固定评测问题<select value={caseId} onChange={event => setCaseId(event.target.value ? policySourceCaseSchema.parse(event.target.value) : '')}><option value="" disabled={!!packId}>首行传输检查</option>{policySourceCaseSchema.options.map(id => <option key={id} value={id} disabled={packId ? !pack : !qaAvailable}>{cases[id]}</option>)}</select></label>
			{caseId ? <small>本次只运行“{cases[caseId]}”一题。两侧均需搜索并读取相关文件；完整比较的请求数取决于引用文件数（两侧各需搜索、逐文件读取和回答），请明确设置整批上限。</small> : <small>首行检查只验证传输和引用，不证明仓库问答质量。</small>}
			<label>评测整批请求上限<input type="number" min={1} max={16} value={requests} onChange={event => setRequests(Number(event.target.value))} /></label>
			<label>评测整批 Token 停止阈值<input type="number" min={1} max={200000} value={tokens} onChange={event => setTokens(Number(event.target.value))} /></label>
			<label>评测整批时限（秒）<input type="number" min={0.1} max={60} step={0.1} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
		</fieldset>
		{error && <p role="alert">{error}</p>}
		{generations.map((row, index) => <details key={row.id} open><summary>候选生成 {index + 1} · {names[row.status]}</summary>
			<p>{row.requirements}</p><small>{row.requests} 次生成请求 · {row.totalTokens ?? '未知'} Token · 生成预算与评测预算分别授权</small>
			{row.error && <p role="alert">{row.error}</p>}
			{row.instructions && <label>本轮候选策略全文<textarea readOnly rows={4} value={row.instructions} /></label>}{row.rationale && <p>{row.rationale}</p>}
			{['authorized', 'running'].includes(row.status) && <button disabled={disabled || busy} onClick={() => void run('policy_stop', { workspaceId: source.workspaceId, target: 'generation', jobId: row.id })}>停止本轮生成</button>}
			{row.status === 'sealed' && <button disabled={blocked || row.sourceId !== source.id || row.baselineDigest !== active?.digest || !validQuestion} onClick={() => setConfirmation({ kind: 'policy_evaluate', label: '授权独立评测', payload: { ...intent, generationId: row.id, baselineDigest: row.baselineDigest, candidateDigest: row.candidateDigest!, ...caseId ? { caseId } : {}, ...pack ? { packId: pack.id, packDigest: pack.digest } : {}, budget: { maxRequests: requests, tokenStopThreshold: tokens, maxDurationMs: Math.round(duration * 1000) } } })}>准备此候选的独立评测</button>}
		</details>)}
		{confirmation && <div role="group" aria-label={confirmation.label}>
			<p>{confirmation.label}：仅针对当前展示的基线、候选与已封存源码。不会自动采纳。</p>
			{confirmation.kind === 'policy_generate' ? <p>要求：{requirements} · 1 次请求 · 输出 {output} Token · 输入 {input} 字节 · {seconds} 秒。</p> : <p>{pack ? `人工包 ${packs.indexOf(pack) + 1} · ` : ''}{caseId ? cases[caseId] : '首行传输检查'} · 两侧独立完整任务 · 整批 {requests} 次请求 · {tokens} Token 停止阈值 · {duration} 秒。</p>}
			<button disabled={blocked} onClick={() => void run(confirmation.kind, confirmation.payload)}>确认{confirmation.label}</button><button disabled={busy} onClick={() => setConfirmation(null)}>取消本次授权</button>
		</div>}
	</section>;
}
