import { z } from 'zod';
import { policyPathSchema } from './policy-inputs.ts';

const citation = z.strictObject({ path: z.string(), startLine: z.number().int().min(1), endLine: z.number().int().min(1) });
export const policyAnswerSchema = z.strictObject({ status: z.enum(['sufficient', 'insufficient']), claims: z.array(z.strictObject({ fact: z.string(), value: z.string(), citations: z.array(citation).max(8) })).min(1).max(8) });
const text = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0 && !value.includes('\0') && new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value, 'Expected nonempty literal UTF-8 text');
const manualCitation = citation.extend({ path: policyPathSchema }).refine(row => row.endLine >= row.startLine);
const question = z.strictObject({ question: text(4000), answer: z.strictObject({ status: z.literal('sufficient'), claims: z.array(z.strictObject({ fact: text(128), value: text(2000), citations: z.array(manualCitation).min(1).max(8) })).min(1).max(8) }) })
	.refine(row => new Set(row.answer.claims.map(claim => claim.fact)).size === row.answer.claims.length && new Set(row.answer.claims.flatMap(claim => claim.citations.map(ref => ref.path))).size <= 3, 'Fact keys must be unique; cite at most three files per question');
export const policyQaQuestionsSchema = z.strictObject({ symbol: question, 'call-chain': question, 'error-path': question });
export const policyQaContentSchema = z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('repository-source-qa-pack'), sourceId: z.uuid(), snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/), questions: policyQaQuestionsSchema })
	.refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 65536, 'Question pack exceeds 64 KiB');
export type PolicyQaContent = z.infer<typeof policyQaContentSchema>;
