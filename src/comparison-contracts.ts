import { z } from 'zod';
import { integer } from './contracts.ts';
import { scenarioInfoSchema } from './scenarios/contracts.ts';

export const comparisonBudgetSchema = z.strictObject({
	provider: z.literal('deepseek-official'), model: z.literal('deepseek-v4-flash'), reasoningEffort: z.literal('low'),
	maxRequests: z.literal(2), maxOutputTokens: integer.min(128).max(16384), maxInputBytes: integer.min(1024).max(131072),
	tokenStopThreshold: integer.min(1).max(100000), maxDurationMs: integer.min(1000).max(600000),
});
export const comparisonBudget = comparisonBudgetSchema.parse({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low', maxRequests: 2, maxOutputTokens: 8192, maxInputBytes: 131072, tokenStopThreshold: 64000, maxDurationMs: 600000 });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const comparisonRunSchema = z.strictObject({
	side: z.enum(['baseline', 'candidate']), versionDigest: digest, sessionId: z.string().min(1), input: z.string().max(131072),
	status: z.enum(['pending', 'running', 'passed', 'failed']), startedAt: integer.nullable(), endedAt: integer.nullable(), durationMs: integer.nullable(),
	artifact: z.strictObject({ digest, kind: z.enum(['html', 'text']), detail: z.string().max(2000) }).nullable(), error: z.string().max(4000).nullable(),
}).refine(r => r.status !== 'passed' || r.artifact !== null, '通过的产物必须有摘要');
export const comparisonSchema = z.strictObject({
	id: z.uuid(), operationId: z.uuid(), authorizedAt: integer, deadline: integer, scenario: scenarioInfoSchema, system: z.string().max(16000),
	budget: comparisonBudgetSchema, status: z.enum(['running', 'completed', 'failed', 'cancelled']),
	runs: z.tuple([comparisonRunSchema, comparisonRunSchema]),
}).refine(c => c.runs[0].side === 'baseline' && c.runs[1].side === 'candidate' && c.runs.every(r => r.sessionId === `rsi-comparison/${c.id}/${r.side}`), '对照两侧与会话身份不匹配');
export type Comparison = z.infer<typeof comparisonSchema>;
export type ComparisonRun = z.infer<typeof comparisonRunSchema>;
export function previewPath(taskId: string, side: ComparisonRun['side']) { return `/api/rsi-preview?task=${encodeURIComponent(taskId)}&side=${side}`; }
