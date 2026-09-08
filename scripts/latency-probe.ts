import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type {} from '../src/index.ts';

export const name = 'rsi-browser-latency-fixture';
export const inject = ['llm', 'connection', 'rsiG0'];

// 仅用于独立测试配置，不进入安装包，也不注册任何真实供应商路线。
export function apply(ctx: Context) {
	let receivedAt = 0;
	class Adapter extends LlmAdapter {
		async *stream(): AsyncIterable<StreamChunk> {
			receivedAt = Date.now();
			yield { type: 'usage', usage: { inputTokens: 113, outputTokens: 17, totalTokens: 130 } };
			yield { type: 'finish', reason: { kind: 'stop' } };
		}
	}
	ctx.effect(() => {
		const adapter = ctx.llm.registerAdapter(['rsi-browser-fixture'], new Adapter());
		return adapter;
	});
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-latency-fixture', async (endpoint, payload, signal) => {
		if (endpoint !== 'run' || JSON.stringify(payload) !== '{}') throw new Error('Only the fixed fixture is supported');
		for await (const _ of ctx.llm.stream({ provider: 'rsi-browser-fixture', model: 'fixed', messages: [], maxTokens: 64, signal })) { /* 消费同一生产计量链路。 */ }
		return { ok: true, value: { receivedAt, attempt: ctx.rsiG0.store.snapshot().attempts.at(-1) } };
	}));
}
