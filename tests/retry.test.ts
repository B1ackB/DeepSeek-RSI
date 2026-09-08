import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage, resolveRetryPolicy, type StreamChunk } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import * as retry from '@deepseek-ai/dsh-llm-retry';
import * as plugin from '../src/index.ts';

test('native Agent Loop retry records two attempts and links the actual retry event without network', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-native-retry-'));
	const previousHome = process.env.DSH_HOME;
	process.env.DSH_HOME = dir;
	const ctx = new Context();
	class Adapter extends LlmAdapter {
		calls = 0;
		override providerRetryPolicy() { return resolveRetryPolicy({ mode: 'normal', maxRetries: 1, retryableCodes: ['SERVER'], backoff: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 } }, 'G0 fixture'); }
		async *stream(): AsyncIterable<StreamChunk> {
			this.calls++;
			assert.equal(ctx.rsiG0.store.snapshot().attempts.length, this.calls, 'Ledger reservation must precede adapter dispatch');
			yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 } };
			if (this.calls === 1) { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'Controlled failure', status: 503 } } }; return; }
			yield { type: 'block-start', index: 0, blockType: 'text' };
			yield { type: 'text-delta', index: 0, text: 'RETRY_OK' };
			yield { type: 'block-end', index: 0, block: { type: 'text', text: 'RETRY_OK' } };
			yield { type: 'finish', reason: { kind: 'stop' } };
		}
	}
	try {
		await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry);
		await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry);
		// HTTP 已由独立实测覆盖；此处只替换连接服务，复用生产插件的计量与重试监听。
		ctx.provide('connection', { rpc: { handle: () => () => {} } } as unknown as Context['connection']);
		await ctx.plugin(plugin); await ctx.plugin(retry, {}); await ctx.plugin(AgentLoop, { agents: [] });
		const adapter = new Adapter(); ctx.llm.registerAdapter(['fixture'], adapter);
		const handle = await ctx.agents.create({ sessionId: SessionId('g0-native-retry'), agentOptions: { provider: 'fixture', model: 'fixture' } });
		try {
			handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Run the controlled retry fixture' }] }));
			await handle.agent.whenIdle();
			const rows = ctx.rsiG0.store.snapshot().attempts;
			assert.equal(adapter.calls, 2); assert.equal(rows.length, 2);
			assert.equal(rows[0].state, 'failed'); assert.equal(rows[1].state, 'succeeded');
			assert.equal(rows[1].retryOfAttemptId, rows[0].attemptId);
			assert.equal(rows.reduce((sum, row) => sum + row.tokens.total!, 0), 20);
			assert.equal(handle.agent.session.snapshotEvents().filter(e => e.type === 'llm/retry-started').length, 1);
		} finally { await handle.dispose(); }
	} finally {
		await ctx.fiber.dispose();
		if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
		rmSync(dir, { recursive: true });
	}
});
