import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/store.ts';
import { policyCommandSchema } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/policy-review-contracts.ts';
import { sourceQuestion } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/policy-source-qa.ts';
import { policyExecutionRuntime } from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/src/policy-execution.ts';
const source = resolve(process.argv[2]); assert.equal(source, resolve('.cache/policy-source-qa-final-WB6d11/policy-review-home/rsi'));
const hash = () => createHash('sha256').update(readFileSync(join(source, 'g0.sqlite'))).digest('hex'); const original = hash();
const root = mkdtempSync(resolve('.cache/policy-manual-qa-compat-')); cpSync(source, join(root, 'rsi'), { recursive: true }); const file = join(root, 'rsi/g0.sqlite');
const db = new DatabaseSync(file, { readOnly: true });
const before = ['attempts', 'policy_batches', 'policy_generations', 'policy_sessions', 'policy_choices', 'policy_sources', 'g1_operations', 'operations', 'g1_state', 'bindings'].map(table => ({ table, rows: db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() }));
assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='policy_qa_packs'").get(), undefined); db.close();
let store = openStore(file); let result;
try {
	const view = store.policyReview(); assert.equal(view.qaPacks.length, 0); assert.equal(view.reviews.length, 5); assert.ok(view.reviews.every(row => row.eligible)); assert.equal(store.snapshot().attempts.length, 48);
	for (const session of view.sessions) assert.equal(store.policySessionRun(session.sessionId).conditionsDigest, session.conditionsDigest);
	const task = store.policyGeneration(view.generations.at(-1).id); const link = task.authorization.source; const sealed = store.policySource(link.sourceId);
	const command = (kind, payload) => policyCommandSchema.parse({ schemaVersion: 1, operationId: randomUUID(), expectedRevision: store.snapshot().snapshotRevision, kind, payload });
	const intent = { workspaceId: link.workspaceId, expectedActive: link.choiceId, sourceId: sealed.id, snapshotDigest: link.snapshotDigest };
	const questions = Object.fromEntries(['symbol', 'call-chain', 'error-path'].map(id => { const fixed = sourceQuestion(sealed.id, sealed.conditions, id); return [id, { question: `Manual review: ${id}`, answer: fixed.answer }]; }));
	const draft = store.policyCommand(command('policy_qa_draft', { ...intent, questions, parentId: null }), link.workspacePath); const pack = store.policyQaPack(draft.focusId);
	store.policyCommand(command('policy_qa_seal', { ...intent, packId: pack.id, packDigest: pack.digest }), link.workspacePath);
	const evaluation = command('policy_evaluate', { ...intent, generationId: task.authorization.id, baselineDigest: task.authorization.baselineDigest, candidateDigest: task.candidateDigest, caseId: 'symbol', packId: pack.id, packDigest: pack.digest, budget: { maxRequests: 8, tokenStopThreshold: 1000, maxDurationMs: 30000 } });
	const receipt = store.policyCommand(evaluation, link.workspacePath, undefined, policyExecutionRuntime()); store.close(); store = openStore(file);
	assert.equal(store.policyBatch(evaluation.operationId).status, 'interrupted'); assert.deepEqual(store.policyCommand(evaluation, link.workspacePath), receipt); assert.equal(store.snapshot().attempts.length, 48); assert.equal(store.policyQaPack(pack.id).status, 'sealed');
	result = { status: 'passed', originalFixtureDatabaseUnchanged: true, retainedClone: root, paidRequests: 0, newModelAttempts: 0, oldEvaluationsEligible: 5, oldSessionBindingsUnchanged: 5, newPackTableInitiallyEmpty: true, oldGenerationReusableForNewManualPack: true, authorizationOnlyRestartInterruptedWithoutReplay: true, preservedRows: Object.fromEntries(before.map(({ table, rows }) => [table, rows.length])) };
} finally { store.close(); }
const after = new DatabaseSync(file, { readOnly: true }); try { for (const { table, rows } of before) for (const row of rows) { const key = table === 'policy_sessions' ? 'session' : 'id'; assert.deepEqual(after.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(row[key]), row); } } finally { after.close(); }
assert.equal(hash(), original); writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
