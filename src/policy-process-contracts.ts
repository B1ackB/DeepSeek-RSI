import { z } from 'zod';
import { integer } from './contracts.ts';
import { policyRunSchema, policyEvidenceSchema } from './policy-contracts.ts';

export const policyProcessOwnershipSchema = z.strictObject({ batchId: z.uuid(), runId: z.uuid(), parentPid: integer.min(1) });
const textBlock = z.strictObject({ type: z.literal('text'), text: z.string() });
const toolBlock = z.strictObject({ type: z.literal('tool-call'), id: z.string(), name: z.string(), arguments: z.string() });
const chunk = z.discriminatedUnion('type', [
	z.strictObject({ type: z.literal('block-start'), index: integer, blockType: z.enum(['text', 'tool-call']) }),
	z.strictObject({ type: z.literal('text-delta'), index: integer, text: z.string() }),
	z.strictObject({ type: z.literal('tool-call-delta'), index: integer, id: z.string(), name: z.string(), argumentsDelta: z.string() }),
	z.strictObject({ type: z.literal('block-end'), index: integer, block: z.discriminatedUnion('type', [textBlock, toolBlock]) }),
	z.strictObject({ type: z.literal('usage'), usage: z.strictObject({ inputTokens: integer, outputTokens: integer, totalTokens: integer }) }),
	z.strictObject({ type: z.literal('finish'), reason: z.union([z.strictObject({ kind: z.enum(['stop', 'tool-calls', 'max-tokens', 'aborted']) }), z.strictObject({ kind: z.literal('error'), failure: z.strictObject({ code: z.string(), message: z.string() }) })]) }),
]);
export const policyProcessRequestSchema = z.strictObject({ type: z.literal('request'), request: integer.min(1).max(8), options: z.strictObject({ sessionId: z.uuid(), provider: z.literal('rsi-policy-fixture'), model: z.literal('offline-v1'), maxTokens: integer.min(128).max(4096), system: z.string(), messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'tool']), content: z.array(z.json()) }).catchall(z.json())).max(128), tools: z.array(z.json()).length(2) }) });
export const policyProcessResultSchema = z.strictObject({ type: z.literal('result'), result: policyEvidenceSchema.shape.result, agentsDisposed: z.literal(true), error: z.string().max(4000).nullable() });
export const policyProcessInputSchema = z.discriminatedUnion('type', [z.strictObject({ type: z.literal('abort') }), z.strictObject({ type: z.literal('run'), run: policyRunSchema }), z.strictObject({ type: z.literal('response'), request: integer.min(1).max(8), chunks: z.array(chunk).max(256), error: z.string().max(4000).nullable() })]);
export function boundedPolicyMessage(input: unknown) { if (Buffer.byteLength(JSON.stringify(input)) > 2097152) throw new Error('Policy process message exceeds 2 MiB'); return input; }
