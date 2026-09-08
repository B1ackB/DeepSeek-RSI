import { z } from 'zod';
import { mainflowStateSchema, flowBudgetSchema } from './mainflow-contracts.ts';
import { integer, skillSnapshotSchema, snapshotSchema } from './contracts.ts';
import { answerSchema, dimensionSchema, frontendStateSchema, preferenceText } from './frontend-contracts.ts';

const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const revision = integer.min(1);
const text = z.string().max(4000);
export const objectiveSchema = z.enum(['accuracy', 'tokens', 'brevity', 'speed', 'maintainability', 'design']);
export const analysisBudgetSchema = z.strictObject({
	provider: z.literal('deepseek-official'), model: z.literal('deepseek-v4-flash'), reasoningEffort: z.enum(['low', 'high']),
	maxRequests: z.literal(1), maxOutputTokens: integer.min(128).max(4096), maxDurationMs: integer.min(1000).max(300000), maxInputBytes: integer.min(1024).max(65536),
});
export const defaultAnalysisBudget = analysisBudgetSchema.parse({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low', maxRequests: 1, maxOutputTokens: 4096, maxDurationMs: 300000, maxInputBytes: 32768 });
export const optimizationBudgetSchema = z.strictObject({ maxRounds: integer.min(1).max(3), maxRequests: integer.min(1).max(100), maxOutputTokens: integer.min(128).max(4096), tokenStopThreshold: integer.min(1).max(100000), maxDurationMs: integer.min(1000).max(3600000) });
export const defaultOptimizationBudget = optimizationBudgetSchema.parse({ maxRounds: 3, maxRequests: 24, maxOutputTokens: 4096, tokenStopThreshold: 100000, maxDurationMs: 3600000 });
export const ruleSchema = z.enum(['script_failure', 'retry_cluster', 'repeated_read', 'large_output', 'user_preference']);
export const evidenceSchema = z.strictObject({ sessionId: z.string().min(1), seq: integer, time: integer, rule: ruleSchema, summary: z.string().max(2000) });
export const managedSkillSchema = z.strictObject({
	id, revision, name: z.string().min(1).max(128), provider: z.string().min(1), workspaceId: z.string().min(1), scopeSessionId: z.string().min(1).nullable(), snapshot: skillSnapshotSchema, objectRoot: z.string().min(1),
	observing: z.boolean(), sourceState: z.enum(['matching', 'changed', 'unavailable']), sourceError: text.nullable(), createdAt: integer,
});
export const opportunitySchema = z.strictObject({ id, revision, skillId: id, versionDigest: digest, rule: ruleSchema, dedupeKey: digest, evidence: z.array(evidenceSchema).min(1).max(12), status: z.enum(['open', 'snoozed', 'ignored']), snoozedUntil: integer.nullable(), createdAt: integer, updatedAt: integer });
export const directionSchema = z.strictObject({ objective: objectiveSchema, title: z.string().min(1).max(160), rationale: text, files: z.array(z.string().min(1).max(512)).min(1).max(32), requiredInformation: z.array(text).max(16), optionalInformation: z.array(text).max(16) });
export const analysisResultSchema = z.strictObject({ conclusion: text, directions: z.array(directionSchema).max(3) });
export const analysisSchema = z.strictObject({
	id, skillId: id, opportunityId: id.nullable(), versionDigest: digest, input: z.string().max(65536), system: text, inputDigest: digest, budget: analysisBudgetSchema,
	design: z.strictObject({ taskId: id, digest }).nullable().default(null),
	status: z.enum(['prepared', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted']), createdAt: integer, startedAt: integer.nullable(), endedAt: integer.nullable(), deadline: integer.nullable(),
	result: analysisResultSchema.nullable(), error: text.nullable(),
});
export const authorizationDraftSchema = z.strictObject({ id, revision, analysisId: id, directionIndex: integer.max(2), skillId: id, versionDigest: digest, objective: objectiveSchema, files: z.array(z.string().min(1)).min(1).max(32), requiredInformation: text.trim().min(1), optionalInformation: text, budget: optimizationBudgetSchema, status: z.enum(['draft', 'revoked']), createdAt: integer });
export const enrollmentSchema = z.strictObject({ id, sessionId: z.string().min(1), turn: integer.min(1), workspaceId: z.string().min(1), decision: z.enum(['included', 'declined']), skillId: id.nullable(), status: z.enum(['active', 'ended']), createdAt: integer })
	.refine(e => (e.decision === 'included') === (e.skillId !== null), '纳入选择与 Skill 不一致');
export const g1StateSchema = z.strictObject({
	mainflow: mainflowStateSchema.default({ tasks: [], preferences: [], active: [] }),
	schemaVersion: z.literal(1), revision, skills: z.array(managedSkillSchema).max(64), opportunities: z.array(opportunitySchema).max(512), analyses: z.array(analysisSchema).max(256), drafts: z.array(authorizationDraftSchema).max(256),
	sessions: z.array(z.strictObject({ sessionId: z.string(), lastSeq: integer, skills: z.array(z.strictObject({ skillId: id, versionDigest: digest })).max(64) })).max(1000),
	observationError: text.nullable(),
	frontend: frontendStateSchema.default({ preferences: [], tasks: [] }),
	enrollments: z.array(enrollmentSchema).max(512).default([]).refine(rows => new Set(rows.filter(e => e.status === 'active').map(e => e.sessionId)).size === rows.filter(e => e.status === 'active').length, '同一会话只能有一个进行中的 RSI 任务'),
});
export const initialG1State = () => g1StateSchema.parse({ schemaVersion: 1, revision: 1, skills: [], opportunities: [], analyses: [], drafts: [], sessions: [], observationError: null });
export const g1ConfigSchema = z.strictObject({
	analysis: analysisBudgetSchema.default(defaultAnalysisBudget),
	observation: z.strictObject({ repeatReads: integer.min(2).max(100), retries: integer.min(1).max(20), outputBytes: integer.min(1024).max(1048576), snoozeMs: integer.min(60000).max(86400000) }).default({ repeatReads: 3, retries: 2, outputBytes: 12000, snoozeMs: 1800000 }),
});
const envelope = { schemaVersion: z.literal(1), operationId: id, expectedRevision: revision };
const command = <K extends string, S extends z.ZodType>(kind: K, payload: S) => z.strictObject({ ...envelope, kind: z.literal(kind), payload });
export const g1CommandSchema = z.discriminatedUnion('kind', [
	command('flow_authorize', z.strictObject({ taskId: id, previewDigest: digest, brief: z.string().trim().min(1).max(16000), preference: text.trim().min(1), scope: z.enum(['task', 'project', 'personal']), paths: z.array(z.string()).min(1).max(32), budget: flowBudgetSchema })),
	command('flow_answer', z.strictObject({ taskId: id, answers: z.array(z.string().max(2000)).min(1).max(3) })),
	command('flow_choose', z.strictObject({ taskId: id, choice: z.enum(['candidate', 'baseline', 'stop', 'reject']), digest: digest.nullable() })),
	command('flow_resume', z.strictObject({ taskId: id })),
	command('manage', z.strictObject({ workspaceId: z.string().min(1), name: z.string().min(1).max(128), sessionId: z.string().min(1).nullable() })),
	command('observe', z.strictObject({ skillId: id, enabled: z.boolean() })),
	command('review_source', z.strictObject({ skillId: id })),
	command('opportunity', z.strictObject({ opportunityId: id, status: z.enum(['open', 'snoozed', 'ignored']) })),
	command('prepare_analysis', z.strictObject({ opportunityId: id, budget: analysisBudgetSchema, designTaskId: id.optional() })),
	command('prepare_design_analysis', z.strictObject({ taskId: id, budget: analysisBudgetSchema })),
	command('start_analysis', z.strictObject({ analysisId: id, inputDigest: digest })),
	command('cancel_analysis', z.strictObject({ analysisId: id })),
	command('save_draft', z.strictObject({ analysisId: id, directionIndex: integer.max(2), files: z.array(z.string().min(1)).min(1).max(32), requiredInformation: text.trim().min(1), optionalInformation: text, budget: optimizationBudgetSchema })),
	command('revoke_draft', z.strictObject({ draftId: id })),
	command('authorize', z.strictObject({ draftId: id })),
	command('design_create', z.strictObject({ skillId: id, brief: text.trim().min(1) })),
	command('design_answer', z.strictObject({ taskId: id, answers: z.array(answerSchema).min(1).max(3) })),
	command('design_override', z.strictObject({ taskId: id, answer: answerSchema.refine(a => a.scope === 'task', '仅允许本次覆盖') })),
	command('design_finish', z.strictObject({ taskId: id })),
	command('design_close', z.strictObject({ taskId: id })),
	command('preference_save', z.strictObject({ workspaceId: z.string().min(1), scope: z.enum(['project', 'personal']), dimension: dimensionSchema, value: preferenceText, enabled: z.boolean() })),
	command('preference_remove', z.strictObject({ preferenceId: id })),
	command('end_enrollment', z.strictObject({ enrollmentId: id })),
]);
export type G1State = z.infer<typeof g1StateSchema>;
export type ManagedSkill = z.infer<typeof managedSkillSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type G1Command = z.infer<typeof g1CommandSchema>;
export type G1Config = z.infer<typeof g1ConfigSchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
export const g1SnapshotSchema = snapshotSchema.extend({ business: g1StateSchema, config: g1ConfigSchema });
export type G1Snapshot = z.infer<typeof g1SnapshotSchema>;
export const catalogSchema = z.array(z.strictObject({ name: z.string(), description: z.string(), provider: z.string(), supported: z.boolean() }));
export const receiptSchema = z.strictObject({ revision, focusId: id.nullable() });
