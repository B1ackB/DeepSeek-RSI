import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { integer } from './contracts.ts';

export const policyContentSchema = z.strictObject({
	schemaVersion: z.literal(1), kind: z.literal('repository-evidence-policy'),
	instructions: z.string().refine(value => value.trim().length > 0 && Buffer.byteLength(value) <= 8192 && Buffer.from(value).toString('utf8') === value && !/\0|\{\{|\}\}/.test(value), 'Policy must be nonempty literal UTF-8 text within 8 KiB'),
});
export type PolicyContent = z.infer<typeof policyContentSchema>;
export { policyBudgetSchema, policyPathSchema, policyFilesSchema, repositoryPathDenied, repositoryContentDenied, repositorySelectionSchema, repositoryRootSchema, repositorySnapshotSchema, policyConditionsDataSchema, policyBatchBudgetSchema } from './policy-inputs.ts';
export type { RepositorySnapshot } from './policy-inputs.ts';
import { repositorySnapshotSchema, policyConditionsDataSchema, policyBatchBudgetSchema } from './policy-inputs.ts';
export const policyConditionsSchema = policyConditionsDataSchema.refine(conditions => {
	if (!conditions.sourceSnapshot) return true;
	const snapshot = repositorySnapshotSchema.safeParse({ schemaVersion: 1, kind: 'repository-worktree', root: conditions.sourceSnapshot.root, files: conditions.files });
	return snapshot.success && policyDigest(snapshot.data) === conditions.sourceSnapshot.digest;
}, 'Source snapshot identity differs from frozen conditions');
export type PolicyConditions = z.infer<typeof policyConditionsSchema>;
export const policyDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const policyRunSchema = z.strictObject({
	schemaVersion: z.literal(1), runId: z.uuid(), policy: policyContentSchema, policyDigest: digest, conditions: policyConditionsSchema, conditionsDigest: digest,
}).refine(run => run.policyDigest === policyDigest(run.policy) && run.conditionsDigest === policyDigest(run.conditions), 'Frozen policy or conditions changed');
export type PolicyRun = z.infer<typeof policyRunSchema>;
export function freezePolicyRun(policy: unknown, conditions: unknown): PolicyRun {
	const content = policyContentSchema.parse(policy);
	const fixed = policyConditionsSchema.parse(conditions);
	return policyRunSchema.parse({ schemaVersion: 1, runId: randomUUID(), policy: content, policyDigest: policyDigest(content), conditions: fixed, conditionsDigest: policyDigest(fixed) });
}

export const policyVersionSchema = z.strictObject({ policyId: z.uuid(), digest, parentDigest: digest.nullable(), createdAt: integer, generationId: z.uuid().optional() }).refine(row => row.digest !== row.parentDigest, 'A version cannot parent itself');
export type PolicyVersion = z.infer<typeof policyVersionSchema>;
export const policyCaseIdSchema = z.enum(['symbol', 'call-chain', 'error-path', 'misleading', 'insufficient', 'untrusted']);
export const policyEvaluationSpecSchema = z.discriminatedUnion('evaluator', [z.strictObject({ evaluator: z.literal('repository-evidence-v1'), caseId: policyCaseIdSchema, digest }), z.strictObject({ evaluator: z.literal('repository-source-v1'), sourceId: z.uuid(), digest })]);
export const policyDispatchSchema = z.strictObject({ attemptId: z.uuid(), state: z.literal('in_flight'), request: integer.min(1), policyPresent: z.boolean(), authorityPresent: z.boolean(), system: z.string(), tools: z.array(z.json()), messages: z.array(z.json()) });
export const policyEvidenceSchema = z.strictObject({
	runId: z.uuid(), policyDigest: digest, conditionsDigest: digest, runtimeDigest: digest,
	workerPid: integer.min(1).nullable(), result: z.strictObject({ sessionId: z.string(), finalResponse: z.string().max(262144), events: z.array(z.object({ type: z.string(), seq: integer, time: integer, data: z.json() }).catchall(z.json())).max(1024) }).nullable(),
	dispatch: z.array(policyDispatchSchema).max(8), error: z.string().max(4000).nullable(),
	cleanup: z.strictObject({ processExited: z.boolean(), agentsDisposed: z.boolean(), directoryRemoved: z.boolean(), forbiddenExecutions: integer, temporaryRoot: z.string() }),
}).refine(value => Buffer.byteLength(JSON.stringify(value)) <= 2097152, 'Policy evidence exceeds 2 MiB');
export type PolicyEvidence = z.infer<typeof policyEvidenceSchema>;
export const policyEvaluationResultSchema = z.strictObject({
	evaluatedAt: integer, evidenceDigest: digest, status: z.enum(['passed', 'failed', 'incomplete']),
	sides: z.array(z.strictObject({ runId: z.uuid(), infrastructure: z.boolean(), facts: z.boolean(), citations: z.boolean() })).max(2),
});
export const policyBatchInputSchema = z.strictObject({
	id: z.uuid(), policyId: z.uuid(), runtimeDigest: digest,
	generationId: z.uuid().optional(),
	evaluationSpec: policyEvaluationSpecSchema.optional(),
	runs: z.array(z.strictObject({ side: z.enum(['baseline', 'candidate']), run: policyRunSchema })).min(1).max(2),
	budget: policyBatchBudgetSchema,
}).refine(batch => new Set(batch.runs.map(row => row.run.runId)).size === batch.runs.length && new Set(batch.runs.map(row => row.side)).size === batch.runs.length && batch.runs.every(row => row.run.conditionsDigest === batch.runs[0].run.conditionsDigest) && (batch.runs.length === 1 || batch.runs[0].side === 'baseline'), 'Batch runs must be unique, ordered and share frozen conditions')
	.refine(batch => !batch.generationId || (batch.runs.length === 2 && !!batch.evaluationSpec), 'Generated candidate requires separately authorized paired evaluation');
export type PolicyBatchInput = z.infer<typeof policyBatchInputSchema>;
export const policyRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'interrupted']);
export const policyBatchSchema = z.strictObject({
	authorization: policyBatchInputSchema, revision: integer.min(1), createdAt: integer, deadline: integer,
	status: z.enum(['authorized', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
	progress: z.array(z.strictObject({ runId: z.uuid(), status: policyRunStatusSchema, startedAt: integer.nullable(), resource: z.strictObject({ temporaryRoot: z.string().startsWith('/'), pid: integer.min(1).nullable() }).optional() })).min(1).max(2),
	evidence: z.array(policyEvidenceSchema).max(2).optional(), evaluation: policyEvaluationResultSchema.optional(),
}).refine(batch => batch.deadline === batch.createdAt + batch.authorization.budget.maxDurationMs && batch.progress.length === batch.authorization.runs.length && batch.progress.every((row, index) => row.runId === batch.authorization.runs[index].run.runId && (row.status !== 'pending' || row.startedAt === null) && (row.status !== 'running' || row.startedAt !== null)) && batch.progress.filter(row => row.status === 'running').length <= 1, 'Batch progress or deadline differs from its authorization')
	.refine(batch => !batch.evidence || (new Set(batch.evidence.map(row => row.runId)).size === batch.evidence.length && batch.evidence.every(row => batch.authorization.runs.some(entry => entry.run.runId === row.runId && entry.run.policyDigest === row.policyDigest && entry.run.conditionsDigest === row.conditionsDigest) && row.runtimeDigest === batch.authorization.runtimeDigest)), 'Persisted evidence differs from its authorized identity')
	.refine(batch => batch.status === 'authorized' ? batch.progress.every(row => row.status === 'pending') : batch.status === 'completed' ? batch.progress.every(row => row.status === 'completed') : batch.status === 'running' ? batch.progress.some(row => row.status === 'pending' || row.status === 'running') : batch.progress.every(row => row.status !== 'pending' && row.status !== 'running'), 'Batch lifecycle differs from its run progress');
export type PolicyBatch = z.infer<typeof policyBatchSchema>;
