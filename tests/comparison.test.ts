import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, chmod, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { openStore } from '../src/store.ts';
import { sealFixture } from '../src/skills.ts';
import { checkCandidate } from '../src/candidates.ts';
import { flowTaskSchema, flowBudget } from '../src/mainflow-contracts.ts';
import { g1CommandSchema } from '../src/g1-contracts.ts';
import { comparisonBudget } from '../src/comparison-contracts.ts';
import { applyComparison } from '../src/comparison.ts';
import { requestMetrics } from '../src/comparison-metrics.ts';
import { createScenarioRegistry } from '../src/scenarios/index.ts';
import { observeUsage } from '../src/usage.ts';

async function remove(root: string) { await chmod(root, 0o700); for (const f of await readdir(root, { withFileTypes: true })) if (f.isDirectory()) await remove(join(root, f.name)); await rm(root, { recursive: true, force: true }); }
test('comparison freezes inputs, compiles both artifacts, preserves unknown usage and never selects ACTIVE', async () => {
	const root = await mkdtemp(join(tmpdir(), 'rsi-comparison-')); const before = process.env.DSH_HOME; process.env.DSH_HOME = root;
	const store = openStore(join(root, 'state.sqlite'));
	const sessions = new Map<string, string>(); const inputs: GenerateOptions[] = [];
	let mode: 'normal' | 'compile-error' | 'unknown' | 'cancel' = 'normal';
	let entered: (() => void) | undefined;
	const usage = observeUsage(store, new Set(), new Set(), new Map(), sessions);
	const ctx = {
		rsiScenarios: createScenarioRegistry(), connection: {}, effect() {}, logger: { error() {} },
		llm: { stream(options: GenerateOptions) { return usage(options, async function* (): AsyncIterable<StreamChunk> {
			inputs.push(options);
			if (mode === 'cancel') { entered?.(); await new Promise<void>((_, reject) => { const abort = () => reject(new Error('cancelled')); if (options.signal!.aborted) abort(); else options.signal!.addEventListener('abort', abort, { once: true }); }); }
			const candidate = options.sessionId!.endsWith('/candidate');
			if (mode !== 'unknown') yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 30, totalTokens: candidate ? 1200 : 2000 } };
			// 启用但无反馈的按钮仍编译通过：按本次产品决策不做行为评分。
			const text = JSON.stringify({ title: 'Fixture', html: '<h1>Preview</h1><button>Demo</button>', css: 'body { color: #222; }', javascript: mode === 'compile-error' && candidate ? 'const =' : '' });
			yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } };
		}); } },
	} as unknown as Context;
	const comparison = applyComparison(ctx, store, sessions, async () => {});
	async function task() {
		const skillId = randomUUID(); const sealed = await sealFixture(resolve('fixtures/frontend/v0'), join(root, 'rsi', 'objects'), skillId, process.cwd());
		const files = await Promise.all(sealed.snapshot.files.map(async f => ({ path: f.path, content: await readFile(join(sealed.root, f.path), 'utf8') })));
		const t = flowTaskSchema.parse({ id: randomUUID(), sessionId: 'page', turn: 1, workspaceId: 'workspace', skillId, name: 'rsi-frontend-design', baseline: sealed.snapshot, baselineRoot: sealed.root, files, brief: '页面包含标题', inherited: [], previewDigest: 'a'.repeat(64), status: 'review', preference: '紧凑', scope: 'task', paths: ['SKILL.md'], budget: flowBudget, authorization: { operationId: randomUUID(), digest: 'b'.repeat(64), confirmedAt: Date.now() }, system: 'test', input: '', deadline: Date.now() + 300000, clarifications: [], candidate: null, checks: [], error: null, chosenDigest: null, approvedDigest: null, executionSessionId: null, createdAt: Date.now() });
		Object.assign(t, await checkCandidate(t, { kind: 'candidate', reason: 'fixture', changes: [{ path: 'SKILL.md', content: files.find(f => f.path === 'SKILL.md')!.content + '\n候选版本\n' }] }, join(root, 'rsi', 'objects'), new AbortController().signal));
		store.mutateBusiness(s => { s.mainflow.tasks.push(t); }); return t;
	}
	const command = (kind: string, payload: unknown) => g1CommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.business().revision, kind, payload });
	const current = (id: string) => store.business().mainflow.tasks.find(t => t.id === id)!;
	try {
		const t = await task(); const cmd = command('flow_compare', { taskId: t.id, candidateDigest: t.candidate!.snapshot.versionDigest, budget: comparisonBudget });
		await assert.rejects(comparison.command({ ...cmd, expectedRevision: 1 }), /状态已变化/); assert.equal(inputs.length, 0);
		await comparison.command(cmd); await comparison.command(cmd); await comparison.whenIdle();
		const c = current(t.id).comparison!;
		assert.equal(c.status, 'completed'); assert.equal(inputs.length, 2); assert.equal(current(t.id).status, 'review'); assert.deepEqual(store.business().mainflow.active, []);
		const [left, right] = inputs.map(i => JSON.parse((i.messages[0]!.content[0] as { text: string }).text));
		assert.notDeepEqual(left.files, right.files); delete left.files; delete right.files; assert.deepEqual(left, right);
		assert.equal(inputs[0]!.system, inputs[1]!.system); assert.equal(inputs[0]!.maxTokens, inputs[1]!.maxTokens);
		assert.equal(requestMetrics(store.snapshot().attempts, c.id, c.runs[0].sessionId).totalTokens, 2000);
		assert.equal(requestMetrics(store.snapshot().attempts, c.id, c.runs[1].sessionId).totalTokens, 1200);
		assert.ok(c.runs.every(r => r.durationMs !== null && r.durationMs >= 0));
		const preview = await comparison.preview(t.id, 'candidate'); assert.equal(preview.status, 200); assert.match(preview.headers.get('content-security-policy')!, /sandbox allow-scripts/); assert.doesNotMatch(preview.headers.get('content-security-policy')!, /allow-same-origin/); assert.match(await preview.text(), /<button>Demo<\/button>/);
		mode = 'compile-error'; const bad = await task(); await comparison.command(command('flow_compare', { taskId: bad.id, candidateDigest: bad.candidate!.snapshot.versionDigest, budget: comparisonBudget })); await comparison.whenIdle();
		assert.equal(current(bad.id).comparison!.runs[1].status, 'failed'); assert.equal((await comparison.preview(bad.id, 'candidate')).status, 404);
		mode = 'unknown'; const unknown = await task(); const count = inputs.length; await comparison.command(command('flow_compare', { taskId: unknown.id, candidateDigest: unknown.candidate!.snapshot.versionDigest, budget: comparisonBudget })); await comparison.whenIdle();
		assert.equal(inputs.length, count + 1, 'unknown baseline usage prevents candidate dispatch'); assert.equal(requestMetrics(store.snapshot().attempts, current(unknown.id).comparison!.id).totalTokens, null);
		mode = 'cancel'; const cancelled = await task(); const started = new Promise<void>(resolve => { entered = resolve; });
		await comparison.command(command('flow_compare', { taskId: cancelled.id, candidateDigest: cancelled.candidate!.snapshot.versionDigest, budget: comparisonBudget })); await started;
		await comparison.command(command('flow_cancel_comparison', { taskId: cancelled.id })); await comparison.whenIdle();
		assert.equal(current(cancelled.id).comparison!.status, 'cancelled'); assert.equal(sessions.size, 0);
	} finally { await comparison.dispose(); store.close(); if (before === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = before; await remove(root); }
});

test('trusted scenarios extend matching and compilation without host decision authority', async () => {
	const registry = createScenarioRegistry();
	const text = registry.forSkill({ name: 'summarize-notes', description: '整理阅读笔记' }); assert.equal(text.info.id, 'text');
	assert.equal((await text.compile('一份笔记', new AbortController().signal)).kind, 'text');
	const stop = registry.register({ info: { id: 'json-report', version: '1', label: 'JSON 报告', kind: 'text' }, matchesSkill: s => s.name === 'json-report', matchesRequest: () => false, instructions: '返回 JSON', async compile(output) { JSON.parse(output); return { kind: 'text', content: output, detail: 'JSON 解析通过' }; } });
	assert.equal(registry.forSkill({ name: 'json-report', description: '' }).info.id, 'json-report');
	await assert.rejects(registry.get('json-report').compile('{bad', new AbortController().signal));
	assert.throws(() => registry.get('json-report', '2'), /changed/); stop(); assert.throws(() => registry.get('json-report'), /unavailable/);
});
