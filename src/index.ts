import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-llm-retry/types';
import { join } from 'node:path';
import { z } from 'zod';
import { openStore } from './store.ts';
import type { Store } from './store.ts';
import { observeUsage } from './usage.ts';
import { integer, fault } from './contracts.ts';

export const name = 'deepseek-rsi-g0';
export const inject = ['connection', 'llm'];

declare module '@deepseek-ai/cordis' {
	interface Context { rsiG0: { store: Store; rsiSessions: Set<string>; probeSessions: Set<string>; active: Set<AbortController> }; }
}

export function apply(ctx: Context) {
	const home = process.env.DSH_HOME;
	if (!home) throw new Error('G0 requires an explicit DSH_HOME');
	const store = openStore(join(home, 'rsi', 'g0.sqlite'));
	const rsiSessions = new Set<string>();
	const active = new Set<AbortController>();
	const probeSessions = new Set<string>();
	const retries = new Map<string, string>();
	ctx.provide('rsiG0', { store, rsiSessions, probeSessions, active });
	ctx.effect(() => () => { for (const task of active) task.abort(); store.close(); });
	ctx.on('llm/stream', observeUsage(store, rsiSessions, probeSessions, retries));
	ctx.on('session/event', (session, event) => {
		if (event.type === 'turn/end') retries.delete(session.id);
		if (event.type !== 'llm/retry-started') return;
		const before = store.snapshot().attempts.findLast(a => a.sessionId === session.id && a.callKind === 'agent');
		if (before) retries.set(session.id, before.attemptId);
	});
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-g0', async (endpoint, payload, signal) => {
		try {
			if (endpoint === 'snapshot') { z.strictObject({}).parse(payload); return { ok: true, value: store.snapshot() }; }
			if (endpoint === 'command') {
				const result = store.command(payload);
				if (result.cancelled) for (const task of active) task.abort();
				return { ok: true, value: result };
			}
			if (endpoint === 'wait') {
				const { after } = z.strictObject({ after: integer }).parse(payload);
				if (store.snapshot().snapshotRevision <= after && !signal.aborted) await new Promise<void>(resolve => {
					const done = () => { clearTimeout(timer); unsubscribe(); signal.removeEventListener('abort', done); resolve(); };
					const timer = setTimeout(done, 25000);
					const unsubscribe = store.subscribe(done);
					signal.addEventListener('abort', done, { once: true });
				});
				return { ok: true, value: store.snapshot() };
			}
			throw fault('unknown_endpoint', 'Unknown G0 operation');
		} catch (error) {
			return { ok: false, error: { code: error instanceof z.ZodError ? 'invalid_input' : error instanceof Error && 'code' in error ? String(error.code) : 'internal', message: error instanceof Error ? error.message : 'G0 operation failed', details: {} } };
		}
	}));
}
