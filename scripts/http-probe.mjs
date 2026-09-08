import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const log = await readFile(process.argv[2] ?? '/private/tmp/rsi-g0-host.log', 'utf8');
const launch = log.match(/http:\/\/127\.0\.0\.1:3080\/\?token=[^\s]+/)?.[0];
if (!launch) throw new Error('No authenticated local startup URL in the specified log');
const login = await fetch(launch, { redirect: 'manual' });
assert.equal(login.status, 303);
const cookie = login.headers.getSetCookie().map(row => row.split(';')[0]).join('; ');
assert.ok(cookie);
const origin = 'http://127.0.0.1:3080';
async function request(endpoint, payload, headers = {}) {
	return fetch(`${origin}/rsi-g0/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin, ...headers }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload }), signal: AbortSignal.timeout(30000) });
}
async function call(endpoint, payload) { const response = await request(endpoint, payload); assert.equal(response.status, 200); return (await response.json()).result; }
assert.equal((await request('snapshot', {}, { cookie: '' })).status, 401);
assert.equal((await request('snapshot', {}, { origin: 'https://untrusted.example' })).status, 403);
const before = await call('snapshot', {});
assert.equal(before.ok, true);
const cmd = { schemaVersion: 1, operationId: randomUUID(), kind: 'set_marker', probeId: before.value.probeId, expectedRevision: before.value.snapshotRevision, payload: { marker: 'G0_HTTP_PERSISTED' } };
const waiting = call('wait', { after: before.value.snapshotRevision });
const start = performance.now();
const updated = await call('command', cmd);
assert.equal(updated.ok, true);
const notification = await waiting;
const elapsedMs = performance.now() - start;
assert.equal(notification.value.marker, 'G0_HTTP_PERSISTED');
assert.ok(elapsedMs < 1000, `Snapshot update took ${elapsedMs} ms`);
assert.deepEqual(await call('command', cmd), updated);
assert.equal((await call('command', { ...cmd, operationId: randomUUID() })).error.code, 'state_conflict');
assert.equal((await call('command', { ...cmd, payload: { marker: 'conflict' } })).error.code, 'operation_conflict');
assert.equal((await call('command', { ...cmd, admin: true })).error.code, 'invalid_input');
console.log(JSON.stringify({ check: 'authenticated_http_and_state', status: 'passed', notificationMs: Math.round(elapsedMs), marker: updated.value.marker, revision: updated.value.snapshotRevision }));
