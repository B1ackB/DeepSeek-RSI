import { randomUUID } from 'node:crypto';
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import { emptyTokens, fault, tokensSchema, type Attempt } from './contracts.ts';
import type { Store } from './store.ts';

export function measuredTokens(u: TokenUsage) {
	// 底座 inputTokens 不含缓存；可选缓存字段缺失时不推导总量。
	return tokensSchema.parse({ inputUncached: u.inputTokens, inputCacheRead: u.cacheReadTokens ?? null, inputCacheWrite: u.cacheWriteTokens ?? null, output: u.outputTokens, reasoning: u.reasoningTokens ?? null, total: u.totalTokens ?? null });
}

export function observeUsage(store: Store, rsiSessions: ReadonlySet<string>, probeSessions: ReadonlySet<string> = rsiSessions, retries = new Map<string, string>()) {
	return async function* (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
		const sessionId = options.sessionId ?? null;
		const rsi = sessionId !== null && rsiSessions.has(sessionId);
		const probe = rsi || (sessionId !== null && probeSessions.has(sessionId));
		// 底座摘要器未透传推理等级；只为已登记的 G0 压缩请求填入已授权值。
		if (probe && options.purpose === 'compaction' && options.reasoningEffort === undefined) options.reasoningEffort = 'high' as GenerateOptions['reasoningEffort'];
		if (probe && (options.provider !== 'deepseek-official' || options.model !== 'deepseek-v4-flash' || options.maxTokens === undefined || options.maxTokens > 4096 || options.reasoningEffort !== 'high')) throw fault('budget_config', 'G0 probe route/output cap differs from the approved configuration');
		let attempt: Attempt = {
			schemaVersion: 1, attemptId: randomUUID(), revision: 1,
			owner: rsi ? 'rsi' : sessionId ? 'session' : 'unresolved', ownerId: rsi ? store.snapshot().probeId : sessionId, sessionId,
			purpose: probe ? 'probe' : 'daily', callKind: options.purpose === 'compaction' ? 'compression' : 'agent', retryOfAttemptId: options.purpose === undefined && sessionId ? retries.get(sessionId) ?? null : null,
			provider: options.provider, model: options.model, providerRequestId: null,
			state: 'reserved', createdAt: Date.now(), startedAt: null, endedAt: null, usageState: 'pending', tokens: emptyTokens(), usageSource: null, diagnostic: null,
		};
		store.reserve(attempt);
		if (sessionId && attempt.retryOfAttemptId) retries.delete(sessionId);
		const update = (change: Partial<Attempt>) => { const updated = { ...attempt, ...change, revision: attempt.revision + 1 }; store.settle(updated); attempt = updated; };
		update({ state: 'in_flight', startedAt: Date.now() });
		let finished = false;
		try {
			for await (const chunk of next()) {
				if (chunk.type === 'usage') {
					const tokens = measuredTokens(chunk.usage);
					if (Object.keys(tokens).some(k => { const key = k as keyof typeof tokens; return attempt.tokens[key] !== null && tokens[key] !== null && attempt.tokens[key] !== tokens[key]; })) {
						update({ usageState: 'unknown', diagnostic: 'conflicting_provider_usage' });
						throw fault('usage_conflict', 'Provider emitted contradictory usage for one attempt');
					}
					for (const key of Object.keys(tokens) as Array<keyof typeof tokens>) tokens[key] ??= attempt.tokens[key];
					if (JSON.stringify(tokens) !== JSON.stringify(attempt.tokens)) update({ tokens, usageState: tokens.total === null ? 'partial' : 'confirmed', usageSource: 'provider' });
				}
				if (chunk.type === 'finish' && !finished) {
					finished = true;
					update({ state: chunk.reason.kind === 'error' ? 'failed' : chunk.reason.kind === 'aborted' ? 'cancelled' : 'succeeded', endedAt: Date.now(), usageState: attempt.tokens.total === null ? 'unknown' : 'confirmed' });
				}
				yield chunk;
			}
		} finally {
			if (!finished) update({ state: 'interrupted', endedAt: Date.now(), usageState: attempt.tokens.total === null || attempt.diagnostic ? 'unknown' : 'confirmed' });
		}
	};
}
