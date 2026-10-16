import { useEffect, useState } from 'react';
import type { G1Snapshot } from '../g1-contracts.ts';
import type { PolicySource, PolicyQaPack } from '../policy-review-contracts.ts';
import type { PolicyQaContent } from '../policy-qa-inputs.ts';
import { policySourceCaseSchema, type PolicySourceCase } from '../policy-inputs.ts';
import type { createPanelModel } from './model.ts';

type Model = ReturnType<typeof createPanelModel>;
type Questions = PolicyQaContent['questions'];
export const policyQaLabels = { symbol: '符号定位', 'call-chain': '调用链', 'error-path': '错误路径' };
function emptyQuestions(source: PolicySource): Questions {
	return Object.fromEntries(policySourceCaseSchema.options.map(id => [id, { question: '', answer: { status: 'sufficient', claims: [{ fact: '', value: '', citations: [{ path: source.conditions.files[0].path, startLine: 1, endLine: 1 }] }] } }])) as Questions;
}
export function PolicyQaEditor({ snapshot, source, disabled, command, policyQa }: { snapshot: G1Snapshot; source: PolicySource; disabled: boolean; command: Model['command']; policyQa: Model['policyQa'] }) {
	const [selected, setSelected] = useState(''); const [pack, setPack] = useState<PolicyQaPack | null>(null);
	const [questions, setQuestions] = useState(() => emptyQuestions(source)); const [caseId, setCaseId] = useState<PolicySourceCase>('symbol');
	const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false);
	const rows = snapshot.policy.qaPacks.filter(row => row.workspaceId === source.workspaceId && row.sourceId === source.id);
	const meta = rows.find(row => row.id === selected);
	const active = snapshot.policy.choices.findLast(row => row.workspaceId === source.workspaceId);
	const intent = { workspaceId: source.workspaceId, expectedActive: source.choiceId, sourceId: source.id, snapshotDigest: source.conditions.sourceSnapshot!.digest };
	useEffect(() => {
		const controller = new AbortController(); setPack(null); setConfirm(false); setError('');
		if (!selected) setQuestions(emptyQuestions(source));
		else void policyQa(source.workspaceId, selected, controller.signal).then(row => { if (!controller.signal.aborted) { setPack(row); setQuestions(row.content.questions); } }, error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '无法读取问答包'); });
		return () => controller.abort();
	}, [source.id, selected, meta?.status, policyQa]);
	const blocked = disabled || busy || source.status !== 'sealed' || active?.id !== source.choiceId || (!!selected && (pack?.id !== selected || pack?.status !== meta?.status));
	const dirty = !pack || JSON.stringify(pack.content.questions) !== JSON.stringify(questions);
	function edit(change: (value: Questions) => void) { setConfirm(false); setQuestions(previous => { const next = structuredClone(previous); change(next); return next; }); }
	async function save(seal: boolean) {
		setBusy(true); setError('');
		try {
			const focus = seal ? await command('policy_qa_seal', { ...intent, packId: pack!.id, packDigest: pack!.digest }) : await command('policy_qa_draft', { ...intent, questions, parentId: pack?.id ?? null });
			setConfirm(false); if (focus) setSelected(focus);
		} catch (error) { const message = error instanceof Error ? error.message : '操作失败；原问答包保留'; setError(message.startsWith('invalid_input:') ? '请完成三类题目、唯一事实键、标准答案和有效引用。每题最多引用三个封存文件。' : message.replace(/^[a-z_]+:\s*/, '')); }
		finally { setBusy(false); }
	}
	const item = questions[caseId];
	return <section className="rsi-policy-qa" aria-label="人工固定问答包">
		<h4>人工配置固定问答包</h4>
		<p>为上方封存快照填写三类题目与标准答案。每次保存追加草稿，审阅后明确封存。答案仅供宿主判定；请人工核实正确性。保存和封存均不调用模型，也不授权生成或评测。</p>
		<label>人工问答包记录<select value={selected} disabled={disabled || busy} onChange={event => setSelected(event.target.value)}><option value="">新建问答包</option>{rows.map((row, index) => <option key={row.id} value={row.id}>人工包 {index + 1} · {row.status === 'sealed' ? '已封存' : '草稿'}{row.parentId ? ' · 修订' : ''}</option>)}</select></label>
		<fieldset disabled={blocked}>
			<label>配置题型<select value={caseId} onChange={event => setCaseId(policySourceCaseSchema.parse(event.target.value))}>{policySourceCaseSchema.options.map(id => <option key={id} value={id}>{policyQaLabels[id]}</option>)}</select></label>
			<label>题目<textarea aria-label="题目" rows={3} value={item.question} maxLength={4000} onChange={event => edit(next => { next[caseId].question = event.target.value; })} /></label>
			<small>事实键用于标识回答项；标准答案逐项精确匹配。引用必须覆盖现有封存文件的实际行。</small>
			{item.answer.claims.map((claim, index) => <fieldset key={index} aria-label={`事实 ${index + 1}`}>
				<label>事实键<input value={claim.fact} maxLength={128} onChange={event => edit(next => { next[caseId].answer.claims[index].fact = event.target.value; })} /></label>
				<label>标准答案<textarea aria-label="标准答案" rows={2} value={claim.value} maxLength={2000} onChange={event => edit(next => { next[caseId].answer.claims[index].value = event.target.value; })} /></label>
				{claim.citations.map((ref, refIndex) => <div key={refIndex} role="group" aria-label={`引用 ${refIndex + 1}`}>
					<label>引用文件<select value={ref.path} onChange={event => edit(next => { next[caseId].answer.claims[index].citations[refIndex].path = event.target.value; })}>{source.conditions.files.map(file => <option key={file.path}>{file.path}</option>)}</select></label>
					<label>起始行<input type="number" min={1} value={ref.startLine} onChange={event => edit(next => { next[caseId].answer.claims[index].citations[refIndex].startLine = Number(event.target.value); })} /></label>
					<label>结束行<input type="number" min={1} value={ref.endLine} onChange={event => edit(next => { next[caseId].answer.claims[index].citations[refIndex].endLine = Number(event.target.value); })} /></label>
					<button disabled={claim.citations.length === 1} onClick={() => edit(next => { next[caseId].answer.claims[index].citations.splice(refIndex, 1); })}>删除引用</button>
				</div>)}
				<button disabled={claim.citations.length >= 8} onClick={() => edit(next => { next[caseId].answer.claims[index].citations.push({ path: source.conditions.files[0].path, startLine: 1, endLine: 1 }); })}>添加引用</button>
				<button disabled={item.answer.claims.length === 1} onClick={() => edit(next => { next[caseId].answer.claims.splice(index, 1); })}>删除事实</button>
			</fieldset>)}
			<button disabled={item.answer.claims.length >= 8} onClick={() => edit(next => { next[caseId].answer.claims.push({ fact: '', value: '', citations: [{ path: source.conditions.files[0].path, startLine: 1, endLine: 1 }] }); })}>添加事实</button>
			<button disabled={!dirty} onClick={() => void save(false)}>{pack ? '保存为修订草稿' : '保存问答草稿'}</button>
		</fieldset>
		{error && <p role="alert">{error}</p>}
		{pack && <details open aria-label="审阅固定问答包"><summary>审阅人工包 {rows.findIndex(row => row.id === pack.id) + 1} · {pack.status === 'sealed' ? '已封存' : '草稿'}</summary>
			<p>绑定上方快照：{source.conditions.files.map(file => file.path).join('、')}。以下为已保存内容；编辑后须另存草稿再审阅。</p>
			{policySourceCaseSchema.options.map(id => <section key={id} aria-label={`审阅${policyQaLabels[id]}`}><strong>{policyQaLabels[id]}</strong><p>{pack.content.questions[id].question}</p>{pack.content.questions[id].answer.claims.map(claim => <div key={claim.fact}><p>{claim.fact}：{claim.value}</p>{claim.citations.map((ref, index) => <div key={index}><small>{ref.path} · 第 {ref.startLine}–{ref.endLine} 行</small><pre style={{ whiteSpace: 'pre-wrap' }}>{source.conditions.files.find(file => file.path === ref.path)?.content.split('\n').slice(ref.startLine - 1, ref.endLine).map((line, index) => `${ref.startLine + index}: ${line}`).join('\n')}</pre></div>)}</div>)}</section>)}
			{pack.status === 'draft' && <button disabled={blocked || dirty} onClick={() => setConfirm(true)}>准备封存问答包</button>}
		</details>}
		{confirm && pack?.status === 'draft' && <div role="group" aria-label="确认封存问答包"><p>确认已审阅三类题目、标准答案和上方封存源码引用。封存后保持不变，修订会创建新草稿；评测仍需另行授权。</p><button disabled={blocked || dirty} onClick={() => void save(true)}>确认封存问答包</button><button disabled={busy} onClick={() => setConfirm(false)}>取消问答包封存</button></div>}
	</section>;
}
