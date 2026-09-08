import { z } from 'zod';
import { integer, skillSnapshotSchema } from './contracts.ts';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const flowBudgetSchema = z.strictObject({
	provider: z.literal('deepseek-official'), model: z.literal('deepseek-v4-flash'), reasoningEffort: z.literal('low'),
	maxRequests: integer.min(1).max(3), maxOutputTokens: integer.min(128).max(4096), maxInputBytes: integer.min(1024).max(65536),
	tokenStopThreshold: integer.min(1).max(32000), maxDurationMs: integer.min(1000).max(300000),
});
export const flowBudget = flowBudgetSchema.parse({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low', maxRequests: 3, maxOutputTokens: 4096, maxInputBytes: 65536, tokenStopThreshold: 32000, maxDurationMs: 300000 });
export const flowChecks = ['完整文件与授权路径', 'SKILL.md 非空且保留元数据', 'Python AST / Shell 语法（固定 Docker、无网络、不运行脚本）', '封存摘要与已确认用量'] as const;
const fileSchema = z.strictObject({ path: z.string().min(1).max(512), content: z.string().max(262144) });
export const candidateResponseSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('candidate'), reason: z.string().min(1).max(4000), changes: z.array(fileSchema).min(1).max(32) }),
	z.strictObject({ kind: z.literal('clarify'), reason: z.string().max(4000), questions: z.array(z.string().min(1).max(1000)).min(1).max(3) }),
	z.strictObject({ kind: z.literal('unchanged'), reason: z.string().min(1).max(4000) }),
]);
export const flowTaskSchema = z.strictObject({
	id: z.uuid(), sessionId: z.string().min(1), turn: integer.min(1), workspaceId: z.string().min(1), skillId: z.uuid(), name: z.string(),
	baseline: skillSnapshotSchema, baselineRoot: z.string(), files: z.array(fileSchema).min(1).max(32), brief: z.string().min(1).max(16000),
	inherited: z.array(z.string().max(4000)).max(32), previewDigest: digest,
	status: z.enum(['confirming', 'generating', 'clarifying', 'checking', 'review', 'failed', 'ready', 'dispatched', 'stopped']),
	preference: z.string().max(4000), scope: z.enum(['task', 'project', 'personal']), paths: z.array(z.string()).max(32), budget: flowBudgetSchema,
	authorization: z.strictObject({ operationId: z.uuid(), digest, confirmedAt: integer }).nullable(),
	system: z.string(), input: z.string().max(65536), deadline: integer.nullable(),
	clarifications: z.array(z.strictObject({ questions: z.array(z.string()).max(3), answers: z.array(z.string().max(2000)).max(3) })).max(2),
	candidate: z.strictObject({ snapshot: skillSnapshotSchema, root: z.string(), changes: z.array(fileSchema).min(1).max(32), reason: z.string().max(4000) }).nullable(),
	checks: z.array(z.strictObject({ name: z.string(), status: z.enum(['passed', 'failed', 'not_applicable']), detail: z.string().max(4000) })).max(16),
	response: z.string().max(262144).default(''), error: z.string().max(4000).nullable(), chosenDigest: digest.nullable(), approvedDigest: digest.nullable(), executionSessionId: z.string().nullable(),
	delivery: z.enum(['none', 'queued', 'admitted']).default('none'), createdAt: integer,
});
export const mainflowStateSchema = z.strictObject({
	tasks: z.array(flowTaskSchema).max(256),
	preferences: z.array(z.strictObject({ scope: z.enum(['project', 'personal']), workspaceId: z.string().nullable(), value: z.string().max(4000) })).max(128),
	active: z.array(z.strictObject({ workspaceId: z.string(), skillId: z.uuid(), digest })).max(64),
});
export type FlowTask = z.infer<typeof flowTaskSchema>;
