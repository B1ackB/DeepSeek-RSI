import { useEffect, useState } from 'react';
import type { G1Snapshot } from '../g1-contracts.ts';
import type { createPanelModel } from './model.ts';
import { policySessionId, type PolicySource } from '../policy-review-contracts.ts';

type Model = ReturnType<typeof createPanelModel>;
function PolicySources({ snapshot, workspaceId, disabled, command, policySource, openSession }: { snapshot: G1Snapshot; workspaceId: string; disabled: boolean; command: Model['command']; policySource: Model['policySource']; openSession: (id: string) => Promise<void> }) {
	const [paths, setPaths] = useState(''); const [selected, setSelected] = useState('');
	const [source, setSource] = useState<PolicySource | null>(null); const [confirm, setConfirm] = useState(false);
	const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
	const rows = snapshot.policy.sources.filter(row => row.workspaceId === workspaceId);
	const meta = rows.find(row => row.id === selected) ?? rows.at(-1);
	const active = snapshot.policy.choices.findLast(row => row.workspaceId === workspaceId);
	useEffect(() => {
		const controller = new AbortController(); setSource(null); setConfirm(false);
		if (meta) void policySource(workspaceId, meta.id, controller.signal).then(row => { if (!controller.signal.aborted) setSource(row); }, error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '无法读取快照预览'); });
		return () => controller.abort();
	}, [workspaceId, meta?.id, meta?.status, policySource]);
	async function run(kind: 'policy_preview' | 'policy_seal' | 'policy_source_session') {
		if (!active) return;
		setBusy(true); setError('');
		try {
			const focus = kind === 'policy_preview'
				? await command(kind, { workspaceId, expectedActive: active.id, paths: paths.split(/\r?\n/).filter(path => path.length > 0) })
				: await command(kind, { workspaceId, expectedActive: source!.choiceId, sourceId: source!.id, snapshotDigest: source!.conditions.sourceSnapshot!.digest });
			setConfirm(false);
			if (kind === 'policy_preview' && focus) setSelected(focus);
			if (kind === 'policy_source_session' && focus) await openSession(policySessionId(focus));
		} catch (error) { const message = error instanceof Error ? error.message : '操作失败；可从记录打开已创建的会话'; setError(message.startsWith('invalid_input:') ? '请检查文件选择：需要 1–32 个不重复的精确相对路径，不能包含敏感文件、目录、通配符或上级路径。' : message); }
		finally { setBusy(false); }
	}
	const blocked = disabled || busy || !active;
	const exact = source && source.id === meta?.id && source.choiceId === active?.id;
	return <section aria-label="仓库文件与快照">
		<h4>选择真实仓库文件</h4>
		<p>当前受管工作区内的精确相对路径，每行一个。最多 32 个文件、每个 256 KiB、总计 1 MiB。敏感文件或不支持的路径会使整次选择失败。</p>
		<label>仓库文件路径<textarea value={paths} rows={4} disabled={blocked} onChange={event => { setPaths(event.target.value); setConfirm(false); }} placeholder={'src/example.ts\nREADME.md'} /></label>
		<button disabled={blocked || !paths} onClick={() => void run('policy_preview')}>预览所选文件</button>
		{!active && <small>先审阅评测并明确采纳一个策略版本。</small>}
		{error && <p role="alert">{error}</p>}
		{rows.length > 0 && <label>仓库快照记录<select value={meta?.id ?? ''} disabled={busy} onChange={event => setSelected(event.target.value)}>{rows.map((row, index) => <option key={row.id} value={row.id}>快照 {index + 1} · {row.status === 'sealed' ? '已封存' : '待确认'}</option>)}</select></label>}
		{source && source.id === meta?.id && <>
			<p>快照 {rows.findIndex(row => row.id === source.id) + 1} · {source.status === 'sealed' ? '已明确封存' : '预览，尚未封存'} · {source.conditions.files.length} 个文件 · {meta.files.reduce((sum, file) => sum + file.bytes, 0)} 字节</p>
			<small>来源工作区：{source.workspacePath} · 策略：第 {snapshot.policy.choices.filter(row => row.workspaceId === workspaceId).findIndex(row => row.id === source.choiceId) + 1} 次选择</small>
			<small>固定响应；此会话最多 {source.conditions.budget.maxRequests} 次请求、每次输出 {source.conditions.budget.maxOutputTokens} Token，停止阈值 {source.conditions.budget.tokenStopThreshold} Token；最多 {source.conditions.budget.maxToolCalls} 次工具、单次结果 {source.conditions.budget.maxToolResultBytes} 字节、输入 {source.conditions.budget.maxInputBytes} 字节、{source.conditions.budget.maxDurationMs / 1000} 秒。未知用量会阻止继续。</small>
			{source.conditions.files.map(file => <label key={file.path}>{file.path}<textarea aria-label={`快照文件 ${file.path}`} rows={5} readOnly value={file.content} /></label>)}
			{!exact && <p>当前采纳版本已改变，请重新预览。</p>}
			{source.status === 'preview' ? <button disabled={blocked || !exact} onClick={() => setConfirm(true)}>封存此预览</button> : <button disabled={blocked || !exact} onClick={() => void run('policy_source_session')}>使用此快照创建只读会话</button>}
			{confirm && source.status === 'preview' && <div role="group" aria-label="确认封存快照"><p>仅封存上方已展示的文件与文本。宿主将复采核对；源码或策略变化后需重新预览。封存和创建会话均不会发送模型请求。</p><button disabled={blocked || !exact} onClick={() => void run('policy_seal')}>确认封存快照</button><button disabled={busy} onClick={() => setConfirm(false)}>取消封存</button></div>}
		</>}
	</section>;
}
export function PolicyReview({ snapshot, workspaceId, sessionId, disabled, command, policySource, openSession }: { snapshot: G1Snapshot; workspaceId: string | null; sessionId: string | null; disabled: boolean; command: Model['command']; policySource: Model['policySource']; openSession: (id: string) => Promise<void> }) {
	const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
	const [confirmation, setConfirmation] = useState<{ label: string; kind: 'policy_adopt' | 'policy_restore'; payload: Parameters<Model['command']>[1] } | null>(null);
	const choices = snapshot.policy.choices.filter(row => row.workspaceId === workspaceId); const active = choices.at(-1);
	const sessions = snapshot.policy.sessions.filter(row => row.workspaceId === workspaceId);
	const current = sessions.find(row => row.sessionId === sessionId);
	async function run(kind: Parameters<Model['command']>[0], payload: Parameters<Model['command']>[1]) {
		setBusy(true); setError('');
		try { const focus = await command(kind, payload as never); setConfirmation(null); if (focus && (kind === 'policy_session' || kind === 'policy_source_session' || kind === 'policy_open')) await openSession(policySessionId(focus)); }
		catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
		finally { setBusy(false); }
	}
	const blocked = disabled || busy || !workspaceId;
	return <section className="rsi-card" aria-label="仓库证据策略">
		<h3>仓库证据策略 · 固定响应试点</h3>
		<p>审阅完整任务后明确选择版本。仅用于独立的仓库只读会话，保留现有会话版本。</p>
		<small>可使用明确封存的仓库快照，或评测中的冻结示例。仅使用固定响应，不调用付费模型。</small>
		{error && <p role="alert">{error}</p>}
		<p>{active ? `新只读会话默认：第 ${choices.indexOf(active) + 1} 次选择${active.kind === 'restore' ? '（恢复旧版）' : ''}` : '尚未明确采纳版本'}</p>
		<p>{current ? `当前只读会话：会话 ${sessions.indexOf(current) + 1} · 第 ${choices.findIndex(row => row.id === current.choiceId) + 1} 次选择` : '当前会话：普通会话'}</p>
		{current && <p>当前源码：{current.sourceId ? `仓库快照 ${snapshot.policy.sources.filter(row => row.workspaceId === workspaceId).findIndex(row => row.id === current.sourceId) + 1}` : '评测冻结示例'}</p>}
		{workspaceId && <PolicySources snapshot={snapshot} workspaceId={workspaceId} disabled={blocked} command={command} policySource={policySource} openSession={openSession} />}
		{snapshot.policy.reviews.length === 0 && <p>尚无可审阅的成对评测。</p>}
		{snapshot.policy.reviews.map((review, index) => <details key={review.batchId}>
			<summary>评测 {index + 1} · {{ passed: '固定检查通过', failed: '质量检查未通过', incomplete: '执行不完整', unevaluated: '尚未评测' }[review.status]}</summary>
			<p>{review.question}</p><small>{review.limits}</small><small>冻结源码：{review.paths.join('、')}</small>
			{review.rationale && <p>修改理由：{review.rationale}</p>}
			<p>固定响应只验证流程，不证明模型能力提升。质量结果由你判断；用量、权限或清理不完整时不能采纳。</p>
			{review.error && <p role="alert">无法采纳：{review.error}</p>}
			{review.sides.map(side => <section key={side.side} aria-label={side.side === 'baseline' ? '基线策略与完整任务' : '候选策略与完整任务'}>
				<strong>{side.side === 'baseline' ? '基线' : '候选'}</strong>
				<label>策略全文<textarea readOnly value={side.instructions} rows={5} /></label>
				<small>{side.requests} 次模型请求 · {side.tools} 次工具调用 · {side.totalTokens ?? '未知'} Token</small>
				<small>完整执行：{side.infrastructure ? '已核验' : '未完成核验'} · 事实：{side.facts ? '通过' : '未通过'} · 引用：{side.citations ? '通过' : '未通过'}</small>
				<details><summary>实际读取的源码证据</summary>{side.sources.map((source, index) => <pre key={index} style={{ whiteSpace: 'pre-wrap' }}>{source}</pre>)}</details>
				<details><summary>任务结果与引用</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{side.response || '尚无完整结果'}</pre></details>
			</section>)}
			<div className="rsi-actions">{(['baseline', 'candidate'] as const).map(choice => <button key={choice} disabled={blocked || !review.eligible || !review.evidenceDigest} onClick={() => setConfirmation({ label: choice === 'baseline' ? '采纳基线' : '采纳候选', kind: 'policy_adopt', payload: { workspaceId: workspaceId!, policyId: review.policyId, batchId: review.batchId, baselineDigest: review.baselineDigest, candidateDigest: review.candidateDigest, evidenceDigest: review.evidenceDigest!, choice, expectedActive: active?.id ?? null } })}>{choice === 'baseline' ? '选择基线' : '选择候选'}</button>)}</div>
		</details>)}
		{active && <button disabled={blocked} onClick={() => void run('policy_session', { workspaceId: workspaceId!, expectedActive: active.id })}>创建固定响应只读会话</button>}
		{choices.filter(row => row.kind === 'adopt' && row.digest !== active?.digest).map(row => <button key={row.id} disabled={blocked} onClick={() => setConfirmation({ label: `恢复第 ${choices.indexOf(row) + 1} 次采纳版本`, kind: 'policy_restore', payload: { workspaceId: workspaceId!, targetChoiceId: row.id, expectedActive: active!.id } })}>恢复第 {choices.indexOf(row) + 1} 次采纳版本</button>)}
		{confirmation && <div role="group" aria-label="确认版本选择"><p>{confirmation.label}，仅影响之后新建的只读会话；旧会话保持原版本。</p><div className="rsi-actions"><button disabled={blocked} onClick={() => void run(confirmation.kind, confirmation.payload)}>确认{confirmation.label}</button><button disabled={busy} onClick={() => setConfirmation(null)}>取消选择</button></div></div>}
		{sessions.length > 0 && <details><summary>已固定版本的只读会话</summary>{sessions.map((row, index) => <button key={row.sessionId} disabled={blocked} onClick={() => void run('policy_open', { workspaceId: workspaceId!, sessionId: row.sessionId })}>打开或恢复只读会话 {index + 1} · 第 {choices.findIndex(choice => choice.id === row.choiceId) + 1} 次选择</button>)}</details>}
	</section>;
}
