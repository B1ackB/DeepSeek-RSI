import { z } from 'zod';
import { integer } from './contracts.ts';
import { repositorySelectionSchema, policyConditionsDataSchema, policyGenerationBudgetSchema, policyBatchBudgetSchema } from './policy-inputs.ts';

const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const workspaceId = z.string().min(1).max(1024);
const sessionId = z.string().regex(/^rsi-policy\/[a-f0-9-]{36}$/).refine(value => id.safeParse(value.slice(11)).success);
export const policySessionId = (id: string) => `rsi-policy/${id}`;
const envelope = { schemaVersion: z.literal(1), operationId: id, expectedRevision: integer.min(1) };
const command = <K extends string, S extends z.ZodType>(kind: K, payload: S) => z.strictObject({ ...envelope, kind: z.literal(kind), payload });
const sourceIntent = { workspaceId, expectedActive: id, sourceId: id, snapshotDigest: digest };
export const policyCommands = [
	command('policy_generate', z.strictObject({ ...sourceIntent, baselineDigest: digest, requirements: z.string().trim().min(1).max(4000), budget: policyGenerationBudgetSchema })),
	command('policy_evaluate', z.strictObject({ ...sourceIntent, generationId: id, baselineDigest: digest, candidateDigest: digest, budget: policyBatchBudgetSchema })),
	command('policy_stop', z.strictObject({ workspaceId, target: z.enum(['generation', 'evaluation']), jobId: id })),
	command('policy_adopt', z.strictObject({ workspaceId, policyId: id, batchId: id, baselineDigest: digest, candidateDigest: digest, evidenceDigest: digest, choice: z.enum(['baseline', 'candidate']), expectedActive: id.nullable() })),
	command('policy_restore', z.strictObject({ workspaceId, targetChoiceId: id, expectedActive: id })),
	command('policy_session', z.strictObject({ workspaceId, expectedActive: id })),
	command('policy_open', z.strictObject({ workspaceId, sessionId })),
	command('policy_preview', z.strictObject({ workspaceId, expectedActive: id, paths: repositorySelectionSchema })),
	command('policy_seal', z.strictObject({ workspaceId, expectedActive: id, sourceId: id, snapshotDigest: digest })),
	command('policy_source_session', z.strictObject({ workspaceId, expectedActive: id, sourceId: id, snapshotDigest: digest })),
] as const;
export const policyCommandSchema = z.discriminatedUnion('kind', policyCommands);
export type PolicyCommand = z.infer<typeof policyCommandSchema>;
export const policyChoiceSchema = z.strictObject({
	id, workspaceId, workspacePath: z.string().startsWith('/'), policyId: id, digest, batchId: id, evidenceDigest: digest,
	previousId: id.nullable(), approvalId: id, kind: z.enum(['adopt', 'restore']), createdAt: integer,
}).refine(row => row.kind === 'adopt' ? row.approvalId === row.id : row.approvalId !== row.id);
export const policySessionSchema = z.strictObject({ sessionId, choiceId: id, workspaceId, workspacePath: z.string().startsWith('/'), policyId: id, policyDigest: digest, batchId: id, conditionsDigest: digest, createdAt: integer, sourceId: id.optional() });
export type PolicySession = z.infer<typeof policySessionSchema>;
export const policySourceSchema = z.strictObject({ id, workspaceId, workspacePath: z.string().startsWith('/'), choiceId: id, conditions: policyConditionsDataSchema, status: z.enum(['preview', 'sealed']), createdAt: integer, sealedAt: integer.nullable(), sealId: id.nullable() })
	.refine(source => source.conditions.sourceSnapshot?.root === source.workspacePath && (source.status === 'preview' ? source.sealedAt === null && source.sealId === null : source.sealId !== null && source.sealedAt !== null && source.sealedAt >= source.createdAt), 'Source provenance or sealing state is invalid');
export type PolicySource = z.infer<typeof policySourceSchema>;
export const policySourceRequestSchema = z.strictObject({ workspaceId, sourceId: id });
const sourceView = z.strictObject({ id, workspaceId, choiceId: id, snapshotDigest: digest, status: z.enum(['preview', 'sealed']), createdAt: integer, files: z.array(z.strictObject({ path: z.string(), bytes: integer, contentDigest: digest })).min(1).max(32) });
const side = z.strictObject({ side: z.enum(['baseline', 'candidate']), instructions: z.string(), response: z.string(), sources: z.array(z.string()), infrastructure: z.boolean(), facts: z.boolean(), citations: z.boolean(), requests: integer, tools: integer, totalTokens: integer.nullable() });
export const policyReviewSnapshotSchema = z.strictObject({
	choices: z.array(policyChoiceSchema), sessions: z.array(policySessionSchema),
	sources: z.array(sourceView).default([]),
	generations: z.array(z.strictObject({ id, workspaceId, sourceId: id, snapshotDigest: digest, baselineDigest: digest, candidateDigest: digest.nullable(), requirements: z.string(), status: z.enum(['authorized', 'running', 'sealed', 'failed', 'cancelled', 'interrupted']), error: z.string().nullable(), instructions: z.string(), rationale: z.string(), requests: integer, totalTokens: integer.nullable(), budget: policyGenerationBudgetSchema })).default([]),
	reviews: z.array(z.strictObject({ policyId: id, batchId: id, workspaceId: workspaceId.optional(), sourceId: id.optional(), executionStatus: z.string().optional(), cleanupPending: integer.optional(), baselineDigest: digest, candidateDigest: digest, evidenceDigest: digest.nullable(), generationId: id.nullable(), rationale: z.string(), question: z.string(), paths: z.array(z.string()), limits: z.string(), status: z.enum(['passed', 'failed', 'incomplete', 'unevaluated']), eligible: z.boolean(), error: z.string().nullable(), sides: z.array(side) })),
});
