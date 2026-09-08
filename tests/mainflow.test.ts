import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, chmod, readdir, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore } from '../src/store.ts';
import { sealFixture } from '../src/skills.ts';
import { checkCandidate, generationInput } from '../src/mainflow.ts';
import { flowTaskSchema, flowBudget, type FlowTask } from '../src/mainflow-contracts.ts';
import { emptyTokens, type Attempt } from '../src/contracts.ts';

async function writable(root: string) { await chmod(root, 0o700); for (const e of await readdir(root, { withFileTypes: true })) if (e.isDirectory()) await writable(join(root, e.name)); }
async function fixture(dir: string, source = resolve('fixtures/frontend/v0')): Promise<FlowTask> {
	const skillId = randomUUID(); const sealed = await sealFixture(source, join(dir, 'objects'), skillId, process.cwd());
	return flowTaskSchema.parse({ id: randomUUID(), sessionId: 'page', turn: 1, workspaceId: 'workspace', skillId, name: 'rsi-frontend-design', baseline: sealed.snapshot, baselineRoot: sealed.root, files: await Promise.all(sealed.snapshot.files.map(async f => ({ path: f.path, content: await readFile(join(sealed.root, f.path), 'utf8') }))), brief: '设计页面', inherited: [], previewDigest: 'a'.repeat(64), status: 'generating', preference: '紧凑', scope: 'task', paths: ['SKILL.md'], budget: flowBudget, authorization: { operationId: randomUUID(), digest: 'b'.repeat(64), confirmedAt: Date.now() }, system: 'test', input: '', deadline: Date.now() + 300000, clarifications: [], candidate: null, checks: [], error: null, chosenDigest: null, approvedDigest: null, executionSessionId: null, createdAt: Date.now() });
}
test('candidate rejects missing, corrupt, duplicate and unauthorized replacements while preserving complete baseline', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'rsi-candidate-'));
	try {
		const task = await fixture(dir); const original = task.files.find(f => f.path === 'SKILL.md')!.content;
		const candidate = (changes: unknown[]) => ({ kind: 'candidate', reason: 'test', changes });
		const check = (raw: unknown, input = task, signal = new AbortController().signal) => checkCandidate(input, raw, join(dir, 'objects'), signal);
		await assert.rejects(check(candidate([{ path: '../SKILL.md', content: 'bad' }])), /未授权/);
		await assert.rejects(check(candidate([{ path: 'SKILL.md', content: 'bad' }, { path: 'SKILL.md', content: 'bad' }])), /重复/);
		await assert.rejects(check(candidate([{ path: 'SKILL.md', content: '' }])), /为空/);
		await assert.rejects(check(candidate([{ path: 'SKILL.md', content: original }])), /未实际改变/);
		await assert.rejects(check(candidate([{ path: 'SKILL.md', content: 'metadata removed' }])), /元数据/);
		const valid = candidate([{ path: 'SKILL.md', content: original + '\n新的偏好指导\n' }]);
		const checked = await check(valid);
		for (const f of task.baseline.files.filter(f => f.path !== 'SKILL.md')) assert.deepEqual(checked.candidate.snapshot.files.find(c => c.path === f.path), f);
		assert.equal(await readFile(join(task.baselineRoot, 'SKILL.md'), 'utf8'), original);
		assert.equal(checked.checks.filter(c => c.status === 'failed').length, 0);
		const corrupted = structuredClone(task); corrupted.files[0]!.content += 'tampered';
		await assert.rejects(check(valid, corrupted), /冻结清单/);
		await assert.rejects(check(valid, task, AbortSignal.abort(new Error('cancelled'))), /cancelled/);
		assert.equal((await readdir(join(dir, 'objects'))).some(p => p.startsWith('.candidate-')), false);
	} finally { await writable(dir); await rm(dir, { recursive: true, force: true }); }
});

test('generation budget, interruption and v4 migration preserve authorization and uncertain usage', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'rsi-flow-store-')); const file = join(dir, 'state.sqlite');
	let store = openStore(file);
	try {
		const task = await fixture(dir); task.input = generationInput(task); task.budget.maxRequests = 1;
		store.mutateBusiness(s => { s.mainflow.tasks.push(task); });
		const attempt: Attempt = { schemaVersion: 1, attemptId: randomUUID(), revision: 1, owner: 'rsi', ownerId: task.id, sessionId: `rsi-generation/${task.id}`, purpose: 'generation', callKind: 'agent', retryOfAttemptId: null, provider: task.budget.provider, model: task.budget.model, providerRequestId: null, state: 'reserved', createdAt: Date.now(), startedAt: null, endedAt: null, usageState: 'pending', tokens: emptyTokens(), usageSource: null, diagnostic: null };
		store.reserve(attempt);
		await assert.rejects(async () => store.reserve({ ...attempt, attemptId: randomUUID() }), /尚未结算/);
		store.close(); store = openStore(file);
		assert.equal(store.snapshot().attempts[0]!.state, 'interrupted');
		assert.equal(store.snapshot().attempts[0]!.usageState, 'unknown');
		assert.equal(store.business().mainflow.tasks[0]!.status, 'failed');
		assert.deepEqual(store.business().mainflow.tasks[0]!.authorization, task.authorization);
		assert.throws(() => store.reserve({ ...attempt, attemptId: randomUUID() }), /尚未确认或已停止/);
		store.mutateBusiness(s => { s.mainflow.tasks[0]!.status = 'generating'; });
		assert.throws(() => store.reserve({ ...attempt, attemptId: randomUUID() }), /尚未结算/);
		const old = store.snapshot().attempts[0]!;
		store.settle({ ...old, revision: old.revision + 1, usageState: 'confirmed', tokens: { ...emptyTokens(), total: 15 } });
		assert.throws(() => store.reserve({ ...attempt, attemptId: randomUUID() }), /停止阈值/);
		store.close();
		const raw = new DatabaseSync(file); const before = JSON.parse(String(raw.prepare('SELECT data FROM g1_state').get()!.data)); delete before.mainflow;
		raw.prepare('UPDATE g1_state SET data=?').run(JSON.stringify(before)); raw.exec('PRAGMA user_version=4'); const preserved = raw.prepare('SELECT data FROM attempts').get()!.data; raw.close();
		store = openStore(file); assert.deepEqual(store.business().mainflow, { tasks: [], preferences: [], active: [] }); store.close();
		const after = new DatabaseSync(file); assert.equal(after.prepare('PRAGMA user_version').get()!.user_version, 5); assert.equal(after.prepare('SELECT data FROM attempts').get()!.data, preserved);
		assert.deepEqual(JSON.parse(String(after.prepare('SELECT data FROM g1_state').get()!.data)).mainflow, { tasks: [], preferences: [], active: [] });
		after.exec('PRAGMA user_version=4'); after.prepare('UPDATE attempts SET data=?').run('{bad'); after.close();
		assert.throws(() => openStore(file));
		const failed = new DatabaseSync(file); assert.equal(failed.prepare('PRAGMA user_version').get()!.user_version, 4); failed.close();
	} finally { try { store.close(); } catch {} await writable(dir); await rm(dir, { recursive: true, force: true }); }
});


test('script candidates fail closed when Docker cannot start and never execute on the host', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'rsi-script-')); const before = process.env.RSI_DOCKER_BIN;
	try {
		const source = join(dir, 'source'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), '# Script fixture');
		await writeFile(join(source, 'check.sh'), '#!/bin/sh\nprintf ok\n');
		const task = await fixture(dir, source); task.paths = ['check.sh'];
		process.env.RSI_DOCKER_BIN = join(dir, 'missing-docker');
		const marker = join(dir, 'must-not-exist');
		await assert.rejects(checkCandidate(task, { kind: 'candidate', reason: 'script', changes: [{ path: 'check.sh', content: `#!/bin/sh\ntouch '${marker}'\n` }] }, join(dir, 'objects'), new AbortController().signal), /ENOENT/);
		await assert.rejects(access(marker));
		assert.equal((await readdir(join(dir, 'objects'))).some(p => p.startsWith('.candidate-')), false);
	} finally { if (before === undefined) delete process.env.RSI_DOCKER_BIN; else process.env.RSI_DOCKER_BIN = before; await writable(dir); await rm(dir, { recursive: true, force: true }); }
});
