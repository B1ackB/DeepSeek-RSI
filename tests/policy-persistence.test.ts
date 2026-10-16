import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, chmodSync, symlinkSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { openStore, type Store } from '../src/store.ts';
import { emptyTokens, type Attempt } from '../src/contracts.ts';
import { initialG1State } from '../src/g1-contracts.ts';
import { freezePolicyRun, policyDigest, type PolicyBatchInput, type PolicyRun } from '../src/policy-contracts.ts';
import { readPolicy, sealPolicy } from '../src/policy-versions.ts';
import { observeUsage } from '../src/usage.ts';
import { policyUsage } from '../src/policy.ts';
import { flowTaskSchema, flowBudget } from '../src/mainflow-contracts.ts';
import { comparisonBudget } from '../src/comparison-contracts.ts';

const policy = (instructions = 'Search and read source before answering.\r\n保留原文。') => ({ schemaVersion: 1, kind: 'repository-evidence-policy', instructions });
function frozen(instructions?: string) {
	return freezePolicyRun(policy(instructions), { schemaVersion: 1, question: 'Explain total.', files: [{ path: 'sample.js', content: 'export const total = 1;' }], provider: 'rsi-policy-fixture', model: 'offline-v1', budget: { maxRequests: 3, maxOutputTokens: 128, maxInputBytes: 4096, tokenStopThreshold: 100, maxToolCalls: 4, maxToolResultBytes: 1024, maxDurationMs: 30000 } });
}
function batch(store: Store, budget: Partial<PolicyBatchInput['budget']> = {}) {
	const policyId = randomUUID(); const baseline = frozen(); const candidate = frozen('Read and cite implementation.');
	store.sealPolicyVersion(policyId, baseline.policy); store.sealPolicyVersion(policyId, candidate.policy, baseline.policyDigest);
	const input: PolicyBatchInput = { id: randomUUID(), policyId, runtimeDigest: 'a'.repeat(64), runs: [{ side: 'baseline', run: baseline }, { side: 'candidate', run: candidate }], budget: { maxRequests: 6, tokenStopThreshold: 200, maxDurationMs: 60000, ...budget } };
	store.authorizePolicyBatch(input); return input;
}
function attempt(change: Partial<Attempt> = {}): Attempt {
	return { schemaVersion: 1, attemptId: randomUUID(), revision: 1, owner: 'session', ownerId: 'daily', sessionId: 'daily', purpose: 'daily', callKind: 'agent', retryOfAttemptId: null, provider: 'offline', model: 'offline', providerRequestId: null, state: 'reserved', createdAt: 1, startedAt: null, endedAt: null, usageState: 'pending', tokens: emptyTokens(), usageSource: null, diagnostic: null, ...change };
}
const usage = (total = 10): StreamChunk => ({ type: 'usage', usage: { inputTokens: total - 2, outputTokens: 2, totalTokens: total } });
const finish: StreamChunk = { type: 'finish', reason: { kind: 'stop' } };
function options(run: PolicyRun): GenerateOptions { return { sessionId: SessionId(run.runId), provider: run.conditions.provider, model: run.conditions.model, maxTokens: run.conditions.budget.maxOutputTokens, system: 'fixed', tools: [], messages: [] }; }
async function consume(store: Store, run: PolicyRun, chunks: StreamChunk[], dispatch: () => void = () => {}, change: Partial<GenerateOptions> = {}) {
	const observe = policyUsage(store, run, 'fixed', []);
	for await (const _ of observe({ ...options(run), ...change }, async function* () { dispatch(); yield* chunks; })) { /* Exercise the same observer with a fixed offline stream. */ }
}
function temporary() { return mkdtempSync(join(tmpdir(), 'rsi-policy-store-')); }

test('policy objects seal canonical bytes without replacement and preserve parent provenance', () => {
	const dir = temporary(); const objects = join(dir, 'policies'); const store = openStore(join(dir, 'state.sqlite'));
	try {
		const id = randomUUID(); const content = policy(); const digest = policyDigest(content);
		const first = store.sealPolicyVersion(id, content); const bytes = readFileSync(join(objects, `${digest}.json`));
		assert.deepEqual(bytes, Buffer.from(JSON.stringify(content))); assert.equal(statSync(join(objects, `${digest}.json`)).mode & 0o222, 0);
		assert.deepEqual(store.sealPolicyVersion(id, content), first); assert.deepEqual(readPolicy(objects, digest), content);
		const next = store.sealPolicyVersion(id, policy('Second version'), digest);
		assert.equal(next.parentDigest, digest); assert.equal(store.policyVersions(id).length, 2);
		assert.throws(() => store.sealPolicyVersion(id, content, next.digest), /provenance/);
		assert.throws(() => store.sealPolicyVersion(id, policy('Missing parent')), /registered parent/);
		assert.throws(() => store.sealPolicyVersion(randomUUID(), policy('Other lineage'), digest), /registered parent/);
		assert.deepEqual(readFileSync(join(objects, `${digest}.json`)), bytes);
		assert.equal(readdirSync(objects).some(name => name.startsWith('.seal-')), false);
		chmodSync(join(objects, `${digest}.json`), 0o644);
		assert.throws(() => readPolicy(objects, digest), /read-only/);
		writeFileSync(join(objects, `${digest}.json`), '{}'); chmodSync(join(objects, `${digest}.json`), 0o444);
		assert.throws(() => sealPolicy(objects, content)); assert.equal(readFileSync(join(objects, `${digest}.json`), 'utf8'), '{}');
	} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('policy object reads reject missing, symlinked, noncanonical and oversized files', () => {
	const dir = temporary(); const objects = join(dir, 'policies'); mkdirSync(objects);
	try {
		const content = policy(); const digest = policyDigest(content); const path = join(objects, `${digest}.json`);
		assert.throws(() => readPolicy(objects, '../escape'));
		assert.throws(() => readPolicy(objects, digest), /ENOENT/);
		writeFileSync(join(dir, 'outside'), JSON.stringify(content), { mode: 0o444 }); symlinkSync(join(dir, 'outside'), path);
		assert.throws(() => readPolicy(objects, digest)); unlinkSync(path);
		for (const bytes of [JSON.stringify(content, null, 2), JSON.stringify(policy('Changed')), 'x'.repeat(65537)]) {
			writeFileSync(path, bytes, { mode: 0o444 }); assert.throws(() => readPolicy(objects, digest)); unlinkSync(path);
		}
		symlinkSync(objects, join(dir, 'alias')); assert.throws(() => sealPolicy(join(dir, 'alias'), content), /symlink/);
		assert.equal(readdirSync(objects).length, 0);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

const legacyTables = ['state', 'operations', 'attempts', 'bindings', 'g1_state', 'g1_operations'];
function rawRows(db: DatabaseSync) { return Object.fromEntries(legacyTables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])); }
function legacy(file: string) {
	// Explicit v6 layout, never created by the v7 opener or copied from a user's home.
	const db = new DatabaseSync(file);
	db.exec(`CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL);
		CREATE TABLE attempts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE bindings (session TEXT NOT NULL, skill TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session,skill));
		CREATE TABLE g1_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE g1_operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL); PRAGMA user_version=6;`);
	const state = { schemaVersion: 1, probeId: randomUUID(), snapshotRevision: 9, updatedAt: 1, marker: 'Historical 原文', cancelled: false, budgetStartedAt: null };
	const old = attempt({ state: 'succeeded', revision: 4, startedAt: 1, endedAt: 2, usageState: 'confirmed', tokens: { ...emptyTokens(), total: 17 } });
	const uncertain = attempt({ sessionId: 'uncertain', ownerId: 'uncertain', state: 'interrupted', revision: 4, startedAt: 1, endedAt: 2, usageState: 'unknown', tokens: { ...emptyTokens(), total: 11 }, diagnostic: 'conflicting_provider_usage' });
	const skillId = randomUUID(); const business = initialG1State(); business.revision = 12;
	const snapshot = { schemaVersion: 1 as const, skillId, workspaceRoot: '/fixture', sourceRoot: '/fixture/skill', versionDigest: 'b'.repeat(64), files: [{ path: 'SKILL.md', contentDigest: 'c'.repeat(64), executable: false }] };
	business.skills.push({ id: skillId, revision: 1, name: 'historical-skill', provider: 'directory', workspaceId: 'fixture', scopeSessionId: null, snapshot, objectRoot: '/fixture/objects', observing: false, sourceState: 'matching', sourceError: null, createdAt: 1 });
	business.mainflow.preferences.push({ scenarioId: 'frontend', workspaceId: 'fixture', scope: 'project', value: '历史偏好' });
	business.sessions.push({ sessionId: 'daily', lastSeq: 3, skills: [{ skillId, versionDigest: snapshot.versionDigest }] });
	const comparisonId = randomUUID(); const scenario = { id: 'text', version: '1', label: 'Text', kind: 'text' as const };
	business.mainflow.tasks.push(flowTaskSchema.parse({ id: randomUUID(), sessionId: 'historical', turn: 1, workspaceId: 'fixture', skillId, name: 'historical-skill', scenario, baseline: snapshot, baselineRoot: '/fixture/objects', files: [{ path: 'SKILL.md', content: '# Historical' }], brief: 'Historical task', inherited: [], previewDigest: 'd'.repeat(64), status: 'stopped', preference: 'Keep history', scope: 'task', paths: ['SKILL.md'], budget: flowBudget, authorization: { operationId: randomUUID(), digest: 'd'.repeat(64), confirmedAt: 1 }, system: 'Historical system', input: 'Historical input', deadline: 300001, clarifications: [], candidate: { snapshot, root: '/fixture/candidate', changes: [{ path: 'SKILL.md', content: '# Candidate' }], reason: 'Historical reason' }, checks: [], error: null, chosenDigest: null, approvedDigest: null, executionSessionId: null, createdAt: 1,
		comparison: { id: comparisonId, operationId: randomUUID(), authorizedAt: 1, deadline: 600001, scenario, system: 'Historical comparison', budget: comparisonBudget, status: 'completed', runs: ['baseline', 'candidate'].map(side => ({ side, versionDigest: snapshot.versionDigest, sessionId: `rsi-comparison/${comparisonId}/${side}`, input: 'Historical input', status: 'passed', startedAt: 1, endedAt: 2, durationMs: 1, artifact: { digest: 'e'.repeat(64), kind: 'text', detail: 'Historical text' }, error: null })) },
	}));
	const command = { schemaVersion: 1, operationId: randomUUID(), kind: 'set_marker', probeId: state.probeId, expectedRevision: 8, payload: { marker: state.marker } };
	const g1Command = { schemaVersion: 1, operationId: randomUUID(), expectedRevision: 11, kind: 'observe', payload: { skillId, enabled: false } };
	const json = (value: unknown) => JSON.stringify(value, null, '\t') + '\n';
	db.prepare('INSERT INTO state VALUES (1,?)').run(json(state)); db.prepare('INSERT INTO g1_state VALUES (1,?)').run(json(business));
	for (const row of [old, uncertain]) db.prepare('INSERT INTO attempts VALUES (?,?)').run(row.attemptId, json(row));
	db.prepare('INSERT INTO bindings VALUES (?,?,?)').run('daily', skillId, json({ schemaVersion: 1, sessionId: 'daily', skillId, versionDigest: snapshot.versionDigest, boundAt: 1 }));
	db.prepare('INSERT INTO operations VALUES (?,?,?)').run(command.operationId, json(command), json({ ...state, attempts: [old] }));
	db.prepare('INSERT INTO g1_operations VALUES (?,?,?)').run(g1Command.operationId, json(g1Command), json({ revision: 12, focusId: skillId }));
	return db;
}

test('populated v6 migration appends tables and retains every historical row and artifact byte', () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); let db = legacy(file);
	const before = rawRows(db); db.close();
	const artifact = join(dir, 'objects', 'original', 'SKILL.md'); mkdirSync(join(dir, 'objects', 'original'), { recursive: true });
	const bytes = Buffer.from('# 历史 Skill\r\n'); writeFileSync(artifact, bytes, { mode: 0o444 });
	try {
		const store = openStore(file);
		assert.equal(store.business().skills[0].name, 'historical-skill'); assert.equal(store.snapshot().attempts[1].usageState, 'unknown');
		assert.equal(store.business().mainflow.tasks[0].comparison!.status, 'completed');
		assert.equal(store.business().mainflow.tasks[0].authorization!.confirmedAt, 1);
		assert.deepEqual(store.policyVersions(randomUUID()), []); store.close();
		db = new DatabaseSync(file); assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 7);
		assert.deepEqual(rawRows(db), before); assert.equal(db.prepare('SELECT count(*) AS n FROM policy_versions').get()!.n, 0); assert.equal(db.prepare('SELECT count(*) AS n FROM policy_batches').get()!.n, 0); db.close();
		assert.deepEqual(readFileSync(artifact), bytes);
		const reopened = openStore(file); reopened.close(); db = new DatabaseSync(file); assert.deepEqual(rawRows(db), before); db.close();
	} finally { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }
});

test('invalid v6 data rolls back schema and new tables without rewriting old rows', () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); let db = legacy(file);
	db.prepare('UPDATE attempts SET data=? WHERE rowid=1').run('{invalid'); const before = rawRows(db); db.close();
	try {
		assert.throws(() => openStore(file)); db = new DatabaseSync(file);
		assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 6); assert.deepEqual(rawRows(db), before);
		assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('policy_versions','policy_batches')").get()!.n, 0);
	} finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('batch authorization is immutable, exact-version bound and cannot reuse spending identities', () => {
	const dir = temporary(); const store = openStore(join(dir, 'state.sqlite'));
	try {
		const input = batch(store); const first = store.policyBatch(input.id)!;
		assert.deepEqual(store.authorizePolicyBatch(input), first);
		assert.throws(() => store.authorizePolicyBatch({ ...input, runtimeDigest: 'b'.repeat(64) }), /different input/);
		assert.throws(() => store.authorizePolicyBatch({ ...input, id: randomUUID() }), /already used/);
		assert.throws(() => store.authorizePolicyBatch({ ...input, id: randomUUID(), runs: [{ side: 'candidate', run: frozen('Unregistered') }] }), /registered intact/);
		const changed = frozen(); changed.conditions.question = 'Different question'; changed.conditionsDigest = policyDigest(changed.conditions);
		assert.throws(() => store.authorizePolicyBatch({ ...input, id: randomUUID(), runs: [input.runs[0], { side: 'candidate', run: changed }] }), /share frozen conditions/);
		assert.throws(() => store.startPolicyRun(input.id, input.runs[1].run.runId), /cannot start/);
		store.startPolicyRun(input.id, input.runs[0].run.runId);
		assert.throws(() => store.startPolicyRun(input.id, input.runs[0].run.runId), /cannot start/);
		assert.throws(() => store.reserve(attempt({ sessionId: input.runs[0].run.runId })), /active batch/);
		assert.throws(() => store.reserve(attempt({ ownerId: input.id })), /registered session/);
		const path = join(dir, 'policies', `${input.runs[0].run.policyDigest}.json`); chmodSync(path, 0o644);
		assert.throws(() => store.reserve(attempt({ owner: 'rsi', ownerId: input.id, sessionId: input.runs[0].run.runId, purpose: 'baseline', provider: 'rsi-policy-fixture', model: 'offline-v1' })), /read-only/);
		assert.equal(store.snapshot().attempts.length, 0);
	} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('policy and batch accounting covers both complete streams and cumulative request/token stops', async () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); let store = openStore(file);
	try {
		const input = batch(store, { maxRequests: 3 }); const [a, b] = input.runs.map(row => row.run); let dispatched = 0;
		store.startPolicyRun(input.id, a.runId);
		await consume(store, a, [usage(), finish], () => dispatched++); await consume(store, a, [usage(), finish], () => dispatched++);
		store.finishPolicyRun(input.id, a.runId, 'completed'); store.startPolicyRun(input.id, b.runId);
		await consume(store, b, [usage(), finish], () => dispatched++);
		await assert.rejects(consume(store, b, [usage(), finish], () => dispatched++), /request\/token/);
		store.finishPolicyRun(input.id, b.runId, 'completed'); const completed = store.policyBatch(input.id)!;
		assert.deepEqual(store.finishPolicyRun(input.id, b.runId, 'completed'), completed);
		assert.equal(completed.status, 'completed'); assert.equal(dispatched, 3);
		const accounting = store.policyAccounting(input.policyId); assert.equal(accounting.totalTokens, 30); assert.equal(accounting.confirmedTokens, 30);
		assert.deepEqual(accounting.attempts.map(row => row.purpose), ['baseline', 'baseline', 'evaluation']); assert.ok(accounting.attempts.every(row => row.ownerId === input.id));
		const second = batch(store, { tokenStopThreshold: 10 }); const run = second.runs[0].run; store.startPolicyRun(second.id, run.runId);
		await consume(store, run, [usage(), finish]); store.finishPolicyRun(second.id, run.runId, 'completed');
		assert.throws(() => store.startPolicyRun(second.id, second.runs[1].run.runId), /request\/token/);
		assert.equal(store.policyAccounting(input.policyId).totalTokens, 30, 'Other policies do not spend this policy budget');
		const another = { ...input, id: randomUUID(), runs: [{ side: 'candidate' as const, run: frozen('Read and cite implementation.') }] };
		store.authorizePolicyBatch(another); store.startPolicyRun(another.id, another.runs[0].run.runId); await consume(store, another.runs[0].run, [usage(), finish]); store.finishPolicyRun(another.id, another.runs[0].run.runId, 'completed');
		assert.equal(store.policyAccounting(input.policyId).totalTokens, 40); assert.equal(store.policyAccounting(input.policyId).attempts.length, 4);
		assert.equal(store.policyAccounting(input.policyId, another.id).totalTokens, 10); assert.equal(store.policyAccounting(input.policyId, input.id).totalTokens, 30);
		assert.throws(() => store.policyAccounting(second.policyId, input.id), /does not belong/);
		store.close(); store = openStore(file); assert.deepEqual(store.policyBatch(input.id), completed);
	} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('unknown and conflicting totals block both sides, survive recovery and do not poison unrelated owners', async () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); let store = openStore(file);
	try {
		for (const kind of ['missing', 'partial', 'conflict']) {
			const conflict = kind === 'conflict';
			const input = batch(store); const run = input.runs[0].run; store.startPolicyRun(input.id, run.runId);
			if (conflict) await assert.rejects(consume(store, run, [usage(), usage(11)]), /contradictory/);
			else await consume(store, run, kind === 'partial' ? [{ type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } }, finish] : [finish]);
			const row = store.policyAccounting(input.policyId).attempts[0]; assert.equal(row.usageState, 'unknown'); assert.equal(row.tokens.total, conflict ? 10 : null);
			assert.equal(store.policyAccounting(input.policyId).totalTokens, null); assert.equal(store.policyAccounting(input.policyId).confirmedTokens, 0);
			assert.throws(() => store.finishPolicyRun(input.id, run.runId, 'completed'), /settled successful/);
			await assert.rejects(consume(store, run, [usage(), finish]), /unsettled/); store.finishPolicyRun(input.id, run.runId, 'failed');
			assert.throws(() => store.startPolicyRun(input.id, input.runs[1].run.runId), /unsettled/);
			store.close(); store = openStore(file); assert.equal(store.policyBatch(input.id)!.status, 'interrupted'); assert.equal(store.policyAccounting(input.policyId).totalTokens, null);
			assert.deepEqual(store.authorizePolicyBatch(input), store.policyBatch(input.id)); assert.throws(() => store.startPolicyRun(input.id, input.runs[1].run.runId), /cannot start/);
		}
		const daily = observeUsage(store, new Set());
		for await (const _ of daily({ ...options(frozen()), sessionId: SessionId('unrelated-daily') }, async function* () { yield usage(); yield finish; })) {}
		assert.equal(store.snapshot().attempts.at(-1)!.owner, 'session');
		const independent = batch(store); const run = independent.runs[0].run; store.startPolicyRun(independent.id, run.runId); await consume(store, run, [usage(), finish]);
		assert.equal(store.policyAccounting(independent.policyId).totalTokens, 10);
	} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('restart interrupts authorized and in-flight batches, retains reservations and permits only late usage settlement', () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); let store = openStore(file);
	try {
		const idle = batch(store); const active = batch(store); const run = active.runs[0].run; store.startPolicyRun(active.id, run.runId);
		const row = attempt({ owner: 'rsi', ownerId: active.id, sessionId: run.runId, purpose: 'baseline', provider: run.conditions.provider, model: run.conditions.model }); store.reserve(row);
		store.settle({ ...row, revision: 2, state: 'in_flight', startedAt: Date.now(), usageState: 'unknown', tokens: { ...emptyTokens(), total: 10 }, diagnostic: 'conflicting_provider_usage' });
		const oldDeadline = store.policyBatch(active.id)!.deadline; store.close(); store = openStore(file);
		assert.equal(store.policyBatch(idle.id)!.status, 'interrupted'); assert.equal(store.policyBatch(active.id)!.status, 'interrupted');
		assert.deepEqual(store.policyBatch(active.id)!.progress.map(row => row.status), ['interrupted', 'interrupted']);
		const interrupted = store.snapshot().attempts[0]; assert.equal(interrupted.state, 'interrupted'); assert.equal(interrupted.usageState, 'unknown'); assert.equal(interrupted.tokens.total, 10);
		assert.equal(store.policyBatch(active.id)!.deadline, oldDeadline); assert.equal(store.policyAccounting(active.policyId).totalTokens, null);
		assert.deepEqual(store.authorizePolicyBatch(active), store.policyBatch(active.id));
		assert.throws(() => store.reserve({ ...row, attemptId: randomUUID() }), /active batch/); assert.throws(() => store.finishPolicyRun(active.id, run.runId, 'completed'), /Terminal/);
		assert.throws(() => store.settle({ ...interrupted, revision: interrupted.revision + 1, ownerId: idle.id }), /reassigned/);
		store.settle({ ...interrupted, revision: interrupted.revision + 1, usageState: 'confirmed', tokens: { ...emptyTokens(), total: 12 }, usageSource: 'provider', diagnostic: null });
		assert.equal(store.policyAccounting(active.policyId).totalTokens, 12); assert.equal(store.policyBatch(active.id)!.status, 'interrupted');
		const preserved = store.policyBatch(active.id); store.close(); store = openStore(file); assert.deepEqual(store.policyBatch(active.id), preserved); assert.equal(store.snapshot().attempts.length, 1);
	} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('policy observer rejects missing binding, changed envelopes, legacy ownership and cancelled batches before dispatch', async () => {
	const dir = temporary(); const file = join(dir, 'state.sqlite'); const store = openStore(file);
	try {
		await assert.rejects(consume(store, frozen(), [usage(), finish]), /exact frozen batch/);
		const input = batch(store); const run = input.runs[0].run; store.startPolicyRun(input.id, run.runId); let dispatched = 0;
		for (const change of [{ maxTokens: 129 }, { system: 'changed' }, { model: 'wrong' }, { purpose: 'compaction' }, { tools: [{ name: 'extra' }] }]) await assert.rejects(consume(store, run, [usage(), finish], () => dispatched++, change as Partial<GenerateOptions>));
		const observe = observeUsage(store, new Set([run.runId]));
		await assert.rejects(async () => { for await (const _ of observe(options(run), async function* () { dispatched++; yield finish; })) {} }, /ownership conflicts/);
		store.finishPolicyRun(input.id, run.runId, 'cancelled'); assert.equal(store.policyBatch(input.id)!.status, 'cancelled');
		await assert.rejects(consume(store, run, [usage(), finish], () => dispatched++), /active batch/); assert.equal(dispatched, 0);
		const terminal = store.policyBatch(input.id); store.close(); const reopened = openStore(file); assert.deepEqual(reopened.policyBatch(input.id), terminal); reopened.close();
	} finally { try { store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }
});

test('settled not-sent reservations consume a slot without inventing tokens; in-flight usage cannot authorize parallel dispatch', async () => {
	const dir = temporary(); const store = openStore(join(dir, 'state.sqlite'));
	try {
		const input = batch(store); const run = input.runs[0].run; store.startPolicyRun(input.id, run.runId);
		const row = attempt({ owner: 'rsi', ownerId: input.id, sessionId: run.runId, purpose: 'baseline', provider: run.conditions.provider, model: run.conditions.model });
		store.reserve(row); store.settle({ ...row, revision: 2, state: 'not_sent', endedAt: Date.now(), usageState: 'unknown' });
		assert.equal(store.policyAccounting(input.policyId).totalTokens, 0);
		await consume(store, run, [usage(), finish]); assert.equal(store.policyAccounting(input.policyId).totalTokens, 10);
		const pending = { ...row, attemptId: randomUUID() }; store.reserve(pending);
		store.settle({ ...pending, revision: 2, state: 'in_flight', startedAt: Date.now(), usageState: 'confirmed', tokens: { ...emptyTokens(), total: 10 } });
		assert.equal(store.policyAccounting(input.policyId).totalTokens, null);
		await assert.rejects(consume(store, run, [usage(), finish]), /unsettled/);
		assert.throws(() => store.finishPolicyRun(input.id, run.runId, 'completed'), /settled successful/);
	} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('persistent batch and run deadlines and backward clocks reject dispatch without a new reservation', async t => {
	const dir = temporary(); const store = openStore(join(dir, 'state.sqlite'));
	try {
		const input = batch(store); const run = input.runs[0].run; store.startPolicyRun(input.id, run.runId);
		const fixed = store.policyBatch(input.id)!;
		for (const now of [fixed.createdAt - 1, fixed.progress[0].startedAt! + run.conditions.budget.maxDurationMs, fixed.deadline]) {
			t.mock.method(Date, 'now', () => now);
			await assert.rejects(consume(store, run, [usage(), finish]), /window ended/);
			t.mock.restoreAll();
		}
		assert.equal(store.snapshot().attempts.length, 0);
	} finally { t.mock.restoreAll(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});
