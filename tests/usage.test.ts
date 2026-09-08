import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReasoningEffortId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { openStore } from '../src/store.ts';
import { observeUsage } from '../src/usage.ts';

test('stream ledger separates owners, deduplicates usage and pauses on conflicting or missing usage', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-stream-'));
	const store = openStore(join(dir, 'state.sqlite'));
	try {
		const retries = new Map<string, string>();
		const observe = observeUsage(store, new Set(['worker']), new Set(['worker', 'daily']), retries);
		const options: GenerateOptions = { provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 4096, reasoningEffort: ReasoningEffortId('high'), sessionId: SessionId('worker'), messages: [] };
		const usage: StreamChunk = { type: 'usage', usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 } };
		const finish: StreamChunk = { type: 'finish', reason: { kind: 'stop' } };
		let dispatches = 0;
		async function consume(chunks: StreamChunk[], change: Partial<GenerateOptions> = {}) {
			for await (const _ of observe({ ...options, ...change }, async function* () { dispatches++; yield* chunks; })) { /* 消费真实中间件，供应商替换为固定流。 */ }
		}
		await consume([usage, usage, finish, finish], { sessionId: SessionId('daily') });
		await consume([usage, finish]);
		let rows = store.snapshot().attempts;
		assert.equal(rows[0].owner, 'session'); assert.equal(rows[1].owner, 'rsi');
		assert.equal(rows[0].revision, 4); assert.equal(rows[0].tokens.inputCacheRead, null);
		retries.set('worker', rows[1].attemptId);
		await consume([usage, finish]);
		assert.equal(store.snapshot().attempts[2].retryOfAttemptId, rows[1].attemptId);
		await consume([usage, finish], { purpose: 'compaction', reasoningEffort: undefined });
		assert.equal(store.snapshot().attempts[3].callKind, 'compression');
		await assert.rejects(consume([usage, { type: 'usage', usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 } }]), /contradictory usage/);
		rows = store.snapshot().attempts;
		assert.equal(rows[4].tokens.total, 10); assert.equal(rows[4].diagnostic, 'conflicting_provider_usage');
		assert.equal(rows[4].usageState, 'unknown');
		await assert.rejects(consume([usage, finish]), /not settled/);
		assert.equal(dispatches, 5);
		await consume([], { sessionId: SessionId('unrelated-daily') });
		assert.equal(store.snapshot().attempts[5].usageState, 'unknown');
		assert.equal(store.snapshot().attempts[5].tokens.total, null);
	} finally { store.close(); rmSync(dir, { recursive: true }); }
});
