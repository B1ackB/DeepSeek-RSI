import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import { z } from 'zod';
import { catalogSchema, g1SnapshotSchema, receiptSchema, type G1Command, type G1Snapshot } from '../g1-contracts.ts';

export function createPanelModel(connection: ConnectionHandle) {
	let view: { snapshot: G1Snapshot | null; error: string } = { snapshot: null, error: '' };
	const listeners = new Set<() => void>();
	const controller = new AbortController();
	function publish(snapshot: G1Snapshot | null, error = '') {
		view = { snapshot, error };
		for (const listener of listeners) listener();
	}
	async function call(endpoint: string, payload: unknown, signal = controller.signal) {
		const result = await connection.rpc.call('/rsi', endpoint, payload, signal);
		if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
		return result.value;
	}
	function accept(value: unknown) {
		const snapshot = g1SnapshotSchema.parse(value);
		if (!view.snapshot || snapshot.snapshotRevision >= view.snapshot.snapshotRevision) publish(snapshot);
	}
	const done = (async () => {
		while (!controller.signal.aborted) {
			try { accept(await call(view.snapshot && !view.error ? 'wait' : 'snapshot', view.snapshot && !view.error ? { after: view.snapshot.snapshotRevision } : {})); }
			catch (error) {
				if (controller.signal.aborted) break;
				publish(view.snapshot, error instanceof Error ? error.message : '连接中断');
				await new Promise<void>(resolve => {
					const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
					const timer = setTimeout(finish, 2000); controller.signal.addEventListener('abort', finish, { once: true });
				});
			}
		}
	})();
	return {
		source: { getSnapshot: () => view, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } },
		async command<K extends G1Command['kind']>(kind: K, payload: Extract<G1Command, { kind: K }>['payload']) {
			if (!view.snapshot || view.error) throw new Error('连接尚未就绪，请等待最新状态');
			const input = { schemaVersion: 1, operationId: crypto.randomUUID(), expectedRevision: view.snapshot.business.revision, kind, payload };
			const result = z.strictObject({ receipt: receiptSchema, snapshot: g1SnapshotSchema }).parse(await call('command', input));
			accept(result.snapshot); return result.receipt.focusId;
		},
		async catalog(workspaceId: string, sessionId: string | null, signal: AbortSignal) { return catalogSchema.parse(await call('catalog', { workspaceId, sessionId }, signal)); },
		async dispose() { controller.abort(); listeners.clear(); await done; },
	};
}
