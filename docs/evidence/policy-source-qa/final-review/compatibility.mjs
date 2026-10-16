import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/store.ts';
import { policyCommandSchema } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/policy-review-contracts.ts';
import { sourceQaFiles } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/policy-source-qa.ts';
const source = resolve(process.argv[2]);
assert.equal(source, resolve('.cache/policy-source-qa-ui-yD9n0z/policy-review-home/rsi'));
const originalHash = createHash('sha256').update(readFileSync(join(source, 'g0.sqlite'))).digest('hex');
const root = mkdtempSync(resolve('.cache/policy-qa-compat-')); cpSync(source, join(root, 'rsi'), { recursive: true });
const file = join(root, 'rsi/g0.sqlite');
const raw = new DatabaseSync(file, { readOnly: true });
const tables = ['attempts', 'policy_batches', 'policy_generations', 'policy_sessions', 'policy_choices', 'policy_sources', 'g1_operations', 'operations'];
const before = tables.map(table => ({ table, rows: raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() })); raw.close();
const store = openStore(file);
const command = (kind, payload) => policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload });
let result;
try {
	const view = store.policyReview(); assert.equal(view.reviews.length, 5); assert.ok(view.reviews.every(row => row.eligible && row.status === 'passed'));
	const qa = view.reviews.at(-1); const batch = store.policyBatch(qa.batchId); const generation = store.policyGeneration(batch.authorization.generationId); const link = generation.authorization.source;
	const previous = store.policySelection(link.workspaceId); const oldSessions = [...view.sessions];
	for (const binding of oldSessions) assert.equal(store.policySessionRun(binding.sessionId).conditionsDigest, binding.conditionsDigest);
	store.policyCommand(command('policy_adopt', { workspaceId: link.workspaceId, policyId: qa.policyId, batchId: qa.batchId, baselineDigest: qa.baselineDigest, candidateDigest: qa.candidateDigest, evidenceDigest: qa.evidenceDigest, choice: 'candidate', expectedActive: previous.id }), link.workspacePath);
	const selected = store.policySelection(link.workspaceId);
	const created = store.policyCommand(command('policy_session', { workspaceId: link.workspaceId, expectedActive: selected.id }), link.workspacePath);
	const newSession = `rsi-policy/${created.focusId}`; const binding = store.policySession(newSession);
	assert.equal(binding.policyDigest, qa.candidateDigest); assert.deepEqual(store.policySessionRun(newSession).conditions.files, sourceQaFiles());
	store.policyCommand(command('policy_restore', { workspaceId: link.workspaceId, targetChoiceId: previous.approvalId, expectedActive: selected.id }), link.workspacePath);
	assert.equal(store.policySelection(link.workspaceId).digest, previous.digest);
	assert.deepEqual(store.policySession(newSession), binding); assert.deepEqual(store.policyReview().sessions.slice(0, 5), oldSessions);
	assert.deepEqual(store.policySessionRun(newSession).conditions.files, sourceQaFiles()); assert.equal(store.snapshot().attempts.length, 48);
	result = { status: 'passed', paidRequests: 0, newModelAttempts: 0, retainedClone: root, oldEvaluationsEligible: 5, retainedQAEvaluations: 3, oldSessionBindingsUnchanged: 5, oldQACandidateAdoptedOnCopy: true, newSessionUsesExactOldQASnapshot: true, restorePreservesNewAndOldBindings: true };
} finally { store.close(); }
const after = new DatabaseSync(file, { readOnly: true });
try {
	for (const { table, rows } of before) for (const row of rows) { const key = table === 'policy_sessions' ? 'session' : 'id'; assert.deepEqual(after.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key]), row); }
} finally { after.close(); }
assert.equal(createHash('sha256').update(readFileSync(join(source, 'g0.sqlite'))).digest('hex'), originalHash);
result.originalFixtureDatabaseUnchanged = true; result.originalRowsPreservedOnCopy = Object.fromEntries(before.map(({ table, rows }) => [table, rows.length]));
writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
