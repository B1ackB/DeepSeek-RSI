import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { answerSchema, frontendStateSchema } from '../src/frontend-contracts.ts';
import { answerDesign, createDesign, finishDesign, frozenDesign, overrideDesign, requireDesign, resolveDesign, savePreference } from '../src/frontend.ts';
import { openStore } from '../src/store.ts';

test('frontend preferences stay scoped, ask at most two bounded batches, and freeze task overrides', () => {
	const state = frontendStateSchema.parse({ preferences: [], tasks: [] });
	const input = { skillId: randomUUID(), workspaceId: 'project-a', versionDigest: 'a'.repeat(64), brief: '虚构产品落地页，必须有可用的导航和表单' };
	const personal = { scope: 'personal' as const, workspaceId: null, dimension: 'palette' as const, value: '深色', enabled: true };
	savePreference(state, personal);
	savePreference(state, { ...personal, scope: 'project', workspaceId: 'project-a', value: '浅色' });
	const task = requireDesign(state, createDesign(state, input));
	assert.equal(resolveDesign(state, task).preferences[0]!.value, '浅色');
	assert.deepEqual(task.batches[0]!.dimensions, ['density', 'typography', 'shape']);
	assert.throws(() => createDesign(state, input), /已有/);
	assert.throws(() => overrideDesign(task, { dimension: 'density', kind: 'skip', value: null, scope: 'task' }), /当前问题/);
	overrideDesign(task, { dimension: 'palette', kind: 'value', value: '仅本次红色', scope: 'task' });
	assert.throws(() => answerDesign(state, task, [{ dimension: 'density', kind: 'skip', value: null, scope: 'task' }]), /缺失/);
	answerDesign(state, task, [
		{ dimension: 'density', kind: 'value', value: '留白多', scope: 'project' },
		{ dimension: 'typography', kind: 'no_preference', value: null, scope: 'task' },
		{ dimension: 'shape', kind: 'skip', value: null, scope: 'task' },
	]);
	assert.equal(state.preferences.length, 3, 'Skipping and no preference cannot create persistent records');
	assert.deepEqual(task.batches[1]!.dimensions, ['imagery', 'motion']);
	answerDesign(state, task, [
		{ dimension: 'imagery', kind: 'value', value: '以文字为主', scope: 'task' },
		{ dimension: 'motion', kind: 'value', value: '减少动效', scope: 'personal' },
	]);
	assert.equal(task.batches.length, 2);
	assert.throws(() => answerDesign(state, task, []), /结束/);
	finishDesign(state, task);
	const frozen = structuredClone(task.frozen);
	assert.equal(frozen!.preferences[0]!.value, '仅本次红色');
	assert.equal(frozen!.preferences[2]!.kind, 'no_preference');
	savePreference(state, { ...personal, value: '紫色' });
	assert.deepEqual(frozenDesign(state, task.id, input.skillId, input.versionDigest).frozen, frozen);
	assert.throws(() => overrideDesign(task, { dimension: 'palette', kind: 'skip', value: null, scope: 'task' }), /尚未确认/);
	const other = requireDesign(state, createDesign(state, { ...input, skillId: randomUUID(), workspaceId: 'project-b' }));
	assert.equal(resolveDesign(state, other).preferences[0]!.value, '紫色');
	assert.equal(resolveDesign(state, other).preferences[1]!.value, null);
	finishDesign(state, other);
	assert.equal(other.batches.length, 1, 'Finishing stops further questions');
	assert.equal(other.frozen!.preferences[1]!.kind, 'skip');
	assert.equal(other.frozen!.preferences[4]!.kind, 'unspecified');
	assert.equal(frontendStateSchema.safeParse(state).success, true);
	assert.equal(answerSchema.safeParse({ dimension: 'palette', kind: 'skip', value: 'invented', scope: 'personal' }).success, false);
	assert.equal(frontendStateSchema.safeParse({ ...state, preferences: [...state.preferences, state.preferences[0]] }).success, false);
	task.status = 'closed';
	assert.throws(() => frozenDesign(state, task.id, input.skillId, input.versionDigest), /已结束/);
});

test('version 2 migration preserves receipts, rolls back invalid data, and persists preference commands atomically', () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-frontend-store-'));
	const file = join(dir, 'state.sqlite');
	let store = openStore(file);
	let closed = false;
	try {
		const original = store.snapshot();
		const legacy = { ...store.business() } as Record<string, unknown>; delete legacy.frontend;
		const command = { schemaVersion: 1 as const, operationId: randomUUID(), expectedRevision: 1, kind: 'preference_save' as const, payload: { workspaceId: 'project', scope: 'project' as const, dimension: 'motion' as const, value: '减少动效', enabled: true } };
		store.close(); closed = true;
		const raw = new DatabaseSync(file);
		raw.prepare('UPDATE g1_state SET data=? WHERE id=1').run(JSON.stringify(legacy)); raw.exec('PRAGMA user_version=2'); raw.close();
		store = openStore(file); closed = false;
		assert.deepEqual(store.snapshot(), original);
		assert.deepEqual(store.business().frontend, { preferences: [], tasks: [] });
		const update = () => store.mutateBusiness(s => savePreference(s.frontend, command.payload), command);
		const receipt = update(); assert.deepEqual(update(), receipt);
		assert.equal(store.business().frontend.preferences.length, 1);
		assert.throws(() => store.mutateBusiness(s => { s.frontend.preferences = []; throw Error('rollback'); }), /rollback/);
		assert.equal(store.business().frontend.preferences.length, 1);
		assert.throws(() => store.mutateBusiness(() => null, { ...command, operationId: randomUUID() }), /状态已变化/);
		store.close(); closed = true;
		store = openStore(file); closed = false;
		assert.deepEqual(store.businessReceipt(command), receipt);
		assert.equal(store.business().frontend.preferences[0]!.value, '减少动效');
		store.close(); closed = true;
		const damaged = new DatabaseSync(file);
		damaged.exec('PRAGMA user_version=2'); damaged.prepare('UPDATE g1_state SET data=? WHERE id=1').run('{broken'); damaged.close();
		assert.throws(() => openStore(file), /JSON/);
		const checked = new DatabaseSync(file);
		assert.equal(checked.prepare('PRAGMA user_version').get()!.user_version, 2);
		assert.equal(checked.prepare('SELECT data FROM g1_state').get()!.data, '{broken');
		assert.equal(checked.prepare('SELECT count(*) AS n FROM g1_operations').get()!.n, 1); checked.close();
	} finally { if (!closed) store.close(); rmSync(dir, { recursive: true }); }
});
