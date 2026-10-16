import { z } from 'zod';
import { integer } from './contracts.ts';
import { policyBatchBudgetSchema } from './policy-inputs.ts';

const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const policyPackCases = ['symbol', 'call-chain', 'error-path'] as const;
export const policyPackBudgetSchema = policyBatchBudgetSchema.extend({ maxRequests: z.number().int().min(1).max(48) });
export const policyPackEvaluationSchema = z.strictObject({
	id, workspaceId: z.string().min(1).max(1024), workspacePath: z.string().startsWith('/'), choiceId: id,
	policyId: id, generationId: id, baselineDigest: digest, candidateDigest: digest,
	sourceId: id, snapshotDigest: digest, packId: id, packDigest: digest, runtimeDigest: digest,
	budget: policyPackBudgetSchema, batchIds: z.tuple([id, id, id]), createdAt: integer, deadline: integer,
}).refine(row => new Set([row.id, ...row.batchIds]).size === 4 && row.deadline === row.createdAt + row.budget.maxDurationMs);
export type PolicyPackEvaluation = z.infer<typeof policyPackEvaluationSchema>;
export const policyPackSummarySchema = policyPackEvaluationSchema.safeExtend({
	executionStatus: z.enum(['authorized', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
	status: z.enum(['passed', 'failed', 'incomplete']), completedCases: integer.max(3),
	requests: integer, confirmedTokens: integer, totalTokens: integer.nullable(), unknownUsage: integer,
});
