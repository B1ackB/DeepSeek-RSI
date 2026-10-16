import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { attemptSchema, bindingSchema, commandSchema, fault, snapshotSchema, stateSchema, type Attempt, type State, type Snapshot } from './contracts.ts';
import { g1CommandSchema, g1StateSchema, initialG1State, receiptSchema, type G1State, type G1Command } from './g1-contracts.ts';
import { z } from 'zod';
import { policyBatchInputSchema, policyBatchSchema, policyVersionSchema, policyEvidenceSchema, policyDigest, policyConditionsSchema, repositorySnapshotSchema, freezePolicyRun, type PolicyBatch } from './policy-contracts.ts';
import { readPolicy, sealPolicy, readSealedJson, sealJson } from './policy-versions.ts';
import { validatePolicyEvaluation, evaluatePolicyBatch, sourceEvaluation, evaluationCase } from './policy-evaluation.ts';
import { policyGenerationInputSchema, policyGenerationSchema, policyGenerationResponseSchema, policyGenerationSession, policyGeneratorPrompt, policyGeneratorInputDigest, type PolicyGeneration } from './policy-generation-contracts.ts';
import { policyChoiceSchema, policySessionSchema, policyCommandSchema, policyReviewSnapshotSchema, policySessionId, policySourceSchema, policyQaPackSchema, type PolicySource } from './policy-review-contracts.ts';
import { sealRepositorySnapshot, readRepositorySnapshot, repositoryManifest } from './policy-snapshot.ts';
import { policyQaContentSchema } from './policy-qa-inputs.ts';
import { validateManualQa, manualSourceQuestion } from './policy-manual-qa.ts';
import { policyPackCases, policyPackEvaluationSchema, type PolicyPackEvaluation } from './policy-pack-contracts.ts';
import { sourceQaAvailable } from './policy-source-qa.ts';

export function openStore(file: string, handoffBatchId?: string) {
	if (handoffBatchId !== undefined) { z.uuid().parse(handoffBatchId); if (!existsSync(file)) throw fault('policy_handoff_missing', 'Handoff requires an existing store'); }
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	const db = new DatabaseSync(file);
	const openedAt = Date.now();
	const monotonicStart = performance.now();
	db.exec('PRAGMA busy_timeout=1000;');
	db.exec('PRAGMA locking_mode=EXCLUSIVE;');
	const schema = db.prepare('PRAGMA user_version').get()?.user_version;
	if (![0, 1, 2, 3, 4, 5, 6, 7].includes(Number(schema))) { db.close(); throw fault('schema_version', 'Unsupported RSI database version'); }
	if (handoffBatchId !== undefined) {
		try {
			if (schema !== 7 || !db.prepare('SELECT 1 FROM policy_batches WHERE id=?').get(handoffBatchId)) throw fault('policy_handoff_missing', 'Handoff requires an existing v7 batch');
		} catch (error) { db.close(); throw error; }
	}
	try { db.exec(`BEGIN IMMEDIATE;
		CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS bindings (session TEXT NOT NULL, skill TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session,skill));
		CREATE TABLE IF NOT EXISTS g1_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS g1_operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_versions (policy TEXT NOT NULL, digest TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(policy,digest));
		CREATE TABLE IF NOT EXISTS policy_batches (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_generations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_choices (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_sessions (session TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_qa_packs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS policy_pack_evaluations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		`);
		const previous = db.prepare('SELECT data FROM g1_state WHERE id=1').get();
		if (previous) {
			const value = g1StateSchema.parse(JSON.parse(String(previous.data)));
			if (Number(schema) < 6) db.prepare('UPDATE g1_state SET data=? WHERE id=1').run(JSON.stringify(value));
		}
		if (schema !== 7) {
			for (const row of db.prepare('SELECT data FROM state').all()) stateSchema.parse(JSON.parse(String(row.data)));
			for (const row of db.prepare('SELECT data FROM attempts').all()) attemptSchema.parse(JSON.parse(String(row.data)));
			for (const row of db.prepare('SELECT data FROM bindings').all()) bindingSchema.parse(JSON.parse(String(row.data)));
			for (const row of db.prepare('SELECT command,result FROM operations').all()) { commandSchema.parse(JSON.parse(String(row.command))); snapshotSchema.parse(JSON.parse(String(row.result))); }
			for (const row of db.prepare('SELECT command,result FROM g1_operations').all()) { g1CommandSchema.parse(JSON.parse(String(row.command))); receiptSchema.parse(JSON.parse(String(row.result))); }
		}
		for (const row of db.prepare('SELECT policy,digest,data FROM policy_versions').all()) {
			const version = policyVersionSchema.parse(JSON.parse(String(row.data)));
			if (version.policyId !== row.policy || version.digest !== row.digest || (version.parentDigest && !db.prepare('SELECT 1 FROM policy_versions WHERE policy=? AND digest=?').get(version.policyId, version.parentDigest))) throw fault('policy_version_invalid', 'Policy version identity or parent is invalid');
		}
		for (const row of db.prepare('SELECT id,data FROM policy_batches').all()) {
			const batch = policyBatchSchema.parse(JSON.parse(String(row.data)));
			validateGeneratedBatch(batch.authorization);
			if (batch.authorization.id !== row.id || batch.authorization.runs.some(entry => !db.prepare('SELECT 1 FROM policy_versions WHERE policy=? AND digest=?').get(batch.authorization.policyId, entry.run.policyDigest))) throw fault('policy_batch_invalid', 'Policy batch identity or version is invalid');
		}
		for (const row of db.prepare('SELECT id,data FROM policy_generations').all()) {
			const task = policyGenerationSchema.parse(JSON.parse(String(row.data)));
			if (task.authorization.id !== row.id || !db.prepare('SELECT 1 FROM policy_versions WHERE policy=? AND digest=?').get(task.authorization.policyId, task.authorization.baselineDigest)) throw fault('policy_generation_invalid', 'Generation identity or baseline is invalid');
			if (task.candidateDigest) {
				const candidate = db.prepare('SELECT data FROM policy_versions WHERE policy=? AND digest=?').get(task.authorization.policyId, task.candidateDigest);
				const version = candidate && policyVersionSchema.parse(JSON.parse(String(candidate.data)));
				if (!version || version.generationId !== row.id || version.parentDigest !== task.authorization.baselineDigest) throw fault('policy_generation_invalid', 'Generation candidate provenance is invalid');
			}
		}
		for (const row of db.prepare('SELECT data FROM policy_versions').all()) {
			const version = policyVersionSchema.parse(JSON.parse(String(row.data)));
			if (!version.generationId) continue;
			const data = db.prepare('SELECT data FROM policy_generations WHERE id=?').get(version.generationId);
			const task = data && policyGenerationSchema.parse(JSON.parse(String(data.data)));
			if (!task || task.status !== 'sealed' || task.candidateDigest !== version.digest || task.authorization.policyId !== version.policyId || task.authorization.baselineDigest !== version.parentDigest) throw fault('policy_generation_invalid', 'Version generation provenance is missing or mismatched');
		}
		const selected = new Map<string, string>();
		const approved = new Set<string>();
		for (const row of db.prepare('SELECT id,data FROM policy_choices ORDER BY rowid').all()) {
			const choice = policyChoiceSchema.parse(JSON.parse(String(row.data)));
			const receipt = db.prepare('SELECT command FROM g1_operations WHERE id=?').get(choice.id);
			const cmd = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
			const approval = policyChoices().find(item => item.id === choice.approvalId);
			if (choice.id !== row.id || !cmd || (cmd.kind !== 'policy_adopt' && cmd.kind !== 'policy_restore') || cmd.payload.workspaceId !== choice.workspaceId || cmd.payload.expectedActive !== choice.previousId || choice.previousId !== (selected.get(choice.workspaceId) ?? null) || !approval || approval.kind !== 'adopt' || ['workspaceId', 'workspacePath', 'policyId', 'digest', 'batchId', 'evidenceDigest'].some(key => choice[key as keyof typeof choice] !== approval[key as keyof typeof approval]) || !db.prepare('SELECT 1 FROM policy_versions WHERE policy=? AND digest=?').get(choice.policyId, choice.digest)) throw fault('policy_choice_invalid', 'Policy choice or approval provenance is invalid');
			const batch = policyBatch(choice.batchId);
			const context = batch?.authorization.generationId ? policyGeneration(batch.authorization.generationId)?.authorization.source : undefined;
			if (context && (context.workspaceId !== choice.workspaceId || context.workspacePath !== choice.workspacePath)) throw fault('policy_choice_invalid', 'Source approval workspace differs from its evaluation');
			if (!batch?.evaluation || batch.authorization.policyId !== choice.policyId || batch.evaluation.evidenceDigest !== choice.evidenceDigest || !batch.authorization.runs.some(entry => entry.run.policyDigest === choice.digest)) throw fault('policy_choice_invalid', 'Choice batch reference is invalid');
			if (cmd.kind === 'policy_adopt' ? choice.kind !== 'adopt' || cmd.payload.policyId !== choice.policyId || cmd.payload.batchId !== choice.batchId || cmd.payload.evidenceDigest !== choice.evidenceDigest || cmd.payload.baselineDigest !== batch.authorization.runs[0].run.policyDigest || cmd.payload.candidateDigest !== batch.authorization.runs[1]?.run.policyDigest || (cmd.payload.choice === 'baseline' ? cmd.payload.baselineDigest : cmd.payload.candidateDigest) !== choice.digest : choice.kind !== 'restore' || cmd.payload.targetChoiceId !== choice.approvalId) throw fault('policy_choice_invalid', 'Choice differs from its explicit command');
			if (choice.kind === 'restore' && !approved.has(choice.approvalId)) throw fault('policy_choice_invalid', 'Restore precedes its explicit approval');
			if (choice.kind === 'adopt') approved.add(choice.id);
			selected.set(choice.workspaceId, choice.id);
		}
		for (const row of db.prepare('SELECT id,data FROM policy_sources').all()) {
			const source = policySourceSchema.parse(JSON.parse(String(row.data))); const choice = policyChoices().find(item => item.id === source.choiceId);
			policyConditionsSchema.parse(source.conditions);
			const saved = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(source.id);
			const cmd = saved && policyCommandSchema.parse(JSON.parse(String(saved.command)));
			const snapshot = snapshotForSource(source);
			if (source.id !== row.id || !choice || choice.workspaceId !== source.workspaceId || choice.workspacePath !== source.workspacePath || !cmd || cmd.kind !== 'policy_preview' || cmd.payload.workspaceId !== source.workspaceId || cmd.payload.expectedActive !== source.choiceId || policyDigest([...cmd.payload.paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) !== policyDigest(snapshot.files.map(file => file.path)) || receiptSchema.parse(JSON.parse(String(saved!.result))).focusId !== source.id || policyDigest(source.conditions) !== policyDigest(conditionsForSource(choice, snapshot))) throw fault('policy_source_invalid', 'Source preview provenance or conditions are invalid');
			if (source.status === 'sealed') {
				const receipt = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(source.sealId!);
				const seal = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
				if (!seal || seal.kind !== 'policy_seal' || seal.payload.sourceId !== source.id || seal.payload.workspaceId !== source.workspaceId || seal.payload.expectedActive !== source.choiceId || seal.payload.snapshotDigest !== policyDigest(snapshot) || receiptSchema.parse(JSON.parse(String(receipt!.result))).focusId !== source.id) throw fault('policy_source_invalid', 'Sealed source has no exact confirmation receipt');
			}
		}
		const packParents = new Set<string>();
		for (const row of db.prepare('SELECT id,data FROM policy_qa_packs ORDER BY rowid').all()) {
			const pack = policyQaPackSchema.parse(JSON.parse(String(row.data))); const source = policySource(pack.content.sourceId);
			const receipt = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(pack.id);
			const cmd = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
			const parent = pack.parentId ? policyQaPack(pack.parentId) : undefined;
			if (pack.id !== row.id || policyDigest(pack.content) !== pack.digest || !source || source.status !== 'sealed' || source.workspaceId !== pack.workspaceId || source.workspacePath !== pack.workspacePath || source.choiceId !== pack.choiceId || !cmd || cmd.kind !== 'policy_qa_draft' || cmd.operationId !== pack.id || cmd.payload.workspaceId !== pack.workspaceId || cmd.payload.expectedActive !== pack.choiceId || cmd.payload.sourceId !== source.id || cmd.payload.snapshotDigest !== pack.content.snapshotDigest || cmd.payload.parentId !== pack.parentId || policyDigest(cmd.payload.questions) !== policyDigest(pack.content.questions) || receiptSchema.parse(JSON.parse(String(receipt!.result))).focusId !== pack.id || (pack.parentId && (!packParents.has(pack.parentId) || parent?.workspaceId !== pack.workspaceId || parent.content.sourceId !== source.id || parent.choiceId !== pack.choiceId))) throw fault('policy_qa_invalid', 'Question pack has no exact draft/source/parent receipt');
			validateManualQa(pack.content, source.conditions);
			if (pack.status === 'sealed') {
				const receipt = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(pack.sealId!); const cmd = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
				if (!cmd || cmd.kind !== 'policy_qa_seal' || cmd.operationId !== pack.sealId || cmd.payload.workspaceId !== pack.workspaceId || cmd.payload.expectedActive !== pack.choiceId || cmd.payload.sourceId !== source.id || cmd.payload.snapshotDigest !== pack.content.snapshotDigest || cmd.payload.packId !== pack.id || cmd.payload.packDigest !== pack.digest || receiptSchema.parse(JSON.parse(String(receipt!.result))).focusId !== pack.id) throw fault('policy_qa_invalid', 'Question pack has no exact sealing confirmation');
			}
			packParents.add(pack.id);
		}
		for (const row of db.prepare('SELECT session,data FROM policy_sessions').all()) {
			const binding = policySessionSchema.parse(JSON.parse(String(row.data))); const choice = policyChoices().find(item => item.id === binding.choiceId);
			const batch = policyBatch(binding.batchId);
			const source = binding.sourceId ? policySource(binding.sourceId) : undefined;
			if (binding.sessionId !== row.session || !choice || choice.workspaceId !== binding.workspaceId || choice.workspacePath !== binding.workspacePath || choice.policyId !== binding.policyId || choice.digest !== binding.policyDigest || choice.batchId !== binding.batchId || !batch?.authorization.runs.some(item => item.run.policyDigest === binding.policyDigest && (binding.sourceId ? source?.status === 'sealed' && source.choiceId === binding.choiceId && source.workspaceId === binding.workspaceId && source.workspacePath === binding.workspacePath && policyDigest(source.conditions) === binding.conditionsDigest : item.run.conditionsDigest === binding.conditionsDigest))) throw fault('policy_binding_invalid', 'Policy session binding provenance is invalid');
			const intents = db.prepare("SELECT command,result FROM g1_operations WHERE json_extract(result,'$.focusId')=?").all(binding.sessionId.slice(11));
			if (!intents.some(row => { const cmd = policyCommandSchema.safeParse(JSON.parse(String(row.command))); const result = receiptSchema.parse(JSON.parse(String(row.result))); return cmd.success && (binding.sourceId ? cmd.data.kind === 'policy_source_session' && cmd.data.payload.sourceId === binding.sourceId && cmd.data.payload.snapshotDigest === source?.conditions.sourceSnapshot?.digest : cmd.data.kind === 'policy_session') && 'expectedActive' in cmd.data.payload && cmd.data.payload.workspaceId === binding.workspaceId && cmd.data.payload.expectedActive === binding.choiceId && result.focusId === binding.sessionId.slice(11); })) throw fault('policy_binding_invalid', 'Session binding has no exact explicit creation receipt');
		}
		for (const row of db.prepare('SELECT data FROM policy_generations').all()) { const task = policyGenerationSchema.parse(JSON.parse(String(row.data))); generationSource(task, false); checkGenerationIntent(task); }
		for (const row of db.prepare('SELECT data FROM policy_batches').all()) checkEvaluationIntent(policyBatchSchema.parse(JSON.parse(String(row.data))));
		for (const row of db.prepare('SELECT id FROM policy_pack_evaluations').all()) checkPolicyPack(String(row.id));
		db.exec('PRAGMA user_version=7; COMMIT;');
	} catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); db.close(); throw error; }
	const initial: State = { schemaVersion: 1, probeId: randomUUID(), snapshotRevision: 1, updatedAt: Date.now(), marker: '', cancelled: false, budgetStartedAt: null };
	db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(initial));
	db.prepare('INSERT OR IGNORE INTO g1_state VALUES (1, ?)').run(JSON.stringify(initialG1State()));
	let listeners = new Set<() => void>();
	const read = (): State => stateSchema.parse(JSON.parse(String(db.prepare('SELECT data FROM state WHERE id=1').get()?.data)));
	const attempts = (): Attempt[] => db.prepare('SELECT data FROM attempts ORDER BY rowid').all().map(row => attemptSchema.parse(JSON.parse(String(row.data))));
	const snapshot = (): Snapshot => snapshotSchema.parse({ ...read(), attempts: attempts() });
	const business = (): G1State => g1StateSchema.parse(JSON.parse(String(db.prepare('SELECT data FROM g1_state WHERE id=1').get()?.data)));
	const policyObjects = join(dirname(file), 'policies');
	const repositoryObjects = join(dirname(file), 'repository-snapshots');
	function policyVersions(policyId: string) { return db.prepare('SELECT data FROM policy_versions WHERE policy=? ORDER BY rowid').all(z.uuid().parse(policyId)).map(row => policyVersionSchema.parse(JSON.parse(String(row.data)))); }
	function policyBatch(id: string) { const row = db.prepare('SELECT data FROM policy_batches WHERE id=?').get(z.uuid().parse(id)); return row ? policyBatchSchema.parse(JSON.parse(String(row.data))) : undefined; }
	function policyPackEvaluation(id: string) { const row = db.prepare('SELECT data FROM policy_pack_evaluations WHERE id=?').get(z.uuid().parse(id)); return row ? policyPackEvaluationSchema.parse(JSON.parse(String(row.data))) : undefined; }
	function checkPolicyPack(id: string, verifyObject = false) {
		const pack = policyPackEvaluation(id);
		const receipt = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(id);
		const cmd = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
		if (!pack || pack.id !== id || !cmd || cmd.kind !== 'policy_evaluate_pack' || cmd.operationId !== id || receiptSchema.parse(JSON.parse(String(receipt!.result))).focusId !== id || policyDigest(cmd.payload) !== policyDigest({ workspaceId: pack.workspaceId, expectedActive: pack.choiceId, sourceId: pack.sourceId, snapshotDigest: pack.snapshotDigest, generationId: pack.generationId, baselineDigest: pack.baselineDigest, candidateDigest: pack.candidateDigest, packId: pack.packId, packDigest: pack.packDigest, budget: pack.budget })) throw fault('policy_pack_invalid', 'Whole-pack evaluation has no exact authorization receipt');
		const task = policyGeneration(pack.generationId);
		if (!task || task.authorization.policyId !== pack.policyId || task.authorization.baselineDigest !== pack.baselineDigest || task.candidateDigest !== pack.candidateDigest || policyDigest(task.authorization.source) !== policyDigest({ workspaceId: pack.workspaceId, workspacePath: pack.workspacePath, choiceId: pack.choiceId, sourceId: pack.sourceId, snapshotDigest: pack.snapshotDigest })) throw fault('policy_pack_invalid', 'Whole-pack generation/source binding differs');
		checkGenerationIntent(task); generationSource(task, verifyObject);
		const questionPack = policyQaPack(pack.packId, verifyObject);
		if (!questionPack || questionPack.status !== 'sealed' || questionPack.digest !== pack.packDigest || questionPack.choiceId !== pack.choiceId || questionPack.workspaceId !== pack.workspaceId || questionPack.workspacePath !== pack.workspacePath || questionPack.content.sourceId !== pack.sourceId || questionPack.content.snapshotDigest !== pack.snapshotDigest) throw fault('policy_pack_invalid', 'Whole-pack question version differs');
		for (const [index, batchId] of pack.batchIds.entries()) {
			const batch = policyBatch(batchId); const auth = batch?.authorization; const spec = auth?.evaluationSpec;
			if (!batch || !auth || auth.id !== batchId || auth.packEvaluationId !== id || auth.generationId !== pack.generationId || auth.policyId !== pack.policyId || auth.runtimeDigest !== pack.runtimeDigest || spec?.evaluator !== 'repository-source-qa-manual-v1' || spec.caseId !== policyPackCases[index] || spec.sourceId !== pack.sourceId || spec.packId !== pack.packId || spec.packDigest !== pack.packDigest || batch.createdAt !== pack.createdAt || batch.deadline !== pack.deadline || policyDigest(auth.budget) !== policyDigest({ ...pack.budget, maxRequests: Math.min(16, pack.budget.maxRequests) })) throw fault('policy_pack_invalid', 'Whole-pack ordered membership or fixed conditions differ');
			validateGeneratedBatch(auth);
		}
		return pack;
	}
	function checkPackDispatch(batch: PolicyBatch) {
		if (!batch.authorization.packEvaluationId) return;
		const pack = checkPolicyPack(batch.authorization.packEvaluationId, true);
		if (!pack.batchIds.includes(batch.authorization.id)) throw fault('policy_pack_invalid', 'Batch is not a member of this pack');
		for (const prior of pack.batchIds.slice(0, pack.batchIds.indexOf(batch.authorization.id))) checkedPolicyBatch(prior);
		const usage = policyAccounting(pack.policyId, pack.id);
		if (usage.totalTokens === null) throw fault('usage_unknown', 'Whole-pack usage is unsettled');
		if (usage.attempts.length >= pack.budget.maxRequests || usage.confirmedTokens >= pack.budget.tokenStopThreshold || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= pack.deadline) throw fault('budget_exhausted', 'Whole-pack cumulative request/token/window limit reached');
	}
	function stopPolicyPack(id: string, status: 'failed' | 'cancelled' | 'interrupted') {
		return transaction(() => { const pack = policyPackEvaluation(id); if (!pack) throw fault('policy_pack_invalid', 'Whole-pack evaluation is missing'); for (const batchId of pack.batchIds) stopPolicyBatch(batchId, status); });
	}
	function policyPackSummary(id: string) {
		const pack = policyPackEvaluation(id)!; const batches = pack.batchIds.map(id => policyBatch(id)!);
		const states = batches.map(row => row.status); const usage = policyAccounting(pack.policyId, id);
		let completedCases = 0; let passed = true;
		for (const batchId of pack.batchIds) { try { if (checkedPolicyBatch(batchId).evaluation!.status !== 'passed') passed = false; completedCases++; } catch { passed = false; } }
		const executionStatus = states.every(s => s === 'completed') ? 'completed' : states.includes('interrupted') ? 'interrupted' : states.includes('cancelled') ? 'cancelled' : states.every(s => s === 'authorized') ? 'authorized' : states.some(s => s === 'authorized' || s === 'running') ? 'running' : 'failed';
		return { ...pack, executionStatus, status: completedCases !== 3 || usage.totalTokens === null ? 'incomplete' : passed ? 'passed' : 'failed', completedCases, requests: usage.attempts.length, confirmedTokens: usage.confirmedTokens, totalTokens: usage.totalTokens, unknownUsage: usage.attempts.filter(row => row.state !== 'not_sent' && (['reserved', 'in_flight'].includes(row.state) || row.usageState !== 'confirmed')).length };
	}

	function policyChoices() { return db.prepare('SELECT data FROM policy_choices ORDER BY rowid').all().map(row => policyChoiceSchema.parse(JSON.parse(String(row.data)))); }
	function policySessions() { return db.prepare('SELECT data FROM policy_sessions ORDER BY rowid').all().map(row => policySessionSchema.parse(JSON.parse(String(row.data)))); }
	function policySelection(workspaceId: string) { return policyChoices().findLast(row => row.workspaceId === workspaceId); }
	function policySources() { return db.prepare('SELECT data FROM policy_sources ORDER BY rowid').all().map(row => policySourceSchema.parse(JSON.parse(String(row.data)))); }
	function policySource(id: string) { const row = db.prepare('SELECT data FROM policy_sources WHERE id=?').get(z.uuid().parse(id)); if (!row) return undefined; const source = policySourceSchema.parse(JSON.parse(String(row.data))); policyConditionsSchema.parse(source.conditions); return source; }
	function policyQaPack(id: string, verifyObject = false) {
		const row = db.prepare('SELECT data FROM policy_qa_packs WHERE id=?').get(z.uuid().parse(id)); if (!row) return undefined;
		const pack = policyQaPackSchema.parse(JSON.parse(String(row.data)));
		if (verifyObject) { readRepositorySnapshot(repositoryObjects, pack.content.snapshotDigest); if (pack.status === 'sealed') readSealedJson(join(dirname(file), 'repository-question-packs'), pack.digest, 65536, value => policyQaContentSchema.parse(value)); }
		return pack;
	}
	function manualPack(spec: PolicyBatch['authorization']['evaluationSpec'], verifyObject = true) {
		if (spec?.evaluator !== 'repository-source-qa-manual-v1') return undefined;
		const pack = policyQaPack(spec.packId);
		if (!pack || pack.status !== 'sealed' || pack.digest !== spec.packDigest || pack.content.sourceId !== spec.sourceId || policyDigest(pack.content) !== spec.packDigest) throw fault('policy_qa_invalid', '需要精确封存的问答包版本');
		return verifyObject ? readSealedJson(join(dirname(file), 'repository-question-packs'), spec.packDigest, 65536, value => policyQaContentSchema.parse(value)) : pack.content;
	}
	function policyEvaluationCase(spec: NonNullable<PolicyBatch['authorization']['evaluationSpec']>, conditions: unknown, verifyObject = true) { return evaluationCase(spec, conditions, manualPack(spec, verifyObject)); }
	function snapshotForSource(source: PolicySource) { return repositorySnapshotSchema.parse({ schemaVersion: 1, kind: 'repository-worktree', root: source.workspacePath, files: source.conditions.files }); }
	function conditionsForSource(choice: z.infer<typeof policyChoiceSchema>, snapshot: z.infer<typeof repositorySnapshotSchema>) {
		const base = policyBatch(choice.batchId)?.authorization.runs.find(item => item.run.policyDigest === choice.digest)?.run.conditions;
		if (!base) throw fault('policy_source_invalid', 'Approved policy conditions are missing');
		return policyConditionsSchema.parse({ ...base, question: 'Answer questions using the explicitly confirmed repository snapshot.', files: snapshot.files, sourceSnapshot: { root: snapshot.root, digest: policyDigest(snapshot) } });
	}
	function checkGenerationIntent(task: PolicyGeneration) {
		const link = task.authorization.source; if (!link) return;
		const receipt = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(task.authorization.id);
		const cmd = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
		if (!cmd || cmd.kind !== 'policy_generate' || cmd.payload.workspaceId !== link.workspaceId || cmd.payload.expectedActive !== link.choiceId || cmd.payload.sourceId !== link.sourceId || cmd.payload.snapshotDigest !== link.snapshotDigest || cmd.payload.baselineDigest !== task.authorization.baselineDigest || cmd.payload.requirements !== task.authorization.requirements || policyDigest(cmd.payload.budget) !== policyDigest(task.authorization.budget) || receiptSchema.parse(JSON.parse(String(receipt!.result))).focusId !== task.authorization.id) throw fault('policy_generation_mismatch', 'Generation has no exact explicit authorization receipt');
	}
	function checkEvaluationIntent(batch: PolicyBatch, verifyObject = false) {
		const spec = batch.authorization.evaluationSpec;
		if (!spec || spec.evaluator === 'repository-evidence-v1') return;
		if (batch.authorization.packEvaluationId) { const pack = checkPolicyPack(batch.authorization.packEvaluationId, verifyObject); if (!pack.batchIds.includes(batch.authorization.id)) throw fault('policy_pack_invalid', 'Batch is outside the authorized pack'); return; }
		const task = policyGeneration(batch.authorization.generationId!)!; checkGenerationIntent(task); generationSource(task, verifyObject);
		const link = task.authorization.source!;
		const receipt = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(batch.authorization.id);
		const cmd = receipt && policyCommandSchema.parse(JSON.parse(String(receipt.command)));
		if (!cmd || cmd.kind !== 'policy_evaluate' || cmd.payload.caseId !== ('caseId' in spec ? spec.caseId : undefined) || cmd.payload.packId !== (spec.evaluator === 'repository-source-qa-manual-v1' ? spec.packId : undefined) || cmd.payload.packDigest !== (spec.evaluator === 'repository-source-qa-manual-v1' ? spec.packDigest : undefined) || cmd.payload.workspaceId !== link.workspaceId || cmd.payload.expectedActive !== link.choiceId || cmd.payload.sourceId !== link.sourceId || cmd.payload.snapshotDigest !== link.snapshotDigest || cmd.payload.generationId !== task.authorization.id || cmd.payload.baselineDigest !== task.authorization.baselineDigest || cmd.payload.candidateDigest !== task.candidateDigest || policyDigest(cmd.payload.budget) !== policyDigest(batch.authorization.budget) || receiptSchema.parse(JSON.parse(String(receipt!.result))).focusId !== batch.authorization.id) throw fault('policy_generation_mismatch', 'Evaluation has no exact separate authorization receipt');
		manualPack(spec, verifyObject);
	}
	function generationSource(task: PolicyGeneration, verifyObject = true) {
		const link = task.authorization.source; if (!link) return undefined;
		const source = checkedSource(link.sourceId, link.workspaceId, link.workspacePath, link.choiceId, link.snapshotDigest);
		const choice = policyChoices().find(row => row.id === link.choiceId);
		if (!choice || choice.policyId !== task.authorization.policyId || choice.digest !== task.authorization.baselineDigest || source.status !== 'sealed') throw fault('policy_generation_mismatch', 'Generation source or baseline approval differs');
		if (verifyObject) readRepositorySnapshot(repositoryObjects, link.snapshotDigest);
		return source;
	}
	function checkedSource(id: string, workspaceId: string, workspacePath: string, choiceId: string, digest?: string) {
		const source = policySource(id);
		if (!source || source.workspaceId !== workspaceId || source.workspacePath !== workspacePath || source.choiceId !== choiceId || (digest !== undefined && source.conditions.sourceSnapshot!.digest !== digest)) throw fault('policy_source_conflict', '快照、工作区或采纳版本已变化，请重新预览');
		return source;
	}
	function policySession(sessionId: string) { const row = db.prepare('SELECT data FROM policy_sessions WHERE session=?').get(sessionId); return row ? policySessionSchema.parse(JSON.parse(String(row.data))) : undefined; }
	function policySessionRun(sessionId: string) {
		const binding = policySession(sessionId); if (!binding) return undefined;
		const batch = policyBatch(binding.batchId); const entry = batch?.authorization.runs.find(item => item.run.policyDigest === binding.policyDigest && (binding.sourceId || item.run.conditionsDigest === binding.conditionsDigest));
		if (!entry) throw fault('policy_binding_invalid', 'Bound source snapshot is missing');
		const policy = policyContent(binding.policyId, binding.policyDigest);
		if (!binding.sourceId) { checkEvaluationIntent(batch!, true); return { ...entry.run, runId: sessionId.slice(11), policy }; }
		const source = checkedSource(binding.sourceId, binding.workspaceId, binding.workspacePath, binding.choiceId);
		if (source.status !== 'sealed' || policyDigest(source.conditions) !== binding.conditionsDigest || policyDigest(readRepositorySnapshot(repositoryObjects, source.conditions.sourceSnapshot!.digest)) !== policyDigest(snapshotForSource(source))) throw fault('policy_source_invalid', '已绑定的封存快照缺失或损坏');
		return { ...entry.run, runId: sessionId.slice(11), policy, conditions: source.conditions, conditionsDigest: binding.conditionsDigest };
	}
	function checkedPolicyBatch(batchId: string, selectedDigest?: string) {
		const batch = policyBatch(batchId);
		if (batch) checkEvaluationIntent(batch);
		if (!batch?.evaluation || batch.authorization.runs.length !== 2) throw fault('policy_incomplete', 'A paired evaluated batch is required');
		validateGeneratedBatch(batch.authorization);
		if (batch.authorization.generationId) {
			generationSource(policyGeneration(batch.authorization.generationId)!);
			const rows = attempts().filter(row => row.ownerId === batch.authorization.generationId);
			if (rows.length !== 1 || rows.some(row => row.state !== 'succeeded' || row.usageState !== 'confirmed' || row.diagnostic)) throw fault('policy_incomplete', 'Candidate generation usage is incomplete or changed');
			const task = policyGeneration(batch.authorization.generationId)!;
			const response = policyGenerationResponseSchema.parse(JSON.parse(task.response));
			if (policyDigest({ schemaVersion: 1, kind: 'repository-evidence-policy', instructions: response.instructions }) !== task.candidateDigest) throw fault('policy_incomplete', 'Generator response differs from its sealed candidate');
		}
		const versions = batch.authorization.runs.filter(entry => selectedDigest === undefined || entry.run.policyDigest === selectedDigest);
		if (!versions.length) throw fault('policy_choice_conflict', 'Selected version is absent from the approved batch');
		for (const entry of versions) policyContent(batch.authorization.policyId, entry.run.policyDigest);
		const result = evaluatePolicyBatch(batch, attempts(), manualPack(batch.authorization.evaluationSpec));
		if (result.status === 'incomplete' || policyDigest(result) !== policyDigest({ evidenceDigest: batch.evaluation.evidenceDigest, status: batch.evaluation.status, sides: batch.evaluation.sides })) throw fault('policy_incomplete', 'Evaluation evidence, usage or cleanup is incomplete or changed');
		return batch;
	}
	function checkedPolicyReview(batchId: string, selectedDigest?: string) {
		const batch = checkedPolicyBatch(batchId, selectedDigest);
		if (batch.authorization.packEvaluationId) for (const id of checkPolicyPack(batch.authorization.packEvaluationId).batchIds) checkedPolicyBatch(id, selectedDigest);
		return batch;
	}

	function policyReview() {
		const rows = attempts();
		const reviews = db.prepare('SELECT id FROM policy_batches ORDER BY rowid').all().flatMap(row => {
			const batch = policyBatch(String(row.id))!; if (batch.authorization.runs.length !== 2) return [];
			let eligible = true; let verified = false; let error: string | null = null;
			try { checkedPolicyBatch(String(row.id)); verified = true; if (batch.authorization.packEvaluationId) checkedPolicyReview(String(row.id)); } catch (e) { eligible = false; error = e instanceof Error ? e.message : 'Evaluation unavailable'; }
			const auth = batch.authorization; const task = auth.generationId ? policyGeneration(auth.generationId) : undefined;
			let rationale = ''; try { if (task?.response) rationale = policyGenerationResponseSchema.parse(JSON.parse(task.response)).rationale; } catch {}
			return [{ ...task?.authorization.source ? { workspaceId: task.authorization.source.workspaceId, sourceId: task.authorization.source.sourceId, executionStatus: batch.status, cleanupPending: batch.progress.filter(row => row.resource && !batch.evidence?.some(item => item.runId === row.runId && item.cleanup.processExited && item.cleanup.directoryRemoved)).length } : {}, policyId: auth.policyId, batchId: auth.id, ...auth.packEvaluationId ? { packEvaluationId: auth.packEvaluationId } : {}, baselineDigest: auth.runs[0].run.policyDigest, candidateDigest: auth.runs[1].run.policyDigest, evidenceDigest: batch.evaluation?.evidenceDigest ?? null, generationId: auth.generationId ?? null, rationale, question: auth.runs[0].run.conditions.question, paths: auth.runs[0].run.conditions.files.map(file => file.path), limits: `固定响应；每侧最多 ${auth.runs[0].run.conditions.budget.maxRequests} 次请求、每次输出 ${auth.runs[0].run.conditions.budget.maxOutputTokens} Token、${auth.runs[0].run.conditions.budget.maxToolCalls} 次工具、${auth.runs[0].run.conditions.budget.maxDurationMs / 1000} 秒；整批最多 ${auth.budget.maxRequests} 次请求`, status: verified ? batch.evaluation!.status : batch.evaluation ? 'incomplete' : 'unevaluated', eligible, error,
				sides: auth.runs.map(({ side, run }) => { const usage = rows.filter(item => item.ownerId === auth.id && item.sessionId === run.runId); const evidence = batch.evidence?.find(item => item.runId === run.runId); const result = batch.evaluation?.sides.find(item => item.runId === run.runId); const sources = evidence?.result?.events.filter(item => item.type === 'tool/result').flatMap(item => { const result = z.object({ message: z.object({ content: z.array(z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })) })) }) }).safeParse(item.data); return result.success ? result.data.message.content.flatMap(block => block.content.flatMap(text => text.type === 'text' && text.text ? [text.text] : [])) : []; }) ?? []; return { side, instructions: run.policy.instructions, sources, response: evidence?.result?.finalResponse ?? '', infrastructure: verified && (result?.infrastructure ?? false), facts: verified && (result?.facts ?? false), citations: verified && (result?.citations ?? false), requests: usage.length, tools: evidence?.result?.events.filter(item => item.type === 'tool/call').length ?? 0, totalTokens: !usage.length || usage.some(item => item.usageState !== 'confirmed' || ['reserved', 'in_flight'].includes(item.state)) ? null : usage.reduce((sum, item) => sum + (item.tokens.total ?? 0), 0) }; }),
			}];
		});
		const generations = db.prepare('SELECT id FROM policy_generations ORDER BY rowid').all().flatMap(row => {
			const task = policyGeneration(String(row.id))!; const link = task.authorization.source; if (!link) return [];
			let instructions = ''; let rationale = ''; try { const parsed = policyGenerationResponseSchema.parse(JSON.parse(task.response)); instructions = parsed.instructions; rationale = parsed.rationale; } catch {}
			const usage = rows.filter(row => row.ownerId === task.authorization.id);
			return [{ id: task.authorization.id, workspaceId: link.workspaceId, sourceId: link.sourceId, snapshotDigest: link.snapshotDigest, baselineDigest: task.authorization.baselineDigest, candidateDigest: task.candidateDigest, requirements: task.authorization.requirements, status: task.status, error: task.error, instructions, rationale, budget: task.authorization.budget, requests: usage.length, totalTokens: usage.some(row => row.usageState !== 'confirmed' || ['reserved', 'in_flight'].includes(row.state)) ? null : usage.reduce((sum, row) => sum + (row.tokens.total ?? 0), 0) }];
		});
		const qaPacks = db.prepare('SELECT id FROM policy_qa_packs ORDER BY rowid').all().map(row => { const pack = policyQaPack(String(row.id))!; return { id: pack.id, workspaceId: pack.workspaceId, sourceId: pack.content.sourceId, snapshotDigest: pack.content.snapshotDigest, digest: pack.digest, parentId: pack.parentId, status: pack.status, createdAt: pack.createdAt }; });
		return policyReviewSnapshotSchema.parse({ packEvaluations: db.prepare('SELECT id FROM policy_pack_evaluations ORDER BY rowid').all().map(row => policyPackSummary(String(row.id))), qaPacks, generations, choices: policyChoices(), sessions: policySessions(), reviews, sources: policySources().map(source => ({ id: source.id, workspaceId: source.workspaceId, choiceId: source.choiceId, snapshotDigest: source.conditions.sourceSnapshot!.digest, status: source.status, createdAt: source.createdAt, ...sourceQaAvailable(source.conditions.files) ? { qaAvailable: true } : {}, files: repositoryManifest(snapshotForSource(source)) })) });
	}
	function checkPolicyCommand(input: unknown, workspacePath: string) {
		const cmd = policyCommandSchema.parse(input);
		if (cmd.expectedRevision !== read().snapshotRevision) throw fault('state_conflict', 'RSI 状态已变化，请刷新后重新确认');
		const active = policySelection(cmd.payload.workspaceId);
		if (active && active.workspacePath !== workspacePath) throw fault('workspace_conflict', '工作区路径已经变化');
		if ('expectedActive' in cmd.payload && cmd.payload.expectedActive !== (active?.id ?? null)) throw fault('state_conflict', '已采纳版本已变化，请重新审阅');
		if (active && (cmd.kind === 'policy_preview' || cmd.kind === 'policy_seal')) checkedPolicyReview(active.batchId, active.digest);
		return active;
	}
	function policyCommand(input: unknown, workspacePath: string, captured?: unknown, runtimeDigest?: string) {
		const cmd = policyCommandSchema.parse(input);
		return transaction(() => {
			const previous = businessReceipt(cmd); if (previous) return previous;
			const active = checkPolicyCommand(cmd, workspacePath);
			let focusId: string = cmd.operationId;
			if (cmd.kind === 'policy_generate' || cmd.kind === 'policy_evaluate' || cmd.kind === 'policy_evaluate_pack') {
				if (!active) throw fault('policy_approval_missing', '请先明确采纳一个版本');
				const p = cmd.payload; const source = checkedSource(p.sourceId, p.workspaceId, workspacePath, p.expectedActive, p.snapshotDigest);
				if (source.status !== 'sealed' || active.digest !== p.baselineDigest) throw fault('policy_source_conflict', '需要当前策略与明确封存的精确快照');
				checkedPolicyReview(active.batchId, active.digest); readRepositorySnapshot(repositoryObjects, p.snapshotDigest);
				const busyGeneration = db.prepare('SELECT data FROM policy_generations').all().map(row => policyGenerationSchema.parse(JSON.parse(String(row.data)))).some(row => row.authorization.source?.workspaceId === p.workspaceId && ['authorized', 'running'].includes(row.status));
				const busyBatch = db.prepare('SELECT data FROM policy_batches').all().map(row => policyBatchSchema.parse(JSON.parse(String(row.data)))).some(row => row.authorization.generationId && policyGeneration(row.authorization.generationId)?.authorization.source?.workspaceId === p.workspaceId && ['authorized', 'running'].includes(row.status));
				if (busyGeneration || busyBatch) throw fault('policy_busy', '本工作区已有生成或评测在执行');
				if (cmd.kind === 'policy_generate') {
					authorizePolicyGeneration({ id: cmd.operationId, policyId: active.policyId, baselineDigest: active.digest, requirements: cmd.payload.requirements, budget: cmd.payload.budget, source: { workspaceId: p.workspaceId, workspacePath, choiceId: active.id, sourceId: source.id, snapshotDigest: p.snapshotDigest } });
				} else {
					const task = policyGeneration(cmd.payload.generationId); const link = task?.authorization.source;
					const usage = attempts().filter(row => row.ownerId === task?.authorization.id);
					if (!task || task.status !== 'sealed' || task.authorization.policyId !== active.policyId || task.authorization.baselineDigest !== p.baselineDigest || task.candidateDigest !== cmd.payload.candidateDigest || !link || link.sourceId !== source.id || link.choiceId !== active.id || link.snapshotDigest !== p.snapshotDigest || usage.length !== 1 || usage.some(row => row.state !== 'succeeded' || row.usageState !== 'confirmed' || row.diagnostic)) throw fault('policy_generation_mismatch', '需要该策略和快照的完整候选及已确认用量');
					const pack = cmd.payload.packId ? policyQaPack(cmd.payload.packId) : undefined;
					if (cmd.payload.packId && (!pack || pack.status !== 'sealed' || pack.digest !== cmd.payload.packDigest || pack.workspaceId !== p.workspaceId || pack.workspacePath !== workspacePath || pack.choiceId !== active.id || pack.content.sourceId !== source.id)) throw fault('policy_qa_invalid', '需要当前快照明确封存的精确问答包');
					const content = pack ? readSealedJson(join(dirname(file), 'repository-question-packs'), pack.digest, 65536, value => policyQaContentSchema.parse(value)) : undefined;
					let group: PolicyPackEvaluation | undefined;
					if (cmd.kind === 'policy_evaluate_pack') {
						const createdAt = Date.now();
						group = policyPackEvaluationSchema.parse({ id: cmd.operationId, workspaceId: p.workspaceId, workspacePath, choiceId: active.id, policyId: active.policyId, generationId: task.authorization.id, baselineDigest: p.baselineDigest, candidateDigest: cmd.payload.candidateDigest, sourceId: source.id, snapshotDigest: p.snapshotDigest, packId: pack!.id, packDigest: pack!.digest, runtimeDigest, budget: cmd.payload.budget, batchIds: policyPackCases.map(() => randomUUID()), createdAt, deadline: createdAt + cmd.payload.budget.maxDurationMs });
						if (policyBatch(group.id) || policyGeneration(group.id) || attempts().some(row => row.ownerId === group!.id) || policyPackEvaluation(group.id)) throw fault('policy_owner_conflict', 'Whole-pack identity was already used');
						db.prepare('INSERT INTO policy_pack_evaluations VALUES (?,?)').run(group.id, JSON.stringify(group));
					}
					for (const [index, caseId] of (group ? policyPackCases : [cmd.kind === 'policy_evaluate' ? cmd.payload.caseId : undefined]).entries()) {
						const fixed = pack ? manualSourceQuestion(pack.id, content!, source.id, source.conditions, caseId) : sourceEvaluation(source.id, source.conditions, caseId);
						authorizePolicyBatch({ id: group ? group.batchIds[index] : cmd.operationId, ...group ? { packEvaluationId: group.id } : {}, policyId: active.policyId, generationId: task.authorization.id, runtimeDigest, evaluationSpec: fixed.spec, runs: [{ side: 'baseline', run: freezePolicyRun(policyContent(active.policyId, p.baselineDigest), fixed.conditions) }, { side: 'candidate', run: freezePolicyRun(policyContent(active.policyId, cmd.payload.candidateDigest), fixed.conditions) }], budget: group ? { ...group.budget, maxRequests: Math.min(16, group.budget.maxRequests) } : cmd.payload.budget });
					}
				}
			} else if (cmd.kind === 'policy_qa_draft' || cmd.kind === 'policy_qa_seal') {
				const p = cmd.payload; const source = checkedSource(p.sourceId, p.workspaceId, workspacePath, p.expectedActive, p.snapshotDigest);
				if (!active || source.status !== 'sealed') throw fault('policy_qa_source_mismatch', '请先明确封存当前策略的源码快照');
				readRepositorySnapshot(repositoryObjects, p.snapshotDigest);
				if (cmd.kind === 'policy_qa_draft') {
					const parent = cmd.payload.parentId ? policyQaPack(cmd.payload.parentId) : undefined;
					if (cmd.payload.parentId && (!parent || parent.workspaceId !== p.workspaceId || parent.workspacePath !== workspacePath || parent.choiceId !== active.id || parent.content.sourceId !== source.id)) throw fault('policy_qa_conflict', '只能从本快照的问答包创建修订草稿');
					const content = validateManualQa({ schemaVersion: 1, kind: 'repository-source-qa-pack', sourceId: source.id, snapshotDigest: p.snapshotDigest, questions: cmd.payload.questions }, source.conditions);
					const pack = policyQaPackSchema.parse({ id: cmd.operationId, workspaceId: p.workspaceId, workspacePath, choiceId: active.id, content, digest: policyDigest(content), parentId: cmd.payload.parentId, status: 'draft', createdAt: Date.now(), sealedAt: null, sealId: null });
					db.prepare('INSERT INTO policy_qa_packs VALUES (?,?)').run(pack.id, JSON.stringify(pack));
				} else {
					const pack = policyQaPack(cmd.payload.packId);
					if (!pack || pack.status !== 'draft' || pack.digest !== cmd.payload.packDigest || pack.workspaceId !== p.workspaceId || pack.workspacePath !== workspacePath || pack.choiceId !== active.id || pack.content.sourceId !== source.id || pack.content.snapshotDigest !== p.snapshotDigest) throw fault('policy_qa_conflict', '草稿、源码或策略已变化，请重新审阅');
					sealJson(join(dirname(file), 'repository-question-packs'), pack.content, 65536, value => validateManualQa(value, source.conditions));
					db.prepare('UPDATE policy_qa_packs SET data=? WHERE id=?').run(JSON.stringify(policyQaPackSchema.parse({ ...pack, status: 'sealed', sealedAt: Date.now(), sealId: cmd.operationId })), pack.id); focusId = pack.id;
				}
			} else if (cmd.kind === 'policy_stop') {
				const groupId = cmd.payload.target === 'pack-evaluation' ? cmd.payload.jobId : cmd.payload.target === 'evaluation' ? policyBatch(cmd.payload.jobId)?.authorization.packEvaluationId : undefined;
				const task = cmd.payload.target === 'generation' ? policyGeneration(cmd.payload.jobId) : policyGeneration((groupId ? policyPackEvaluation(groupId)?.generationId : policyBatch(cmd.payload.jobId)?.authorization.generationId) ?? cmd.payload.jobId);
				if (!task?.authorization.source || task.authorization.source.workspaceId !== cmd.payload.workspaceId || task.authorization.source.workspacePath !== workspacePath) throw fault('policy_binding_missing', '本工作区没有该执行');
				if (cmd.payload.target === 'generation') { if (['authorized', 'running'].includes(task.status)) { task.status = 'cancelled'; task.error = '用户停止；保留用量，不自动重放'; task.revision++; savePolicyGeneration(task); } }
				else if (groupId) stopPolicyPack(groupId, 'cancelled'); else stopPolicyBatch(cmd.payload.jobId, 'cancelled');
				focusId = groupId ?? cmd.payload.jobId;
			} else if (cmd.kind === 'policy_adopt' || cmd.kind === 'policy_restore') {
				let target;
				if (cmd.kind === 'policy_adopt') {
					const p = cmd.payload; const batch = checkedPolicyReview(p.batchId); const auth = batch.authorization;
					const context = auth.generationId ? policyGeneration(auth.generationId)?.authorization.source : undefined;
					if (context && (context.workspaceId !== p.workspaceId || context.workspacePath !== workspacePath)) throw fault('workspace_conflict', '源码评测仅能在原工作区明确采纳');
					if (auth.policyId !== p.policyId || auth.runs[0].run.policyDigest !== p.baselineDigest || auth.runs[1].run.policyDigest !== p.candidateDigest || batch.evaluation!.evidenceDigest !== p.evidenceDigest) throw fault('policy_choice_conflict', '审阅对象或评测批次已变化');
					target = { policyId: p.policyId, digest: p.choice === 'baseline' ? p.baselineDigest : p.candidateDigest, batchId: p.batchId, evidenceDigest: p.evidenceDigest, approvalId: cmd.operationId };
				} else {
					const p = cmd.payload; const approval = policyChoices().find(row => row.id === p.targetChoiceId && row.kind === 'adopt' && row.workspaceId === p.workspaceId && row.workspacePath === workspacePath);
					if (!approval) throw fault('policy_approval_missing', '只能恢复本工作区明确采纳过的版本');
					const batch = checkedPolicyReview(approval.batchId, approval.digest);
					if (batch.evaluation!.evidenceDigest !== approval.evidenceDigest) throw fault('policy_choice_conflict', '原采纳证据已经变化');
					target = { policyId: approval.policyId, digest: approval.digest, batchId: approval.batchId, evidenceDigest: approval.evidenceDigest, approvalId: approval.id };
				}
				const choice = policyChoiceSchema.parse({ ...target, id: cmd.operationId, workspaceId: cmd.payload.workspaceId, workspacePath, previousId: active?.id ?? null, kind: cmd.kind === 'policy_adopt' ? 'adopt' : 'restore', createdAt: Date.now() });
				db.prepare('INSERT INTO policy_choices VALUES (?,?)').run(choice.id, JSON.stringify(choice));
			} else if (cmd.kind === 'policy_preview') {
				if (!active) throw fault('policy_approval_missing', '请先明确采纳一个版本');
				const snapshot = repositorySnapshotSchema.parse(captured);
				if (snapshot.root !== workspacePath || policyDigest([...cmd.payload.paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) !== policyDigest(snapshot.files.map(file => file.path))) throw fault('policy_source_conflict', '采集结果与选择的工作区或文件不符');
				const source = policySourceSchema.parse({ id: cmd.operationId, workspaceId: cmd.payload.workspaceId, workspacePath, choiceId: active.id, conditions: conditionsForSource(active, snapshot), createdAt: Date.now(), status: 'preview', sealedAt: null, sealId: null });
				db.prepare('INSERT INTO policy_sources VALUES (?,?)').run(source.id, JSON.stringify(source));
			} else if (cmd.kind === 'policy_seal') {
				const p = cmd.payload; const source = checkedSource(p.sourceId, p.workspaceId, workspacePath, p.expectedActive, p.snapshotDigest);
				if (source.status !== 'preview' || !active) throw fault('policy_source_conflict', '快照已封存或版本已变化');
				if (policyDigest(repositorySnapshotSchema.parse(captured)) !== p.snapshotDigest) throw fault('policy_source_changed', '源码已变化，请重新预览后确认封存');
				sealRepositorySnapshot(repositoryObjects, snapshotForSource(source));
				db.prepare('UPDATE policy_sources SET data=? WHERE id=?').run(JSON.stringify(policySourceSchema.parse({ ...source, status: 'sealed', sealedAt: Date.now(), sealId: cmd.operationId })), source.id); focusId = source.id;
			} else if (cmd.kind === 'policy_session' || cmd.kind === 'policy_source_session') {
				if (!active) throw fault('policy_approval_missing', '请先明确采纳一个版本');
				const batch = checkedPolicyReview(active.batchId, active.digest); const run = batch.authorization.runs.find(entry => entry.run.policyDigest === active.digest)!.run;
				const source = cmd.kind === 'policy_source_session' ? checkedSource(cmd.payload.sourceId, cmd.payload.workspaceId, workspacePath, cmd.payload.expectedActive, cmd.payload.snapshotDigest) : undefined;
				if (source && (source.status !== 'sealed' || policyDigest(readRepositorySnapshot(repositoryObjects, source.conditions.sourceSnapshot!.digest)) !== policyDigest(snapshotForSource(source)))) throw fault('policy_source_invalid', '请先明确封存完好的快照');
				focusId = randomUUID();
				const binding = policySessionSchema.parse({ sessionId: policySessionId(focusId), choiceId: active.id, workspaceId: active.workspaceId, workspacePath, policyId: active.policyId, policyDigest: active.digest, batchId: active.batchId, conditionsDigest: source ? policyDigest(source.conditions) : run.conditionsDigest, createdAt: Date.now(), ...source ? { sourceId: source.id } : {} });
				db.prepare('INSERT INTO policy_sessions VALUES (?,?)').run(binding.sessionId, JSON.stringify(binding));
			} else {
				const binding = policySession(cmd.payload.sessionId);
				if (!binding || binding.workspaceId !== cmd.payload.workspaceId || binding.workspacePath !== workspacePath) throw fault('policy_binding_missing', '本工作区没有该只读会话');
				policySessionRun(binding.sessionId); focusId = binding.sessionId.slice(11);
			}
			write(read()); const result = { revision: read().snapshotRevision, focusId };
			db.prepare('INSERT INTO g1_operations VALUES (?,?,?)').run(cmd.operationId, JSON.stringify(cmd), JSON.stringify(result));
			return result;
		});
	}
	function policyRunBinding(sessionId: string) {
		const rows = db.prepare("SELECT data FROM policy_batches WHERE EXISTS (SELECT 1 FROM json_each(policy_batches.data,'$.authorization.runs') WHERE json_extract(value,'$.run.runId')=?)").all(sessionId);
		if (rows.length > 1) throw fault('policy_binding_conflict', 'A session belongs to multiple policy batches');
		if (!rows.length) return undefined;
		const batch = policyBatchSchema.parse(JSON.parse(String(rows[0].data)));
		return { batch, entry: batch.authorization.runs.find(entry => entry.run.runId === sessionId)!, progress: batch.progress.find(row => row.runId === sessionId)! };
	}
	function savePolicyBatch(batch: PolicyBatch) { db.prepare('UPDATE policy_batches SET data=? WHERE id=?').run(JSON.stringify(policyBatchSchema.parse(batch)), batch.authorization.id); write(read()); }
	function policyContent(policyId: string, digest: string) {
		if (!policyVersions(policyId).some(row => row.digest === digest)) throw fault('policy_version_missing', 'Policy version is not registered');
		return readPolicy(policyObjects, digest);
	}
	function registerPolicyVersion(policyId: string, content: unknown, parentDigest: string | null, generationId?: string) {
		z.uuid().parse(policyId);
		const sealed = sealPolicy(policyObjects, content);
		const versions = policyVersions(policyId); const previous = versions.find(row => row.digest === sealed.digest);
		if (previous) { if (previous.parentDigest !== parentDigest || previous.generationId !== generationId) throw fault('policy_version_conflict', 'Version already has different provenance'); return previous; }
		if ((parentDigest === null && versions.length > 0) || (parentDigest !== null && !versions.some(row => row.digest === parentDigest))) throw fault('policy_parent_missing', 'A new version requires its registered parent in this policy');
		const version = policyVersionSchema.parse({ policyId, digest: sealed.digest, parentDigest, createdAt: Date.now(), ...generationId ? { generationId } : {} });
		db.prepare('INSERT INTO policy_versions VALUES (?,?,?)').run(policyId, version.digest, JSON.stringify(version)); write(read()); return version;
	}
	function sealPolicyVersion(policyId: string, content: unknown, parentDigest: string | null = null) { return transaction(() => registerPolicyVersion(policyId, content, parentDigest)); }
	function policyGeneration(id: string) { const row = db.prepare('SELECT data FROM policy_generations WHERE id=?').get(z.uuid().parse(id)); return row ? policyGenerationSchema.parse(JSON.parse(String(row.data))) : undefined; }
	function policyGenerationBinding(sessionId: string) { const id = sessionId.startsWith('rsi-policy-generation/') ? sessionId.slice('rsi-policy-generation/'.length) : null; return id && z.uuid().safeParse(id).success ? policyGeneration(id) : undefined; }
	function savePolicyGeneration(task: PolicyGeneration) { db.prepare('UPDATE policy_generations SET data=? WHERE id=?').run(JSON.stringify(policyGenerationSchema.parse(task)), task.authorization.id); write(read()); }
	function generationPrompt(task: PolicyGeneration) {
		generationSource(task); checkGenerationIntent(task);
		const content = policyContent(task.authorization.policyId, task.authorization.baselineDigest);
		if (policyGeneratorInputDigest(content, task.authorization.requirements) !== task.authorization.inputDigest) throw fault('policy_generation_changed', 'Frozen generator input changed');
		return policyGeneratorPrompt(content, task.authorization.requirements);
	}
	function authorizePolicyGeneration(input: unknown) {
		const request = policyGenerationInputSchema.parse(input);
		return transaction(() => {
			const baseline = policyContent(request.policyId, request.baselineDigest);
			const authorization = { ...request, inputDigest: policyGeneratorInputDigest(baseline, request.requirements) };
			generationSource({ authorization } as PolicyGeneration);
			const previous = policyGeneration(request.id);
			if (previous) { if (policyDigest(previous.authorization) !== policyDigest(authorization)) throw fault('policy_generation_conflict', 'Generation ID already authorizes different input'); return previous; }
			const old = business();
			if (policyBatch(request.id) || policyPackEvaluation(request.id) || attempts().some(row => row.ownerId === request.id || row.sessionId === policyGenerationSession(request.id)) || policyRunBinding(policyGenerationSession(request.id)) || old.analyses.some(row => row.id === request.id) || old.mainflow.tasks.some(row => row.id === request.id || row.comparison?.id === request.id)) throw fault('policy_owner_conflict', 'Generation ID collides with a spending identity');
			const prompt = policyGeneratorPrompt(baseline, request.requirements);
			if (Buffer.byteLength(JSON.stringify([prompt.system, prompt.input])) > request.budget.maxInputBytes) throw fault('budget_config', 'Generation input exceeds confirmed bytes');
			const createdAt = Date.now(); const task = policyGenerationSchema.parse({ authorization, revision: 1, createdAt, deadline: createdAt + request.budget.maxDurationMs, status: 'authorized', response: '', candidateDigest: null, error: null });
			db.prepare('INSERT INTO policy_generations VALUES (?,?)').run(request.id, JSON.stringify(task)); write(read()); return task;
		});
	}
	function startPolicyGeneration(id: string, expectedRevision: number) {
		return transaction(() => {
			const task = policyGeneration(id);
			if (!task || task.revision !== expectedRevision || task.status !== 'authorized') throw fault('policy_generation_conflict', 'Generation cannot start, change or replay');
			generationPrompt(task);
			if (Date.now() < read().updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= task.deadline) throw fault('budget_exhausted', 'Generation authorization expired');
			task.status = 'running'; task.revision++; savePolicyGeneration(task); return task;
		});
	}
	function recordPolicyGenerationResponse(id: string, response: string) {
		return transaction(() => {
			const task = policyGeneration(id);
			if (!task || task.status !== 'running' || !response.startsWith(task.response)) throw fault('policy_generation_conflict', 'Generation response cannot be replaced');
			if (response === task.response) return task;
			task.response = response; task.revision++; savePolicyGeneration(task); return task;
		});
	}
	function sealPolicyGeneration(id: string, response: string) {
		return transaction(() => {
			const task = policyGeneration(id);
			if (task?.status === 'sealed' && task.response === response) return task;
			if (!task || task.status !== 'running' || task.response !== response) throw fault('policy_generation_conflict', 'Only the exact running response can seal');
			if (Date.now() < read().updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= task.deadline) throw fault('budget_exhausted', 'Generation sealing window ended');
			generationPrompt(task);
			const rows = attempts().filter(row => row.owner === 'rsi' && row.ownerId === id);
			if (rows.length !== 1 || rows.some(row => row.purpose !== 'generation' || row.state !== 'succeeded' || row.usageState !== 'confirmed' || row.diagnostic)) throw fault('policy_generation_incomplete', 'Generation usage or execution is incomplete');
			const result = policyGenerationResponseSchema.parse(JSON.parse(response));
			const content = { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: result.instructions };
			if (policyDigest(content) === task.authorization.baselineDigest) throw fault('policy_generation_unchanged', 'Candidate did not change baseline instructions');
			const version = registerPolicyVersion(task.authorization.policyId, content, task.authorization.baselineDigest, id);
			task.status = 'sealed'; task.candidateDigest = version.digest; task.revision++; savePolicyGeneration(task); return task;
		});
	}
	function failPolicyGeneration(id: string, status: 'failed' | 'cancelled', response: string, error: string) {
		z.enum(['failed', 'cancelled']).parse(status);
		return transaction(() => {
			const task = policyGeneration(id);
			if (task?.status === status && task.response === response && task.error === error) return task;
			if (!task || !['authorized', 'running'].includes(task.status) || !response.startsWith(task.response)) throw fault('policy_generation_conflict', 'Terminal generation cannot change or replay');
			task.status = status; task.response = response; task.error = error; task.revision++; savePolicyGeneration(task); return task;
		});
	}
	function validateGeneratedBatch(authorization: PolicyBatch['authorization']) {
		if (authorization.generationId) {
			const task = policyGeneration(authorization.generationId);
			if (!task || task.status !== 'sealed' || task.authorization.policyId !== authorization.policyId || authorization.runs.length !== 2 || authorization.runs[0].run.policyDigest !== task.authorization.baselineDigest || authorization.runs[1].run.policyDigest !== task.candidateDigest || !authorization.evaluationSpec) throw fault('policy_generation_mismatch', 'Evaluation requires the exact sealed generation lineage');
		}
		const spec = authorization.evaluationSpec;
		if (spec && spec.evaluator !== 'repository-evidence-v1') {
			const task = authorization.generationId && policyGeneration(authorization.generationId);
			const source = task && generationSource(task, false);
			if (!source || source.id !== spec.sourceId || authorization.runs.some(row => row.run.conditionsDigest !== policyDigest(policyEvaluationCase(spec, source.conditions, false).conditions))) throw fault('policy_generation_mismatch', 'Source evaluation differs from exact generation snapshot');
		}
		validatePolicyEvaluation(authorization, manualPack(authorization.evaluationSpec, false));
		const candidate = authorization.runs.find(row => row.side === 'candidate');
		const provenance = candidate && policyVersions(authorization.policyId).find(row => row.digest === candidate.run.policyDigest)?.generationId;
		if (provenance && provenance !== authorization.generationId) throw fault('policy_generation_mismatch', 'Candidate generation provenance must be included in evaluation authorization');
	}
	function authorizePolicyBatch(input: unknown) {
		const authorization = policyBatchInputSchema.parse(input);
		validatePolicyEvaluation(authorization, manualPack(authorization.evaluationSpec));
		return transaction(() => {
			const previous = policyBatch(authorization.id);
			if (previous) { if (policyDigest(previous.authorization) !== policyDigest(authorization)) throw fault('policy_batch_conflict', 'Batch ID already authorizes different input'); return previous; }
			const old = business();
			if (policyGeneration(authorization.id) || policyPackEvaluation(authorization.id) || attempts().some(row => row.ownerId === authorization.id) || old.analyses.some(row => row.id === authorization.id) || old.mainflow.tasks.some(row => row.id === authorization.id || row.comparison?.id === authorization.id)) throw fault('policy_owner_conflict', 'Batch ID collides with another spending owner');
			validateGeneratedBatch(authorization);
			for (const { run } of authorization.runs) {
				if (policyRunBinding(run.runId) || attempts().some(row => row.sessionId === run.runId)) throw fault('policy_binding_conflict', 'Policy session identity was already used');
				if (!policyVersions(authorization.policyId).some(row => row.digest === run.policyDigest) || policyDigest(readPolicy(policyObjects, run.policyDigest)) !== policyDigest(run.policy)) throw fault('policy_version_missing', 'Run requires its registered intact policy version');
			}
			const group = authorization.packEvaluationId ? policyPackEvaluation(authorization.packEvaluationId) : undefined;
			if (authorization.packEvaluationId && (!group || !group.batchIds.includes(authorization.id))) throw fault('policy_pack_invalid', 'Whole-pack membership is missing');
			const createdAt = group?.createdAt ?? Date.now();
			const batch = policyBatchSchema.parse({ authorization, revision: 1, createdAt, deadline: createdAt + authorization.budget.maxDurationMs, status: 'authorized', progress: authorization.runs.map(({ run }) => ({ runId: run.runId, status: 'pending', startedAt: null })) });
			db.prepare('INSERT INTO policy_batches VALUES (?,?)').run(authorization.id, JSON.stringify(batch)); write(read()); return batch;
		});
	}
	function startPolicyRun(batchId: string, runId: string) {
		return transaction(() => {
			const binding = policyRunBinding(runId);
			if (!binding || binding.batch.authorization.id !== batchId) throw fault('policy_binding_missing', 'Run is not authorized by this batch');
			const { batch, progress } = binding; checkPackDispatch(batch);
			if (!['authorized', 'running'].includes(batch.status) || progress.status !== 'pending' || batch.progress.some(row => row.status === 'running') || batch.progress.slice(0, batch.progress.indexOf(progress)).some(row => row.status === 'pending')) throw fault('policy_state_conflict', 'Run cannot start or replay in this batch');
			const rows = attempts().filter(row => row.owner === 'rsi' && row.ownerId === batchId);
			if (rows.some(row => ['reserved', 'in_flight'].includes(row.state) || (row.state !== 'not_sent' && row.usageState !== 'confirmed'))) throw fault('usage_unknown', 'Policy batch usage is unsettled');
			if (rows.length >= batch.authorization.budget.maxRequests || rows.reduce((sum, row) => sum + (row.tokens.total ?? 0), 0) >= batch.authorization.budget.tokenStopThreshold) throw fault('budget_exhausted', 'Policy batch request/token limit reached');
			if (Date.now() < read().updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= batch.deadline) throw fault('budget_exhausted', 'Policy batch dispatch window ended');
			readPolicy(policyObjects, binding.entry.run.policyDigest);
			batch.status = 'running'; progress.status = 'running'; progress.startedAt = Date.now(); batch.revision++; savePolicyBatch(batch); return batch;
		});
	}
	function finishPolicyRun(batchId: string, runId: string, outcome: 'completed' | 'failed' | 'cancelled') {
		z.enum(['completed', 'failed', 'cancelled']).parse(outcome);
		return transaction(() => {
			const binding = policyRunBinding(runId);
			if (!binding || binding.batch.authorization.id !== batchId) throw fault('policy_binding_missing', 'Run is not authorized by this batch');
			const { batch, progress } = binding;
			if (progress.status === outcome) return batch;
			if (batch.status !== 'running' || progress.status !== 'running') throw fault('policy_state_conflict', 'Terminal policy work cannot change outcome or replay');
			const rows = attempts().filter(row => row.ownerId === batchId && row.sessionId === runId);
			if (outcome === 'completed' && (!rows.length || rows.some(row => row.state !== 'succeeded' || row.usageState !== 'confirmed'))) throw fault('policy_incomplete', 'Complete execution requires settled successful attempts');
			progress.status = outcome;
			if (outcome === 'cancelled') { for (const row of batch.progress) if (row.status === 'pending') row.status = 'cancelled'; batch.status = 'cancelled'; }
			else if (batch.progress.every(row => row.status !== 'pending')) batch.status = batch.progress.every(row => row.status === 'completed') ? 'completed' : 'failed';
			batch.revision++; savePolicyBatch(batch); return batch;
		});
	}
	function stopPolicyBatch(id: string, status: 'failed' | 'cancelled' | 'interrupted') {
		return transaction(() => {
			const batch = policyBatch(id); if (!batch) throw fault('policy_binding_missing', 'Policy batch is missing');
			if (!['authorized', 'running'].includes(batch.status)) return batch;
			batch.status = status; for (const row of batch.progress) if (row.status === 'pending' || row.status === 'running') row.status = status;
			batch.revision++; savePolicyBatch(batch); return batch;
		});
	}
	function policyAccounting(policyId: string, batchId?: string) {
		z.uuid().parse(policyId);
		const group = batchId ? policyPackEvaluation(batchId) : undefined;
		if (batchId !== undefined && (group ? group.policyId : policyBatch(batchId)?.authorization.policyId) !== policyId) throw fault('policy_binding_missing', 'Batch does not belong to this policy');
		const rows = group ? attempts().filter(row => row.owner === 'rsi' && group.batchIds.includes(row.ownerId ?? '')) : db.prepare("SELECT attempts.data FROM attempts LEFT JOIN policy_batches ON json_extract(attempts.data,'$.ownerId')=policy_batches.id LEFT JOIN policy_generations ON json_extract(attempts.data,'$.ownerId')=policy_generations.id LEFT JOIN policy_sessions ON json_extract(attempts.data,'$.sessionId')=policy_sessions.session WHERE (json_extract(attempts.data,'$.owner')='rsi' AND ((json_extract(policy_batches.data,'$.authorization.policyId')=? AND (? IS NULL OR policy_batches.id=?)) OR (? IS NULL AND json_extract(policy_generations.data,'$.authorization.policyId')=?))) OR (? IS NULL AND json_extract(attempts.data,'$.owner')='session' AND json_extract(policy_sessions.data,'$.policyId')=?) ORDER BY attempts.rowid").all(policyId, batchId ?? null, batchId ?? null, batchId ?? null, policyId, batchId ?? null, policyId).map(row => attemptSchema.parse(JSON.parse(String(row.data))));
		const confirmedTokens = rows.reduce((sum, row) => sum + (row.usageState === 'confirmed' ? row.tokens.total! : 0), 0);
		return { attempts: rows, confirmedTokens, totalTokens: rows.some(row => ['reserved', 'in_flight'].includes(row.state) || (row.state !== 'not_sent' && row.usageState !== 'confirmed')) ? null : confirmedTokens };
	}
	function recordPolicyEvidence(batchId: string, input: unknown) {
		const evidence = policyEvidenceSchema.parse(input);
		return transaction(() => {
			const batch = policyBatch(batchId); const run = batch?.authorization.runs.find(row => row.run.runId === evidence.runId)?.run;
			if (!batch?.authorization.evaluationSpec || !run || run.policyDigest !== evidence.policyDigest || run.conditionsDigest !== evidence.conditionsDigest || batch.authorization.runtimeDigest !== evidence.runtimeDigest) throw fault('policy_evidence_mismatch', 'Evidence differs from its frozen batch run');
			const resource = batch.progress.find(row => row.runId === run.runId)?.resource;
			if (!resource || resource.temporaryRoot !== evidence.cleanup.temporaryRoot || resource.pid !== evidence.workerPid) throw fault('policy_evidence_mismatch', 'Evidence differs from recorded resource ownership');
			const previous = batch.evidence?.find(row => row.runId === evidence.runId);
			if (previous) { if (policyDigest(previous) !== policyDigest(evidence)) throw fault('policy_evidence_conflict', 'Retained evidence cannot be replaced'); return batch; }
			if (batch.evaluation) throw fault('policy_evidence_conflict', 'Evaluated batch is immutable');
			batch.evidence = [...batch.evidence ?? [], evidence]; batch.revision++; savePolicyBatch(batch); return batch;
		});
	}
	function recordPolicyResource(batchId: string, runId: string, temporaryRoot: string, pid: number | null) {
		const resource = policyBatchSchema.shape.progress.element.shape.resource.unwrap().parse({ temporaryRoot, pid });
		return transaction(() => {
			const batch = policyBatch(batchId); const progress = batch?.progress.find(row => row.runId === runId);
			if (!batch?.authorization.evaluationSpec || batch.status !== 'running' || progress?.status !== 'running' || (progress.resource && (progress.resource.temporaryRoot !== temporaryRoot || (progress.resource.pid !== null && progress.resource.pid !== pid)))) throw fault('policy_resource_conflict', 'Resource ownership is missing, terminal or already assigned');
			progress.resource = resource; batch.revision++; savePolicyBatch(batch);
		});
	}
	function evaluatePolicy(batchId: string) {
		return transaction(() => {
			const batch = policyBatch(batchId); if (!batch) throw fault('policy_binding_missing', 'Policy batch is missing');
			if (batch.status === 'authorized' || batch.status === 'running') throw fault('policy_incomplete', 'Stop or finish execution before evaluation');
			const result = evaluatePolicyBatch(batch, attempts(), manualPack(batch.authorization.evaluationSpec));
			if (batch.evaluation) { if (policyDigest(result) !== policyDigest({ evidenceDigest: batch.evaluation.evidenceDigest, status: batch.evaluation.status, sides: batch.evaluation.sides })) throw fault('policy_evidence_conflict', 'Evaluation inputs changed'); return batch.evaluation; }
			batch.evaluation = { ...result, evaluatedAt: Date.now() }; batch.revision++; savePolicyBatch(batch); return batch.evaluation;
		});
	}
	// ponytail: G1 有界单机状态用一条 JSON；达到上限后迁移索引表，不能静默丢弃证据。
	function mutateBusiness(change: (state: G1State) => string | null | void, command?: G1Command) {
		return transaction(() => {
			if (command) {
				const previous = businessReceipt(command);
				if (previous) return previous;
			}
			const state = business();
			if (command && command.expectedRevision !== state.revision) throw fault('state_conflict', 'RSI 状态已变化，请刷新后重新确认');
			const before = JSON.stringify(state);
			const focusId = change(state) ?? null;
			if (JSON.stringify(state) !== before) {
				state.revision++;
				db.prepare('UPDATE g1_state SET data=? WHERE id=1').run(JSON.stringify(g1StateSchema.parse(state)));
				write(read());
			}
			const result = { revision: state.revision, focusId };
			if (command) db.prepare('INSERT INTO g1_operations VALUES (?, ?, ?)').run(command.operationId, JSON.stringify(command), JSON.stringify(result));
			return result;
		});
	}
	function businessReceipt(command: G1Command): { revision: number; focusId: string | null } | undefined {
		const row = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(command.operationId);
		if (!row) return undefined;
		if (row.command !== JSON.stringify(command)) throw fault('operation_conflict', '操作 ID 已用于不同内容');
		return receiptSchema.parse(JSON.parse(String(row.result)));
	}
	function transaction<T>(action: () => T): T {
		if (db.isTransaction) return action();
		db.exec('BEGIN IMMEDIATE');
		try { const result = action(); db.exec('COMMIT'); for (const notify of listeners) notify(); return result; }
		catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
	}
	function write(state: State) {
		db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(stateSchema.parse({ ...state, snapshotRevision: state.snapshotRevision + 1, updatedAt: Date.now() })));
	}
	function command(input: unknown): Snapshot {
		const cmd = commandSchema.parse(input);
		return transaction(() => {
			const encoded = JSON.stringify(cmd);
			const existing = db.prepare('SELECT command,result FROM operations WHERE id=?').get(cmd.operationId);
			if (existing) {
				if (existing.command !== encoded) throw fault('operation_conflict', 'Operation ID was used with different content');
				return snapshotSchema.parse(JSON.parse(String(existing.result)));
			}
			const state = read();
			if (cmd.probeId !== state.probeId || cmd.expectedRevision !== state.snapshotRevision) throw fault('state_conflict', 'Probe state changed; refresh before retrying');
			if (cmd.kind === 'set_marker') state.marker = cmd.payload.marker;
			else state.cancelled = true;
			write(state);
			const result = snapshot();
			db.prepare('INSERT INTO operations VALUES (?, ?, ?)').run(cmd.operationId, encoded, JSON.stringify(result));
			return result;
		});
	}
	function reserve(attempt: Attempt) {
		attemptSchema.parse(attempt);
		if (attempt.state !== 'reserved' || attempt.revision !== 1 || attempt.startedAt !== null || attempt.endedAt !== null) throw fault('state_conflict', 'New attempt must start at reserved revision 1');
		transaction(() => {
			const state = read();
			const policy = attempt.sessionId === null ? undefined : policyRunBinding(attempt.sessionId);
			const generation = attempt.sessionId === null ? undefined : policyGenerationBinding(attempt.sessionId);
			const bound = attempt.sessionId === null ? undefined : policySessionRun(attempt.sessionId);
			if (bound) {
				if (policy || generation || attempt.owner !== 'session' || attempt.ownerId !== policySessionId(bound.runId) || attempt.purpose !== 'daily' || attempt.callKind !== 'agent' || attempt.retryOfAttemptId !== null || attempt.provider !== bound.conditions.provider || attempt.model !== bound.conditions.model) throw fault('not_authorized', '只读会话请求与固定绑定不符');
				const rows = attempts().filter(row => row.sessionId === policySessionId(bound.runId)); const budget = bound.conditions.budget;
				if (rows.some(row => row.state !== 'not_sent' && (row.usageState !== 'confirmed' || ['reserved', 'in_flight', 'interrupted', 'cancelled', 'failed'].includes(row.state)))) throw fault('usage_unknown', '只读会话上次执行未完成；请创建新会话');
				if (rows.length >= budget.maxRequests || rows.reduce((sum, row) => sum + (row.tokens.total ?? 0), 0) >= budget.tokenStopThreshold || Date.now() < state.updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= (rows[0]?.createdAt ?? Date.now()) + budget.maxDurationMs) throw fault('budget_exhausted', '只读会话的累计预算或时间窗口已结束');
			}
			if (generation) {
				const auth = generation.authorization;
				if (policy || attempt.owner !== 'rsi' || attempt.ownerId !== auth.id || attempt.purpose !== 'generation' || attempt.callKind !== 'agent' || attempt.retryOfAttemptId !== null || generation.status !== 'running') throw fault('not_authorized', 'Generation request has no active authorization');
				if (attempt.provider !== auth.budget.provider || attempt.model !== auth.budget.model) throw fault('budget_config', 'Generator route differs from authorization');
				generationPrompt(generation);
				const rows = attempts().filter(row => row.owner === 'rsi' && row.ownerId === auth.id);
				if (rows.some(row => ['reserved', 'in_flight'].includes(row.state) || row.usageState !== 'confirmed')) throw fault('usage_unknown', 'Generation usage is unsettled');
				if (rows.length >= auth.budget.maxRequests || Date.now() < state.updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= generation.deadline) throw fault('budget_exhausted', 'Generation request/window limit reached');
			} else if (attempt.ownerId && db.prepare('SELECT 1 FROM policy_generations WHERE id=?').get(attempt.ownerId)) throw fault('not_authorized', 'Generation requires its registered session');
			if (policy) {
				const { batch, entry, progress } = policy; const run = entry.run; checkEvaluationIntent(batch, true); checkPackDispatch(batch);
				if (attempt.owner !== 'rsi' || attempt.ownerId !== batch.authorization.id || attempt.purpose !== (entry.side === 'baseline' ? 'baseline' : 'evaluation') || attempt.callKind !== 'agent' || attempt.retryOfAttemptId !== null || batch.status !== 'running' || progress.status !== 'running') throw fault('not_authorized', 'Policy request has no active batch authorization');
				if (attempt.provider !== run.conditions.provider || attempt.model !== run.conditions.model) throw fault('budget_config', 'Policy route differs from frozen authorization');
				const rows = attempts().filter(row => row.owner === 'rsi' && row.ownerId === batch.authorization.id);
				if (rows.some(row => ['reserved', 'in_flight'].includes(row.state) || (row.state !== 'not_sent' && row.usageState !== 'confirmed'))) throw fault('usage_unknown', 'Policy batch usage is unsettled');
				for (const [spent, budget] of [[rows, batch.authorization.budget], [rows.filter(row => row.sessionId === attempt.sessionId), run.conditions.budget]] as const) {
					if (spent.length >= budget.maxRequests || spent.reduce((sum, row) => sum + (row.tokens.total ?? 0), 0) >= budget.tokenStopThreshold) throw fault('budget_exhausted', 'Policy request/token limit reached');
				}
				if (Date.now() < state.updatedAt || progress.startedAt === null || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= Math.min(batch.deadline, progress.startedAt + run.conditions.budget.maxDurationMs)) throw fault('budget_exhausted', 'Policy dispatch window ended');
				readPolicy(policyObjects, run.policyDigest);
			} else if (attempt.ownerId && db.prepare('SELECT 1 FROM policy_batches WHERE id=?').get(attempt.ownerId)) throw fault('not_authorized', 'Policy batch requires its registered session');
			if (!policy && !generation && attempt.purpose === 'probe') {
				const rows = attempts().filter(a => a.purpose === 'probe');
				if (state.cancelled) throw fault('cancelled', 'Probe is cancelled');
				if (rows.some(a => a.usageState !== 'confirmed' && a.state !== 'not_sent')) throw fault('usage_unknown', 'A previous RSI request is not settled');
				if (rows.length >= 8 || rows.reduce((sum, a) => sum + (a.tokens.total ?? 0), 0) >= 100000) throw fault('budget_exhausted', 'G0 request/token budget reached');
				state.budgetStartedAt ??= Date.now();
				const now = Math.max(Date.now(), openedAt + performance.now() - monotonicStart);
				if (Date.now() < state.updatedAt || now - state.budgetStartedAt >= 19 * 60_000) throw fault('budget_exhausted', 'G0 dispatch window ended or clock moved backwards; reserve final minute for cleanup');
			}
			if (!policy && !generation && attempt.owner === 'rsi' && attempt.purpose !== 'probe') {
				const stateBusiness = business();
				const flow = stateBusiness.mainflow.tasks.find(t => t.id === attempt.ownerId);
				const analysis = stateBusiness.analyses.find(a => a.id === attempt.ownerId);
				const comparison = stateBusiness.mainflow.tasks.find(t => t.comparison?.id === attempt.ownerId)?.comparison;
				const task = comparison ?? flow ?? analysis;
				if (!task || task.deadline === null || (comparison ? comparison.status !== 'running' || !comparison.runs.some(r => r.sessionId === attempt.sessionId && r.status === 'running' && attempt.purpose === (r.side === 'baseline' ? 'baseline' : 'evaluation')) : flow ? flow.status !== 'generating' || attempt.purpose !== 'generation' : analysis?.status !== 'running' || attempt.purpose !== 'analysis')) throw fault('not_authorized', '任务尚未确认或已停止');
				if (attempt.provider !== task.budget.provider || attempt.model !== task.budget.model) throw fault('budget_config', '模型路线与确认不符');
				const rows = attempts().filter(a => a.owner === 'rsi' && a.ownerId === task.id);
				if (rows.some(a => a.usageState !== 'confirmed' && a.state !== 'not_sent')) throw fault('usage_unknown', '本次任务用量尚未结算');
				if (comparison && rows.some(a => a.sessionId === attempt.sessionId)) throw fault('budget_exhausted', '每个版本只授权一次请求，不自动重试');
				if (rows.length >= task.budget.maxRequests || ((flow || comparison) && rows.reduce((sum, a) => sum + (a.tokens.total ?? 0), 0) >= (comparison ?? flow!).budget.tokenStopThreshold)) throw fault('budget_exhausted', '任务调用或 Token 停止阈值已到');
				if (Date.now() < state.updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= task.deadline) throw fault('budget_exhausted', '任务窗口已结束或系统时钟倒退');
			}
			db.prepare('INSERT INTO attempts VALUES (?, ?)').run(attempt.attemptId, JSON.stringify(attempt));
			write(state);
		});
	}
	function settle(attempt: Attempt) {
		attemptSchema.parse(attempt);
		transaction(() => {
			const row = db.prepare('SELECT data FROM attempts WHERE id=?').get(attempt.attemptId);
			if (!row) throw fault('attempt_missing', 'Request attempt is not reserved');
			const before = attemptSchema.parse(JSON.parse(String(row.data)));
			if (JSON.stringify(before) === JSON.stringify(attempt)) return;
			if (attempt.revision !== before.revision + 1 || before.owner !== attempt.owner || before.ownerId !== attempt.ownerId) throw fault('state_conflict', 'Stale or reassigned request attempt');
			for (const key of ['sessionId', 'purpose', 'callKind', 'retryOfAttemptId', 'provider', 'model', 'createdAt'] as const) if (before[key] !== attempt[key]) throw fault('state_conflict', 'Attempt identity is immutable');
			const terminal = !['reserved', 'in_flight'].includes(before.state);
			if (terminal && attempt.state !== before.state) throw fault('state_conflict', 'Terminal request cannot re-enter another lifecycle state');
			db.prepare('UPDATE attempts SET data=? WHERE id=?').run(JSON.stringify(attempt), attempt.attemptId);
			write(read());
		});
	}
	// 崩溃后的请求不重放、不释放已占额度。
	if (handoffBatchId === undefined) {
		for (const a of attempts()) if (a.state === 'reserved' || a.state === 'in_flight') settle({ ...a, revision: a.revision + 1, state: 'interrupted', endedAt: Date.now(), usageState: a.usageState === 'confirmed' ? 'confirmed' : 'unknown' });
		for (const row of db.prepare('SELECT data FROM policy_generations').all()) {
			const task = policyGenerationSchema.parse(JSON.parse(String(row.data)));
			if (task.status === 'authorized' || task.status === 'running') transaction(() => { task.status = 'interrupted'; task.error = 'Host interrupted; no automatic replay'; task.revision++; savePolicyGeneration(task); });
		}
		for (const row of db.prepare('SELECT data FROM policy_batches').all()) {
			const batch = policyBatchSchema.parse(JSON.parse(String(row.data)));
			if (batch.status === 'authorized' || batch.status === 'running') transaction(() => {
				batch.status = 'interrupted'; batch.revision++;
				for (const progress of batch.progress) if (progress.status === 'pending' || progress.status === 'running') progress.status = 'interrupted';
				savePolicyBatch(batch);
			});
		}
		mutateBusiness(state => {
			for (const task of state.mainflow.tasks) {
				if (task.comparison?.status === 'running') { task.comparison.status = 'failed'; for (const run of task.comparison.runs) if (['pending', 'running'].includes(run.status)) { run.status = 'failed'; run.error = '宿主中断；不自动重放，耗时未知'; run.durationMs = null; } }
			}
			for (const task of state.mainflow.tasks) if (['confirming', 'generating', 'clarifying', 'checking', 'ready'].includes(task.status)) { task.status = 'failed'; task.error = '宿主中断；保留授权、候选和用量，不自动重放。可选择旧版或停止。'; }
			for (const analysis of state.analyses) if (analysis.status === 'running') { analysis.status = 'interrupted'; analysis.endedAt = Date.now(); analysis.error = '宿主中断；保留用量，不自动重放'; }
		});
	}
	function bind(sessionId: string, skillId: string, versionDigest: string) {
		const binding = bindingSchema.parse({ schemaVersion: 1, sessionId, skillId, versionDigest, boundAt: Date.now() });
		return transaction(() => {
			const old = db.prepare('SELECT data FROM bindings WHERE session=? AND skill=?').get(sessionId, skillId);
			if (old) {
				const previous = bindingSchema.parse(JSON.parse(String(old.data)));
				if (previous.versionDigest !== versionDigest) throw fault('binding_conflict', 'Session is already bound to a different Skill version');
				return previous;
			}
			db.prepare('INSERT INTO bindings VALUES (?, ?, ?)').run(sessionId, skillId, JSON.stringify(binding));
			return binding;
		});
	}
	function binding(sessionId: string, skillId: string) { const row = db.prepare('SELECT data FROM bindings WHERE session=? AND skill=?').get(sessionId, skillId); return row ? bindingSchema.parse(JSON.parse(String(row.data))) : undefined; }
	return { policyPackEvaluation, policyPackSummary, stopPolicyPack, policyQaPack, policyEvaluationCase, stopPolicyBatch, policySource, checkPolicyCommand, policyCommand, policyReview, policySelection, policySession, policySessionRun, policyContent, policyGeneration, policyGenerationBinding, generationPrompt, authorizePolicyGeneration, startPolicyGeneration, recordPolicyGenerationResponse, sealPolicyGeneration, failPolicyGeneration, recordPolicyResource, recordPolicyEvidence, evaluatePolicy, policyVersions, sealPolicyVersion, policyBatch, policyRunBinding, authorizePolicyBatch, startPolicyRun, finishPolicyRun, policyAccounting, binding, snapshot, command, reserve, settle, bind, transaction, business, mutateBusiness, businessReceipt, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, close() { listeners.clear(); db.close(); } };
}
export type Store = ReturnType<typeof openStore>;
