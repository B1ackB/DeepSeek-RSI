import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client';
import { snapshotSchema, type Snapshot } from '../contracts.ts';

export const inject = ['connection', 'slots', 'sessions'];
export function apply(ctx: Context) {
	const connection = ctx.get('connection') as ConnectionHandle;
	const sessions = ctx.get('sessions') as ISessions;
	async function call(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<Snapshot> {
		const response = await connection.rpc.call('/rsi-g0', endpoint, payload, signal);
		if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
		return snapshotSchema.parse(response.value);
	}
	function Panel() {
		const selection = useSyncExternalStore(sessions.list.subscribe, sessions.list.getSnapshot);
		const [snapshot, setSnapshot] = useState<Snapshot>();
		const [marker, setMarker] = useState('');
		const [error, setError] = useState('');
		const [connectionError, setConnectionError] = useState('');
		const [busy, setBusy] = useState(false);
		useEffect(() => {
			const controller = new AbortController();
			void (async () => {
				let after = 0;
				while (!controller.signal.aborted) {
					try {
						const next = await call(after === 0 ? 'snapshot' : 'wait', after === 0 ? {} : { after }, controller.signal);
						if (controller.signal.aborted) break;
						setSnapshot(before => !before || next.snapshotRevision > before.snapshotRevision ? next : before);
						after = next.snapshotRevision;
						setConnectionError('');
					} catch (e) {
						if (controller.signal.aborted) break;
						setConnectionError(`连接中断，显示上次状态。${String(e)}`);
						await new Promise(resolve => { const timer = setTimeout(resolve, 2000); controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(undefined); }, { once: true }); });
						after = 0;
					}
				}
			})();
			return () => controller.abort();
		}, []);
		async function submit(kind: 'set_marker' | 'cancel_probe') {
			if (!snapshot) return;
			setBusy(true);
			try {
				const next = await call('command', { schemaVersion: 1, operationId: crypto.randomUUID(), kind, probeId: snapshot.probeId, expectedRevision: snapshot.snapshotRevision, payload: kind === 'set_marker' ? { marker } : {} });
				setSnapshot(before => !before || next.snapshotRevision > before.snapshotRevision ? next : before);
				setError('');
			} catch (e) { setError(String(e)); } finally { setBusy(false); }
		}
		return <section style={{ padding: 24, maxWidth: 820, display: 'grid', gap: 16 }}>
			<h2>DeepSeek RSI · G0 接入验证</h2>
			<p>此面板只验证状态持久化与请求用量，不生成、修改或启用 Skill。</p>
			{(error || connectionError) && <p role="alert">{connectionError || error}</p>}
			{snapshot ? <>
				<p>已保存标记：<strong data-testid="rsi-marker">{snapshot.marker || '（空）'}</strong> · 修订 {snapshot.snapshotRevision}</p>
				<label>测试标记 <input aria-label="测试标记" value={marker} onChange={e => setMarker(e.target.value)} /></label>
				<div><button disabled={busy || !!connectionError} onClick={() => void submit('set_marker')}>保存测试标记</button> <button disabled={busy || !!connectionError || snapshot.cancelled} onClick={() => void submit('cancel_probe')}>取消探针</button></div>
				<p>探针：{snapshot.cancelled ? '已请求取消；资源清理结果以验证报告为准' : '就绪'} · 最后更新 {new Date(snapshot.updatedAt).toLocaleTimeString()}</p>
				{(['session', 'rsi', 'unresolved'] as const).map(owner => {
					const rows = snapshot.attempts.filter(a => a.owner === owner && (owner !== 'session' || a.sessionId === selection.current));
					const confirmed = rows.filter(a => a.tokens.total !== null);
					return <div key={owner} style={{ border: '1px solid currentColor', borderRadius: 8, padding: 12 }}>
						<h3>{{ session: '当前 Harness 会话', rsi: 'RSI 探针', unresolved: '待核实归属' }[owner]}</h3>
						{owner === 'session' && <p>{selection.current ?? '未选择会话'} · 仅统计本插件加载后的请求</p>}
						<p>{confirmed.length ? `已确认 ${confirmed.reduce((sum, a) => sum + a.tokens.total!, 0)} Token` : '尚无已确认用量'} · {rows.filter(a => a.usageState !== 'confirmed' && a.state !== 'not_sent').length} 次用量待核实</p>
						{rows.map(a => <p key={a.attemptId}>{a.sessionId ?? '无会话标识'} · {a.callKind} · {a.state} · {a.tokens.total ?? '未知'} Token</p>)}
					</div>;
				})}
			</> : <p>等待宿主状态…</p>}
		</section>;
	}
	ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({ name: 'settings.plugins.tab', id: 'rsi-g0', order: 30, label: 'DeepSeek RSI', inject: () => ({}) }, Panel));
}
