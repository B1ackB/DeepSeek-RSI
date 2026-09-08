import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/store.ts';
import { emptyTokens, commandSchema, type Attempt } from '../src/contracts.ts';

test('Web commands persist, reject stale/conflicting writes, and roll back failure', () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-store-'));
	let store = openStore(join(dir, 'state.sqlite'));
	try {
		const initial = store.snapshot();
		const cmd = { schemaVersion: 1, kind: 'set_marker', operationId: randomUUID(), probeId: initial.probeId, expectedRevision: 1, payload: { marker: 'G0_READY' } };
		const updated = store.command(cmd);
		assert.equal(updated.marker, 'G0_READY');
		assert.deepEqual(store.command(cmd), updated);
		assert.throws(() => store.command({ ...cmd, payload: { marker: 'changed' } }), /different content/);
		assert.throws(() => store.command({ ...cmd, operationId: randomUUID() }), /state changed/);
		assert.throws(() => openStore(join(dir, 'state.sqlite')), /locked/);
		store.close();
		const injected = new DatabaseSync(join(dir, 'state.sqlite'));
		injected.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;");
		injected.close();
		store = openStore(join(dir, 'state.sqlite'));
		assert.throws(() => store.command({ ...cmd, operationId: randomUUID(), expectedRevision: updated.snapshotRevision, payload: { marker: 'must roll back' } }), /injected receipt failure/);
		assert.deepEqual(store.snapshot(), updated);
		assert.equal(commandSchema.safeParse({ ...cmd, admin: true }).success, false);
		assert.equal(commandSchema.safeParse({ ...cmd, expectedRevision: -1 }).success, false);
		assert.equal(commandSchema.safeParse({ ...cmd, payload: { marker: '😀'.repeat(129) } }).success, false);
	} finally { store.close(); rmSync(dir, { recursive: true }); }
});

export function attempt(owner: Attempt['owner'] = 'rsi'): Attempt {
	return { schemaVersion: 1, attemptId: randomUUID(), revision: 1, owner, ownerId: owner === 'unresolved' ? null : 'test-owner', sessionId: 'test-session', purpose: 'probe', callKind: 'agent', retryOfAttemptId: null, provider: 'deepseek-official', model: 'deepseek-v4-flash', providerRequestId: null, state: 'reserved', createdAt: Date.now(), startedAt: null, endedAt: null, usageState: 'pending', tokens: emptyTokens(), usageSource: null, diagnostic: null };
}

test('unknown requests survive restart, block RSI, and do not block daily sessions', () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-budget-'));
	let store = openStore(join(dir, 'state.sqlite'));
	try {
		const pending = attempt();
		store.reserve(pending);
		store.close(); store = openStore(join(dir, 'state.sqlite'));
		assert.equal(store.snapshot().attempts[0].state, 'interrupted');
		assert.equal(store.snapshot().attempts[0].tokens.total, null);
		assert.throws(() => store.reserve(attempt()), /not settled/);
		store.reserve({ ...attempt('session'), purpose: 'daily' });
		const recovered = store.snapshot().attempts[0];
		const settled: Attempt = { ...recovered, revision: recovered.revision + 1, tokens: { ...recovered.tokens, total: 10 }, usageState: 'confirmed', usageSource: 'provider' };
		store.settle(settled);
		assert.throws(() => store.settle({ ...settled, revision: settled.revision + 1, state: 'in_flight' }), /Terminal request/);
		assert.throws(() => store.settle({ ...settled, revision: settled.revision + 1, model: 'different' }), /identity is immutable/);
		const revision = store.snapshot().snapshotRevision;
		store.settle(settled);
		assert.equal(store.snapshot().snapshotRevision, revision);
		for (let i = 1; i < 8; i++) {
			const a = attempt(); store.reserve(a);
			store.settle({ ...a, revision: 2, state: 'succeeded', endedAt: Date.now(), tokens: { ...a.tokens, total: 10 }, usageState: 'confirmed', usageSource: 'provider' });
		}
		assert.throws(() => store.reserve(attempt()), /budget reached/);
		assert.equal(store.snapshot().attempts.filter(a => a.owner === 'rsi').length, 8);
		const current = store.snapshot();
		store.command({ schemaVersion: 1, kind: 'cancel_probe', operationId: randomUUID(), probeId: current.probeId, expectedRevision: current.snapshotRevision, payload: {} });
		assert.throws(() => store.reserve(attempt()), /Probe is cancelled/);
	} finally { store.close(); rmSync(dir, { recursive: true }); }
});
