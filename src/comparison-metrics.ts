import type { Attempt } from './contracts.ts';
export function requestMetrics(attempts: Attempt[], ownerId: string, sessionId?: string) {
	const rows = attempts.filter(a => a.owner === 'rsi' && a.ownerId === ownerId && (!sessionId || a.sessionId === sessionId));
	const confirmed = rows.filter(a => a.usageState === 'confirmed');
	const knownTokens = confirmed.reduce((sum, a) => sum + a.tokens.total!, 0);
	return { requests: rows.length, pending: rows.length - confirmed.length, knownTokens, totalTokens: rows.length && confirmed.length === rows.length ? knownTokens : null };
}
