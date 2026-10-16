import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/store.ts';
import { policyCommandSchema } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/policy-review-contracts.ts';
const source = resolve(process.argv[2]); assert.equal(source, resolve('.cache/policy-manual-qa-xEailE/policy-review-home/rsi'));
const hash = () => createHash('sha256').update(readFileSync(join(source, 'g0.sqlite'))).digest('hex'); const original = hash();
const root = mkdtempSync(resolve('.cache/policy-manual-qa-final-compat-')); cpSync(source, join(root, 'rsi'), { recursive: true }); const file = join(root, 'rsi/g0.sqlite');
const db = new DatabaseSync(file, { readOnly: true });
const before = ['attempts', 'policy_batches', 'policy_generations', 'policy_sessions', 'policy_choices', 'policy_sources', 'policy_qa_packs', 'g1_operations', 'operations', 'g1_state'].map(table => ({ table, rows: db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() })); db.close();
const store = openStore(file); let result;
try {
	const view = store.policyReview(); assert.equal(view.reviews.length, 4); assert.ok(view.reviews.every(row => row.eligible)); assert.equal(store.snapshot().attempts.length, 28);
	const previous = store.policySelection(view.choices[0].workspaceId); const oldSessions = [...view.sessions];
	for (const binding of oldSessions) assert.equal(store.policySessionRun(binding.sessionId).conditionsDigest, binding.conditionsDigest);
	const proof = view.reviews.at(-1); const pack = view.qaPacks.find(row => row.status === 'sealed'); assert.ok(view.qaPacks.some(row => row.parentId === pack.id && row.status === 'draft'));
	const command = (kind, payload) => policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload });
	store.policyCommand(command('policy_adopt', { workspaceId: previous.workspaceId, expectedActive: previous.id, policyId: proof.policyId, batchId: proof.batchId, baselineDigest: proof.baselineDigest, candidateDigest: proof.candidateDigest, evidenceDigest: proof.evidenceDigest, choice: 'candidate' }), previous.workspacePath);
	const selected = store.policySelection(previous.workspaceId); const created = store.policyCommand(command('policy_session', { workspaceId: previous.workspaceId, expectedActive: selected.id }), previous.workspacePath);
	const sessionId = `rsi-policy/${created.focusId}`; const binding = store.policySession(sessionId); const batch = store.policyBatch(binding.batchId);
	assert.equal(batch.authorization.evaluationSpec.packId, pack.id); assert.equal(batch.authorization.evaluationSpec.packDigest, pack.digest); assert.equal(store.policySessionRun(sessionId).conditionsDigest, binding.conditionsDigest);
	unlinkSync(join(root, 'rsi/repository-question-packs', pack.digest + '.json')); assert.throws(() => store.policySessionRun(sessionId), /ENOENT/);
	assert.equal(store.policyReview().reviews.at(-1).eligible, false);
	store.policyCommand(command('policy_restore', { workspaceId: previous.workspaceId, expectedActive: selected.id, targetChoiceId: previous.approvalId }), previous.workspacePath);
	assert.equal(store.policySelection(previous.workspaceId).digest, previous.digest); assert.deepEqual(store.policySession(sessionId), binding); assert.deepEqual(store.policyReview().sessions.slice(0, oldSessions.length), oldSessions);
	for (const old of oldSessions) assert.equal(store.policySessionRun(old.sessionId).conditionsDigest, old.conditionsDigest);
	assert.equal(store.snapshot().attempts.length, 28);
	result = { status: 'passed', retainedClone: root, paidRequests: 0, newModelAttempts: 0, oldEvaluationsEligibleBeforeObjectLoss: 4, oldSessionsUnchanged: oldSessions.length, exactSealedParentUsedDespiteChildDraft: true, missingExactPackBlocksQASessionWithoutFallback: true, intactBaselineRestorationSucceedsAfterPackLoss: true, originalFixtureDatabaseUnchanged: true, preservedRows: Object.fromEntries(before.map(({ table, rows }) => [table, rows.length])) };
} finally { store.close(); }
const after = new DatabaseSync(file, { readOnly: true }); try { for (const { table, rows } of before) for (const row of rows) { const key = table === 'policy_sessions' ? 'session' : 'id'; assert.deepEqual(after.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key]), row); } } finally { after.close(); }
assert.equal(hash(), original); writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
