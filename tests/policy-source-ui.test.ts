import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import files from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { openStore, type Store } from '../src/store.ts';
import { policyCommandSchema, policySessionId, type PolicyCommand } from '../src/policy-review-contracts.ts';
import { preparePolicyReviewFixture, policyReviewRuntime } from '../scripts/policy-review-fixture.ts';

const seed = mkdtempSync(join(tmpdir(), 'rsi-source-seed-'));
before(async () => { await preparePolicyReviewFixture(join(seed, 'state.sqlite')); });
after(() => rmSync(seed, { recursive: true, force: true }));
function input(store: Store, kind: PolicyCommand['kind'], payload: PolicyCommand['payload']) { return policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload }); }
function adoption(store: Store, choice: 'baseline' | 'candidate' = 'baseline') {
	const view = store.policyReview().reviews[0]; return input(store, 'policy_adopt', { workspaceId: 'workspace', policyId: view.policyId, batchId: view.batchId, baselineDigest: view.baselineDigest, candidateDigest: view.candidateDigest, evidenceDigest: view.evidenceDigest!, choice, expectedActive: store.policySelection('workspace')?.id ?? null });
}
async function setup() {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'rsi-source-ui-'))); cpSync(seed, root, { recursive: true }); mkdirSync(join(root, '.git')); writeFileSync(join(root, 'evidence.ts'), 'export const sourceVersion = "first";\n');
	const file = join(root, 'state.sqlite'); const store = openStore(file); store.policyCommand(adoption(store), root);
	const runtime = await policyReviewRuntime(store, root);
	return { root, file, store, runtime, async close() { if (runtime.ctx.agents) await runtime.dispose(); try { store.close(); } catch {} rmSync(root, { recursive: true, force: true }); } };
}
function preview(store: Store, paths = ['evidence.ts']) { return input(store, 'policy_preview', { workspaceId: 'workspace', expectedActive: store.policySelection('workspace')!.id, paths }); }
function sourceCommand(store: Store, kind: 'policy_seal' | 'policy_source_session', id: string) {
	const source = store.policySource(id)!; return input(store, kind, { workspaceId: 'workspace', expectedActive: source.choiceId, sourceId: id, snapshotDigest: source.conditions.sourceSnapshot!.digest });
}
async function sealed(f: Awaited<ReturnType<typeof setup>>) { const receipt = await f.runtime.review.command(preview(f.store)); await f.runtime.review.command(sourceCommand(f.store, 'policy_seal', receipt.focusId!)); return receipt.focusId!; }

test('sidebar commands preview full exact bytes for free, require confirmation, and exclude sensitive selections', async () => {
	const f = await setup();
	try {
		const attempts = f.store.snapshot().attempts;
		for (const paths of [['.env'], ['evidence.ts', '.git/config'], ['../outside'], ['missing']]) await assert.rejects(async () => f.runtime.review.command(preview(f.store, paths)));
		writeFileSync(join(f.root, 'hidden.ts'), 'const apiKey = "SYNTHETIC_PRIVATE";'); await assert.rejects(f.runtime.review.command(preview(f.store, ['hidden.ts'])), error => error instanceof Error && !error.message.includes('SYNTHETIC_PRIVATE'));
		assert.equal(f.store.policyReview().sources.length, 0); assert.equal(existsSync(join(f.root, 'repository-snapshots')), false);
		const cmd = preview(f.store); const receipt = await f.runtime.review.command(cmd); const source = f.runtime.review.source({ workspaceId: 'workspace', sourceId: receipt.focusId! });
		assert.equal(source.status, 'preview'); assert.equal(source.conditions.files[0].content, readFileSync(join(f.root, 'evidence.ts'), 'utf8')); assert.equal(existsSync(join(f.root, 'repository-snapshots')), false);
		assert.equal(JSON.stringify(f.store.policyReview().sources).includes('sourceVersion'), false, 'Polling metadata does not serialize source bodies');
		await assert.rejects(f.runtime.review.command(sourceCommand(f.store, 'policy_source_session', source.id)), /封存/);
		assert.throws(() => f.runtime.review.source({ workspaceId: 'other', sourceId: source.id }), /本工作区/);
		assert.deepEqual(await f.runtime.review.command(cmd), receipt); assert.equal(f.store.policyReview().sources.length, 1);
		await f.runtime.review.command(sourceCommand(f.store, 'policy_seal', source.id)); assert.equal(f.store.policySource(source.id)!.status, 'sealed');
		const made = await f.runtime.review.command(sourceCommand(f.store, 'policy_source_session', source.id)); const session = f.store.policySession(policySessionId(made.focusId!))!;
		assert.equal(session.sourceId, source.id); assert.equal(f.runtime.requests.length, 0); assert.deepEqual(f.store.snapshot().attempts, attempts);
		assert.equal(policyCommandSchema.safeParse({ ...preview(f.store), payload: { ...preview(f.store).payload, root: '/elsewhere' } }).success, false);
	} finally { await f.close(); }
});

test('changed worktree, exact digest, active choice, global revision and workspace conflicts cannot seal a stale preview', async () => {
	const f = await setup();
	try {
		const sourceId = (await f.runtime.review.command(preview(f.store))).focusId!; const seal = sourceCommand(f.store, 'policy_seal', sourceId);
		writeFileSync(join(f.root, 'evidence.ts'), 'export const sourceVersion = "second";\n');
		await assert.rejects(f.runtime.review.command(seal), /源码已变化/); assert.equal(f.store.policySource(sourceId)!.status, 'preview');
		await assert.rejects(f.runtime.review.command({ ...seal, operationId: randomUUID(), payload: { ...seal.payload, snapshotDigest: 'a'.repeat(64) } }), /快照或版本/);
		const newPreview = preview(f.store); await f.runtime.review.command(newPreview);
		await assert.rejects(f.runtime.review.command(seal), /状态已变化/);
		f.store.policyCommand(adoption(f.store, 'candidate'), f.root);
		await assert.rejects(f.runtime.review.command(sourceCommand(f.store, 'policy_seal', sourceId)), /已采纳版本/);
		assert.throws(() => f.store.policyCommand(preview(f.store), '/moved'), /路径已经变化/);
		assert.equal(f.store.policyReview().sources.every(row => row.status === 'preview'), true); assert.equal(f.runtime.requests.length, 0);
	} finally { await f.close(); }
});

test('old unused sessions retain their original source through newer snapshots, restart and later worktree edits', { timeout: 10000 }, async () => {
	const f = await setup(); let runtime = f.runtime; let store = f.store;
	try {
		const a = await sealed(f); const first = await runtime.review.command(sourceCommand(store, 'policy_source_session', a)); const old = store.policySession(policySessionId(first.focusId!))!;
		assert.equal(runtime.requests.length, 0); await runtime.dispose(); store.close();
		store = openStore(f.file); runtime = await policyReviewRuntime(store, f.root); const next = { ...f, store, runtime };
		writeFileSync(join(f.root, 'evidence.ts'), 'export const sourceVersion = "second";\n'); const b = await sealed(next); const second = await runtime.review.command(sourceCommand(store, 'policy_source_session', b));
		writeFileSync(join(f.root, 'evidence.ts'), 'export const sourceVersion = "live-third";\n');
		await runtime.review.open(old.sessionId);
		for (const id of [old.sessionId, policySessionId(second.focusId!)]) {
			const agent = runtime.ctx.agents.get(SessionId(id))!; agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Read the frozen source and cite it.' }] })); await agent.whenIdle();
			assert.equal(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')?.data.reason.kind, 'completed');
			const requests = runtime.requests.filter(row => row.sessionId === id); assert.equal(requests.length, 3);
			const messages = JSON.stringify(requests.at(-1)!.messages); assert.ok(messages.includes(id === old.sessionId ? 'first' : 'second')); assert.equal(messages.includes('live-third'), false);
			assert.equal(runtime.ctx.agents.get(SessionId(id))!.session.snapshotEvents().filter(event => event.type === 'tool/result').length, 2);
		}
		assert.deepEqual(store.policySession(old.sessionId), old); assert.notEqual(store.policySessionRun(old.sessionId)!.conditionsDigest, store.policySessionRun(policySessionId(second.focusId!))!.conditionsDigest);
		const daily = store.snapshot().attempts.filter(row => row.purpose === 'daily'); assert.equal(daily.length, 6); assert.ok(daily.every(row => row.owner === 'session' && row.ownerId === row.sessionId && row.usageState === 'confirmed')); assert.equal(daily.reduce((sum, row) => sum + row.tokens.total!, 0), 90);
		rmSync(join(f.root, 'evidence.ts')); assert.ok(store.policySessionRun(old.sessionId)!.conditions.files[0].content.includes('first'));
	} finally { await runtime.dispose(); store.close(); await f.close(); }
});

test('capture rechecks state after async reads, and disposal aborts owned capture work before closing descriptors', async t => {
	const f = await setup(); const original = files.open;
	try {
		let release!: () => void; let entered!: () => void; const ready = new Promise<void>(resolve => entered = resolve); const gate = new Promise<void>(resolve => release = resolve);
		const spy = t.mock.method(files, 'open', async (...args: Parameters<typeof files.open>) => { if (args[0] === join(f.root, 'evidence.ts')) { entered(); await gate; } return original(...args); }); syncBuiltinESMExports();
		const pending = f.runtime.review.command(preview(f.store)); const rejected = assert.rejects(pending, /状态已变化/); await ready;
		const snapshot = f.store.snapshot(); f.store.command({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: snapshot.snapshotRevision, probeId: snapshot.probeId, kind: 'set_marker', payload: { marker: 'Concurrent state' } }); release(); await rejected; spy.mock.restore(); syncBuiltinESMExports();
		assert.equal(f.store.policyReview().sources.length, 0);
		let movedRelease!: () => void; let movedEntered!: () => void; const movedReady = new Promise<void>(resolve => movedEntered = resolve); const movedGate = new Promise<void>(resolve => movedRelease = resolve);
		const movedSpy = t.mock.method(files, 'open', async (...args: Parameters<typeof files.open>) => { movedEntered(); await movedGate; return original(...args); }); syncBuiltinESMExports();
		const list = f.runtime.ctx.workspaceRegistry.list; const workspace = list()[0];
		const moved = assert.rejects(f.runtime.review.command(preview(f.store)), /工作区.*变化/); await movedReady;
		f.runtime.ctx.workspaceRegistry.list = () => [{ ...workspace, path: join(f.root, 'moved') }]; movedRelease(); await moved;
		f.runtime.ctx.workspaceRegistry.list = list; movedSpy.mock.restore(); syncBuiltinESMExports(); assert.equal(f.store.policyReview().sources.length, 0);
		let releaseAbort!: () => void; let enteredAbort!: () => void; const abortReady = new Promise<void>(resolve => enteredAbort = resolve); const abortGate = new Promise<void>(resolve => releaseAbort = resolve); let handle: Awaited<ReturnType<typeof files.open>> | undefined;
		t.mock.method(files, 'open', async (...args: Parameters<typeof files.open>) => { enteredAbort(); await abortGate; handle = await original(...args); return handle; }); syncBuiltinESMExports();
		const aborted = assert.rejects(f.runtime.review.command(preview(f.store)), /aborted/); await abortReady; const stopped = f.runtime.review.dispose(); releaseAbort(); await aborted; await stopped;
		assert.equal(handle!.fd, -1); assert.equal(f.store.policyReview().sources.length, 0); assert.equal(f.runtime.requests.length, 0);
	} finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.close(); }
});

test('publication followed by transaction failure leaves preview recoverable; lost replies and provisioning failure reuse exact intent', async () => {
	const f = await setup(); let runtime = f.runtime; let store = f.store;
	try {
		const sourceId = (await runtime.review.command(preview(store))).focusId!; const seal = sourceCommand(store, 'policy_seal', sourceId);
		await runtime.dispose(); store.close(); let db = new DatabaseSync(f.file); db.exec("CREATE TRIGGER fail_source BEFORE UPDATE OF data ON policy_sources BEGIN SELECT RAISE(ABORT,'Controlled source failure'); END;"); db.close();
		store = openStore(f.file); runtime = await policyReviewRuntime(store, f.root);
		await assert.rejects(runtime.review.command(seal), /Controlled source failure/); assert.equal(store.policySource(sourceId)!.status, 'preview'); assert.equal(store.businessReceipt(seal), undefined);
		const digest = store.policySource(sourceId)!.conditions.sourceSnapshot!.digest; const object = join(f.root, 'repository-snapshots', `${digest}.json`); assert.equal(existsSync(object), true); const bytes = readFileSync(object);
		await runtime.dispose(); store.close(); db = new DatabaseSync(f.file); db.exec('DROP TRIGGER fail_source'); db.close(); store = openStore(f.file); runtime = await policyReviewRuntime(store, f.root);
		const receipt = await runtime.review.command(seal); assert.equal(store.policySource(sourceId)!.status, 'sealed'); assert.deepEqual(readFileSync(object), bytes);
		rmSync(join(f.root, 'evidence.ts')); assert.deepEqual(await runtime.review.command(seal), receipt, 'Lost reply returns receipt without recapturing deleted source');
		const make = sourceCommand(store, 'policy_source_session', sourceId); const workspace = runtime.ctx.workspaceRegistry.list()[0]; const attach = workspace.attachSession;
		runtime.ctx.workspaceRegistry.list = () => [workspace];
		workspace.attachSession = async () => { throw new Error('Controlled attachment failure'); };
		await assert.rejects(runtime.review.command(make), /Controlled attachment failure/); const bound = store.policyReview().sessions[0]; assert.ok(bound.sourceId); assert.equal(runtime.requests.length, 0);
		workspace.attachSession = attach; const created = await runtime.review.command(make); assert.equal(policySessionId(created.focusId!), bound.sessionId); assert.equal(store.policyReview().sessions.length, 1);
		assert.equal(runtime.ctx.agents.roots().length, 1);
	} finally { await runtime.dispose(); store.close(); await f.close(); }
});

test('process loss after session intent commits recovers the exact binding; missing/corrupt objects never fall back', async () => {
	const f = await setup(); let runtime = f.runtime; let store = f.store;
	try {
		const id = await sealed(f); const make = sourceCommand(store, 'policy_source_session', id); await runtime.dispose(); store.close();
		const script = `import {openStore} from ${JSON.stringify(new URL('../src/store.ts', import.meta.url).href)}; const store=openStore(process.argv[1]); store.policyCommand(JSON.parse(process.argv[2]),process.argv[3]); process.exit(77);`;
		const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.file, JSON.stringify(make), f.root], { encoding: 'utf8' }); assert.equal(child.status, 77, child.stderr);
		store = openStore(f.file); runtime = await policyReviewRuntime(store, f.root); const receipt = await runtime.review.command(make); const binding = store.policySession(policySessionId(receipt.focusId!))!;
		assert.equal(store.policyReview().sessions.length, 1); assert.equal(binding.sourceId, id); assert.equal(runtime.requests.length, 0);
		const path = join(f.root, 'repository-snapshots', `${store.policySource(id)!.conditions.sourceSnapshot!.digest}.json`); const bytes = readFileSync(path); rmSync(path);
		assert.throws(() => store.policySessionRun(binding.sessionId), /ENOENT/); await assert.rejects(runtime.review.command(sourceCommand(store, 'policy_source_session', id)), /ENOENT/);
		const agent = runtime.ctx.agents.get(SessionId(binding.sessionId))!; agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Read the confirmed source.' }] })); await agent.whenIdle(); assert.equal(runtime.requests.length, 0, 'Missing object is denied before adapter dispatch, even for an already installed Agent');
		writeFileSync(path, 'damaged', { mode: 0o444 }); assert.throws(() => store.policySessionRun(binding.sessionId), /JSON/);
		chmodSync(path, 0o600); writeFileSync(path, bytes); chmodSync(path, 0o444); assert.equal(store.policySessionRun(binding.sessionId)!.conditionsDigest, binding.conditionsDigest);
	} finally { await runtime.dispose(); store.close(); await f.close(); }
});

test('new source persistence preserves legacy session bytes and rejects corrupt provenance without clearing history', async () => {
	const f = await setup();
	try {
		const legacy = f.store.policyCommand(input(f.store, 'policy_session', { workspaceId: 'workspace', expectedActive: f.store.policySelection('workspace')!.id }), f.root);
		const id = await sealed(f); await f.runtime.review.command(sourceCommand(f.store, 'policy_source_session', id));
		assert.equal('sourceId' in f.store.policySession(policySessionId(legacy.focusId!))!, false);
		await f.runtime.dispose(); f.store.close();
		const read = () => { const db = new DatabaseSync(f.file, { readOnly: true }); try { return Object.fromEntries(['g1_state', 'attempts', 'policy_batches', 'policy_choices', 'policy_sessions', 'policy_sources', 'g1_operations'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])); } finally { db.close(); } };
		const before = read(); const reopened = openStore(f.file); reopened.close(); assert.deepEqual(read(), before);
		for (const field of ['choiceId', 'conditions', 'sealId']) {
			let db = new DatabaseSync(f.file); const row = db.prepare('SELECT data FROM policy_sources WHERE id=?').get(id)!; const source = JSON.parse(String(row.data));
			if (field === 'conditions') source.conditions.files[0].content = 'tampered'; else source[field] = randomUUID();
			db.prepare('UPDATE policy_sources SET data=? WHERE id=?').run(JSON.stringify(source), id); db.close(); const corrupt = read();
			assert.throws(() => openStore(f.file)); assert.deepEqual(read(), corrupt, 'Failed startup must retain even the invalid row for recovery');
			db = new DatabaseSync(f.file); db.prepare('UPDATE policy_sources SET data=? WHERE id=?').run(String(row.data), id); db.close(); assert.deepEqual(read(), before);
		}
	} finally { await f.close(); }
});
