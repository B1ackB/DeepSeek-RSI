import React, { useEffect, useState } from 'react';
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type { createPanelModel } from './model.ts';
import { defaultOptimizationBudget, type Analysis, type G1Snapshot } from '../g1-contracts.ts';
import { MainflowCard } from './mainflow.tsx';
import { FrontendPreparation } from './frontend.tsx';

type Model = ReturnType<typeof createPanelModel>;
export type PanelInjected = { hooks: { rsi: Model['source'] }; command: Model['command']; catalog: Model['catalog']; openSession: (id: string) => Promise<void> };
type PanelProps = PropsRuntime<'shell.panel'> & InjectFace<PanelInjected>;
const objectives = { accuracy: '定位准确率', tokens: '完整执行 Token', brevity: '简洁表达', speed: '完成速度', maintainability: '可维护性', design: '设计偏好适配' };
const rules = { script_failure: '执行失败线索', retry_cluster: '重试集中出现', repeated_read: '重复读取', large_output: '工具输出较长', user_preference: '表达或成本偏好' };
const efforts = { low: 'Low', high: 'High' };
const statuses = { prepared: '等待确认分析', running: '分析中', succeeded: '分析已完成', failed: '分析失败', cancelled: '已取消', interrupted: '宿主中断' };

function analysisPreview(input: string) {
	try { return JSON.stringify(JSON.parse(input), (key, value) => ['version', 'versionDigest'].includes(key) ? '当前版本' : ['sessionId', 'seq', 'preferenceId', 'preferenceRevision'].includes(key) ? undefined : value, '\t'); }
	catch { return input; }
}

function Usage({ snapshot, sessionId, analysisId }: { snapshot: G1Snapshot; sessionId: string | null; analysisId: string | null }) {
	return <div className="rsi-usage-grid">{(['session', 'rsi'] as const).map(owner => {
		const rows = snapshot.attempts.filter(a => a.owner === owner && (owner === 'session' ? a.sessionId === sessionId : a.ownerId === analysisId));
		const confirmed = rows.filter(a => a.usageState === 'confirmed' && a.tokens.total !== null);
		const total = confirmed.reduce((sum, a) => sum + a.tokens.total!, 0);
		return <section className="rsi-card" key={owner} data-rsi-owner={owner} data-rsi-total={confirmed.length ? total : undefined}>
			<span>{owner === 'session' ? '当前会话' : '选定 RSI 分析'}</span>
			<strong className="rsi-total">{confirmed.length ? total.toLocaleString() : '—'}</strong>
			<small>{confirmed.length ? '已确认 Token' : owner === 'session' && !sessionId ? '未选择会话' : owner === 'rsi' && !analysisId ? '未选择分析' : '尚无已确认用量'}</small>
			<small>{rows.filter(a => ['reserved', 'in_flight'].includes(a.state)).length} 次在途 · {rows.filter(a => a.usageState !== 'confirmed' && a.state !== 'not_sent').length} 次待结算</small>
		</section>;
	})}</div>;
}

function DirectionForm({ analysis, index, save, busy }: { analysis: Analysis; index: number; save: (payload: Parameters<Model['command']>[1]) => Promise<void>; busy: boolean }) {
	const direction = analysis.result!.directions[index]!;
	const [files, setFiles] = useState(direction.files);
	const [required, setRequired] = useState(direction.requiredInformation.join('\n'));
	const [optional, setOptional] = useState(direction.optionalInformation.join('\n'));
	const [budget, setBudget] = useState(defaultOptimizationBudget);
	return <details className="rsi-card">
		<summary>{direction.title} · {objectives[direction.objective]}</summary>
		<p>{direction.rationale}</p>
		<fieldset><legend>拟修改文件</legend>{direction.files.map(file => <label key={file}><input type="checkbox" checked={files.includes(file)} onChange={e => setFiles(e.target.checked ? [...files, file] : files.filter(f => f !== file))} /> {file}</label>)}</fieldset>
		<label>必须保留的信息<textarea value={required} onChange={e => setRequired(e.target.value)} /></label>
		<label>可以省略的内容<textarea value={optional} onChange={e => setOptional(e.target.value)} /></label>
		<details><summary>拟定优化预算</summary>
			<label>最多轮次<input type="number" min={1} max={3} value={budget.maxRounds} onChange={e => setBudget({ ...budget, maxRounds: e.target.valueAsNumber })} /></label>
			<label>最多请求<input type="number" min={1} max={100} value={budget.maxRequests} onChange={e => setBudget({ ...budget, maxRequests: e.target.valueAsNumber })} /></label>
			<label>Token 停止阈值<input type="number" min={1} max={100000} value={budget.tokenStopThreshold} onChange={e => setBudget({ ...budget, tokenStopThreshold: e.target.valueAsNumber })} /></label>
			<label>时长上限（分钟）<input type="number" min={1} max={60} value={budget.maxDurationMs / 60000} onChange={e => setBudget({ ...budget, maxDurationMs: e.target.valueAsNumber * 60000 })} /></label>
		</details>
		<p className="rsi-muted">当前保存为草稿。正式评测契约尚未配置，保存不会授权修改或消耗模型额度。</p>
		<button disabled={busy || !required.trim() || files.length === 0} onClick={() => void save({ analysisId: analysis.id, directionIndex: index, files, requiredInformation: required, optionalInformation: optional, budget })}>保存授权草稿</button>
	</details>;
}

export function RsiPanel({ useRsi, useSessions, useWorkspaces, command, catalog, openSession }: PanelProps) {
	const view = useRsi(s => s);
	const sessions = useSessions(s => s);
	const workspaces = useWorkspaces(s => s);
	const sessionId = sessions.current ?? null;
	const cwd = sessionId ? sessions.byId[sessionId]?.cwd : undefined;
	const [chosenWorkspace, setWorkspace] = useState<string | null>(null);
	const workspace = workspaces.items.find(w => w.workspaceId === chosenWorkspace) ?? workspaces.items.find(w => w.path === cwd) ?? workspaces.items[0];
	const workspaceId = workspace?.workspaceId ?? null;
	const [available, setAvailable] = useState<Awaited<ReturnType<Model['catalog']>>>([]);
	const [catalogError, setCatalogError] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [selectedAnalysis, setAnalysis] = useState<string | null>(null);
	const [outputLimit, setOutputLimit] = useState<number | null>(null);
	const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
	const snapshot = view.snapshot;
	const skills = snapshot?.business.skills.filter(s => s.workspaceId === workspaceId) ?? [];
	const skillIds = new Set(skills.map(s => s.id));
	const analyses = snapshot?.business.analyses.filter(a => skillIds.has(a.skillId)) ?? [];
	const analysis = analyses.find(a => a.id === selectedAnalysis) ?? analyses.at(-1);
	const enrollment = snapshot?.business.enrollments.findLast(e => e.sessionId === sessionId && e.status === 'active');
	const disabled = busy || !!view.error || !snapshot;
	useEffect(() => {
		const controller = new AbortController(); setAvailable([]); setCatalogError('');
		if (workspaceId) void catalog(workspaceId, cwd === workspace?.path ? sessionId : null, controller.signal).then(rows => { if (!controller.signal.aborted) setAvailable(rows); }).catch(e => { if (!controller.signal.aborted) setCatalogError(String(e)); });
		return () => controller.abort();
	}, [workspaceId, sessionId, cwd, workspace?.path, catalog]);
	async function run<K extends Parameters<Model['command']>[0]>(kind: K, payload: Parameters<Model['command']>[1]) {
		setBusy(true); setError('');
		try {
			const id = await command(kind, payload as never);
			if (['prepare_analysis', 'prepare_design_analysis'].includes(kind) && id) setAnalysis(id);
		} catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
		finally { setBusy(false); }
	}
	return <aside className="rsi-panel" aria-label="RSI 控制面板">
		<style>{`
		.rsi-panel{padding:18px;display:grid;gap:16px;font-size:13px;line-height:1.6;color:inherit;overflow-wrap:anywhere}
		.rsi-panel h2,.rsi-panel h3,.rsi-panel p{margin:0}.rsi-panel h2{font-size:18px}.rsi-panel h3{font-size:14px}
		.rsi-panel section,.rsi-panel label,.rsi-panel fieldset{display:grid;gap:8px}.rsi-panel button,.rsi-panel input,.rsi-panel select,.rsi-panel textarea{font:inherit;color:inherit;border:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);border-radius:6px;padding:6px 8px;max-width:100%}.rsi-panel button{cursor:pointer}.rsi-panel button:disabled{opacity:.5;cursor:default}.rsi-panel textarea{min-height:70px;width:100%;box-sizing:border-box}.rsi-panel input[type=checkbox]{width:auto;margin:0}.rsi-panel fieldset label{display:flex;align-items:center;gap:8px}.rsi-panel summary{cursor:pointer;font-weight:600}
		.rsi-card{border:0.5px solid var(--dsw-alias-border-l3);border-radius:10px;padding:12px;display:grid;gap:8px}.rsi-card[open]{display:grid}.rsi-card[open]>summary{margin-bottom:8px}.rsi-muted,.rsi-panel small{opacity:.72}.rsi-panel small{display:block}.rsi-total{font-size:23px;font-variant-numeric:tabular-nums}.rsi-usage-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rsi-actions{display:flex;flex-wrap:wrap;gap:6px}.rsi-panel [role=alert]{border-left:3px solid currentColor;padding-left:8px}
		.rsi-design-start>small{margin:8px 0}.rsi-design-start fieldset{margin:8px 0;padding:8px;border:0}.rsi-design-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rsi-design-options button{display:grid;gap:5px;text-align:left;padding:6px;min-width:0}.rsi-design-options button[aria-pressed=true]{outline:2px solid currentColor;outline-offset:1px}.rsi-design-options button:focus-visible{outline:2px dashed currentColor;outline-offset:3px}.rsi-design-options strong{font-size:12px}.rsi-design-options small{font-size:10px;line-height:1.4}.rsi-design-summary{border-left:2px solid currentColor;padding:8px;white-space:pre-wrap}
		.rsi-design-preview{position:relative;display:block;height:64px;overflow:hidden;border-radius:3px;background:#f0f2f5;color:#1c2635}.rsi-design-preview i,.rsi-design-preview b,.rsi-design-preview em,.rsi-design-preview>span{position:absolute;display:block;background:currentColor;font-style:normal}.rsi-design-preview i{left:8px;top:8px;width:15px;height:3px}.rsi-design-preview b{left:8px;top:20px;width:48%;height:9px}.rsi-design-preview em{left:8px;top:34px;width:62%;height:2px;opacity:.4}.rsi-design-preview>span{left:8px;top:45px;width:25px;height:8px;border-radius:2px;background:#4361c7}.rsi-type-portfolio b{width:32%;height:29px}.rsi-type-portfolio em{left:48%;top:20px;width:42%;height:29px}.rsi-type-portfolio>span{top:54px;height:2px}.rsi-type-dashboard i{left:0;top:0;height:64px;width:12%;opacity:.2}.rsi-type-dashboard b,.rsi-type-dashboard em,.rsi-type-dashboard>span{left:21%;width:65%;height:8px}.rsi-type-article b{width:74%;height:6px}.rsi-type-article em{height:14px;background:repeating-linear-gradient(currentColor 0 1px,transparent 1px 5px)}.rsi-type-article>span{height:2px;width:47%;background:currentColor}
		.rsi-design-preview[class*=rsi-style] b{background:none;width:auto;height:auto;font-size:24px;line-height:1;top:18px}.rsi-style-editorial{background:#f2eadc;color:#372d25}.rsi-style-editorial b{font-family:Georgia,serif}.rsi-style-editorial>span{background:#372d25;height:2px;width:66%;border-radius:0}.rsi-style-bold{background:#192332;color:#fbfdff}.rsi-style-bold b{font-weight:900}.rsi-style-bold>span{background:#d5ef64}.rsi-style-warm{background:#f8e8d7;color:#683e33}.rsi-style-warm>span{background:#c56f48;border-radius:9px}.rsi-style-clear>span{background:#4361c7}
		.rsi-compare{border-top:1px solid var(--dsw-alias-border-l3);padding-top:14px;margin-top:6px}.rsi-result-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rsi-result{display:grid;align-content:start;gap:6px;min-width:0}.rsi-preview{width:100%;aspect-ratio:3/4;overflow:hidden;border:1px solid var(--dsw-alias-border-l3);border-radius:6px;background:white;box-sizing:border-box}.rsi-result a{color:inherit;text-decoration:underline;text-underline-offset:3px}.rsi-metric{display:grid;gap:6px;margin-top:6px}.rsi-bar-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px;font-variant-numeric:tabular-nums}.rsi-bar-track{height:9px;background:var(--dsw-alias-border-l3);border-radius:9px;overflow:hidden}.rsi-bar{height:100%;border-radius:9px}.rsi-bar-0{background:#8594aa}.rsi-bar-1{background:#5483e8}.rsi-result [role=alert]{font-size:11px}
		`}</style>
		<div><h2>Skill 优化</h2><p className="rsi-muted">提交任务或 /Skill名称，确认偏好和预算；对比产物后选择版本，也可补充要求继续迭代。</p></div>
		{view.error && <p role="alert">连接中断，显示最后快照。{view.error}</p>}
		{error && <p role="alert">{error}</p>}
		{snapshot ? <>
			{snapshot.business.mainflow.tasks.filter(t => t.sessionId === sessionId || t.executionSessionId === sessionId).slice(-1).map(t => <MainflowCard key={t.id} task={t} snapshot={snapshot} disabled={disabled} run={run} openSession={openSession} />)}
			<Usage snapshot={snapshot} sessionId={sessionId} analysisId={analysis?.id ?? null} />
			<small>最近更新 {new Date(snapshot.updatedAt).toLocaleTimeString()} · 日常用量从插件加载后记录，供应商尚未返回的用量不会记为零。</small>
			<section className="rsi-card" aria-label="本次迭代范围"><h3>本次任务</h3>
				{enrollment ? <><strong>{enrollment.decision === 'included' ? `已纳入：${snapshot.business.skills.find(s => s.id === enrollment.skillId)?.name ?? 'Skill'}` : '本次暂不纳入 RSI'}</strong><p className="rsi-muted">连续修改沿用本次选择；实际修改 Skill 和启用候选仍需另行授权。</p><button disabled={disabled} onClick={() => void run('end_enrollment', { enrollmentId: enrollment.id })}>结束本次任务</button><small>只结束 RSI 观察范围，普通编写任务继续。</small></> : <p>在聊天框描述网页需求，或用 /Skill名称 指定任意目录型 Skill。无需预先登记；修改确认卡会出现在此面板。</p>}
			</section>
			<details><summary>高级设置：Skill 与设计偏好</summary>
			<label>受管工作区<select value={workspaceId ?? ''} onChange={e => setWorkspace(e.target.value)}><option value="" disabled>请先在 Harness 添加工作区</option>{workspaces.items.map(w => <option value={w.workspaceId} key={w.workspaceId}>{w.title}</option>)}</select></label>
			<section><h3>受管 Skill</h3>{skills.length === 0 && <p className="rsi-muted">尚未纳入 Skill。选择下方已有技能后才开始观察。</p>}
				{skills.map(skill => <div className="rsi-card" key={skill.id}>
					<strong>{skill.name}</strong><small>{skill.snapshot.files.length} 个文件 · {skill.sourceState === 'matching' ? '来源已核对' : '来源需要核对'}</small>
					<label><span><input type="checkbox" checked={skill.observing} disabled={disabled} onChange={e => void run('observe', { skillId: skill.id, enabled: e.target.checked })} /> 观察后续任务</span></label>
					{skill.sourceError && <p role="alert">{skill.sourceError}</p>}
					<details><summary>来源与文件</summary><small>{skill.snapshot.sourceRoot}</small>{skill.snapshot.files.map(f => <small key={f.path}>{f.path}</small>)}</details>
					<button disabled={disabled} onClick={() => void run('review_source', { skillId: skill.id })}>核对来源</button>
				</div>)}
				<details><summary>纳入已有 Skill</summary>{catalogError && <p role="alert">{catalogError}</p>}{available.map(item => <div className="rsi-card" key={item.name}><strong>{item.name}</strong><small>{item.description}</small><button disabled={disabled || !item.supported || skills.some(s => s.name === item.name)} onClick={() => void run('manage', { workspaceId: workspaceId!, name: item.name, sessionId: cwd === workspace?.path ? sessionId : null })}>{!item.supported ? '暂不支持此来源' : skills.some(s => s.name === item.name) ? '已纳入' : '纳入管理'}</button></div>)}</details>
			</section>
			{workspaceId && <FrontendPreparation key={workspaceId} snapshot={snapshot} workspaceId={workspaceId} skills={skills} disabled={disabled} run={run} budget={{ ...snapshot.config.analysis, maxOutputTokens: outputLimit ?? snapshot.config.analysis.maxOutputTokens, maxDurationMs: (durationMinutes ?? snapshot.config.analysis.maxDurationMs / 60000) * 60000 }} />}
			</details>
			<section><h3>优化机会</h3>{snapshot.business.observationError && <p role="alert">{snapshot.business.observationError}</p>}
				{snapshot.business.opportunities.filter(o => skillIds.has(o.skillId)).length === 0 && <p className="rsi-muted">等待可归属的任务线索。仅加载 Skill 的任务才参与归属；多技能歧义不会自动猜测。</p>}
				{snapshot.business.opportunities.filter(o => skillIds.has(o.skillId)).map(opportunity => <details className="rsi-card" key={opportunity.id} open={opportunity.status === 'open'}>
					<summary>{rules[opportunity.rule]} · {skills.find(s => s.id === opportunity.skillId)?.name} {opportunity.status === 'ignored' ? '（已忽略）' : opportunity.status === 'snoozed' ? '（已暂缓）' : ''}</summary>
					{opportunity.evidence.map(e => <p key={`${e.sessionId}:${e.seq}`}><span>{e.summary}</span><small>{new Date(e.time).toLocaleString()}</small></p>)}
					<small>这是优化线索，尚未证明存在缺陷或能够节省 Token。</small>
					<div className="rsi-actions"><button disabled={disabled} onClick={() => void run('prepare_analysis', { opportunityId: opportunity.id, budget: { ...snapshot.config.analysis, maxOutputTokens: outputLimit ?? snapshot.config.analysis.maxOutputTokens, maxDurationMs: (durationMinutes ?? snapshot.config.analysis.maxDurationMs / 60000) * 60000 } })}>分析优化机会</button><button disabled={disabled} onClick={() => void run('opportunity', { opportunityId: opportunity.id, status: opportunity.status === 'open' ? 'snoozed' : 'open' })}>{opportunity.status === 'open' ? '暂缓' : '恢复提示'}</button><button disabled={disabled} onClick={() => void run('opportunity', { opportunityId: opportunity.id, status: 'ignored' })}>忽略</button></div>
				</details>)}
				<details><summary>分析默认预算</summary><p>DeepSeek-V4-Flash / {efforts[snapshot.config.analysis.reasoningEffort]} · 最多 1 次请求 · 不自动重试</p><label>输出上限（含推理 Token）<input type="number" min={128} max={snapshot.config.analysis.maxOutputTokens} value={outputLimit ?? snapshot.config.analysis.maxOutputTokens} onChange={e => setOutputLimit(e.target.valueAsNumber)} /></label><label>超时（分钟）<input type="number" min={1} max={snapshot.config.analysis.maxDurationMs / 60000} value={durationMinutes ?? snapshot.config.analysis.maxDurationMs / 60000} onChange={e => setDurationMinutes(e.target.valueAsNumber)} /></label><small>下一步先预览发送范围，确认后才产生模型请求。</small></details>
			</section>
			{analyses.length > 0 && <section><h3>分析与方向</h3><select aria-label="选定 RSI 分析" value={analysis?.id ?? ''} onChange={e => setAnalysis(e.target.value)}>{analyses.map(a => <option key={a.id} value={a.id}>{new Date(a.createdAt).toLocaleTimeString()} · {statuses[a.status]}</option>)}</select>
				{analysis && <><strong>{statuses[analysis.status]}</strong>{analysis.error && <p role="alert">{analysis.error}</p>}
					<details open={analysis.status === 'prepared'}><summary>本次发送范围与预算</summary><p>DeepSeek-V4-Flash / {efforts[analysis.budget.reasoningEffort]} · 最多 {analysis.budget.maxRequests} 次请求，输出（含推理）{analysis.budget.maxOutputTokens} Token，{analysis.budget.maxDurationMs / 60000} 分钟。</p><small>下方展示本次分析的内容，内部编号已省略；请检查片段中的敏感信息。</small><textarea aria-label="分析发送内容" readOnly value={analysisPreview(analysis.input)} rows={10} /><details><summary>分析指令</summary><p>{analysis.system}</p></details></details>
					{analysis.status === 'prepared' && <button disabled={disabled} onClick={() => void run('start_analysis', { analysisId: analysis.id, inputDigest: analysis.inputDigest })}>确认范围与预算，开始分析</button>}
					{['prepared', 'running'].includes(analysis.status) && <button disabled={disabled} onClick={() => void run('cancel_analysis', { analysisId: analysis.id })}>取消本次分析</button>}
					{analysis.result && <><p>{analysis.result.conclusion}</p>{analysis.result.directions.map((_, index) => <DirectionForm key={`${analysis.id}:${index}`} analysis={analysis} index={index} busy={disabled} save={payload => run('save_draft', payload)} />)}</>}
				</>}
			</section>}
			<section><h3>授权草稿</h3><p className="rsi-muted">正式评测契约尚未配置，G1 不执行候选修改。</p>{snapshot.business.drafts.filter(d => skillIds.has(d.skillId)).map(draft => <div className="rsi-card" key={draft.id}><strong>{objectives[draft.objective]} · {draft.status === 'draft' ? '草稿，未授权修改' : '已撤销'}</strong><small>{draft.files.join('、')}</small><p>{draft.requiredInformation}</p><button disabled>正式授权：等待评测契约</button>{draft.status === 'draft' && <button disabled={disabled} onClick={() => void run('revoke_draft', { draftId: draft.id })}>撤销草稿</button>}</div>)}</section>
		</> : <p>正在连接 RSI 宿主…</p>}
	</aside>;
}
