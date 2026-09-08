import { z } from 'zod';

export const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = integer.min(1);
const uuid = z.uuid();
const version = z.literal(1);
export const commandSchema = z.discriminatedUnion('kind', [
	z.strictObject({ schemaVersion: version, operationId: uuid, kind: z.literal('set_marker'), probeId: uuid, expectedRevision: revision, payload: z.strictObject({ marker: z.string().refine(s => [...s].length <= 128, 'marker exceeds 128 code points') }) }),
	z.strictObject({ schemaVersion: version, operationId: uuid, kind: z.literal('cancel_probe'), probeId: uuid, expectedRevision: revision, payload: z.strictObject({}) }),
]);
export type Command = z.infer<typeof commandSchema>;
export const tokensSchema = z.strictObject({ inputUncached: integer.nullable(), inputCacheRead: integer.nullable(), inputCacheWrite: integer.nullable(), output: integer.nullable(), reasoning: integer.nullable(), total: integer.nullable() });
export const emptyTokens = () => tokensSchema.parse({ inputUncached: null, inputCacheRead: null, inputCacheWrite: null, output: null, reasoning: null, total: null });
export const attemptSchema = z.strictObject({
	schemaVersion: version, attemptId: uuid, revision,
	owner: z.enum(['session', 'rsi', 'unresolved']), ownerId: z.string().min(1).nullable(), sessionId: z.string().min(1).nullable(),
	purpose: z.enum(['daily', 'analysis', 'baseline', 'generation', 'evaluation', 'final_check', 'probe']),
	callKind: z.enum(['agent', 'compression', 'judge']), retryOfAttemptId: uuid.nullable(),
	provider: z.string().min(1), model: z.string().min(1), providerRequestId: z.string().nullable(),
	state: z.enum(['reserved', 'in_flight', 'succeeded', 'failed', 'cancelled', 'interrupted', 'not_sent']),
	createdAt: integer, startedAt: integer.nullable(), endedAt: integer.nullable(),
	usageState: z.enum(['pending', 'partial', 'confirmed', 'unknown']), tokens: tokensSchema, usageSource: z.enum(['provider', 'derived']).nullable(),
	diagnostic: z.string().nullable(),
}).refine(a => (a.owner === 'unresolved') === (a.ownerId === null), 'owner identity mismatch')
	.refine(a => a.usageState !== 'confirmed' || a.tokens.total !== null, 'confirmed usage requires total');
export type Attempt = z.infer<typeof attemptSchema>;
export const stateSchema = z.strictObject({
	schemaVersion: version, probeId: uuid, snapshotRevision: revision, updatedAt: integer, marker: z.string(), cancelled: z.boolean(),
	budgetStartedAt: integer.nullable(),
});
export type State = z.infer<typeof stateSchema>;
export const snapshotSchema = stateSchema.extend({ attempts: z.array(attemptSchema) });
export type Snapshot = z.infer<typeof snapshotSchema>;
const relativePath = z.string().refine(p => !p.includes('\\') && !/^[A-Za-z]:/.test(p) && p.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'), 'invalid relative Skill path');
export const skillSnapshotSchema = z.strictObject({
	schemaVersion: version, skillId: uuid, workspaceRoot: z.string().min(1), sourceRoot: z.string().min(1), versionDigest: z.string().regex(/^[a-f0-9]{64}$/),
	files: z.array(z.strictObject({ path: relativePath, contentDigest: z.string().regex(/^[a-f0-9]{64}$/), executable: z.boolean() })).min(1).max(32),
}).refine(s => s.files.some(f => f.path === 'SKILL.md') && new Set(s.files.map(f => f.path)).size === s.files.length, 'Skill manifest is incomplete or duplicated');
export const bindingSchema = z.strictObject({ schemaVersion: version, sessionId: z.string().min(1), skillId: uuid, versionDigest: z.string().regex(/^[a-f0-9]{64}$/), boundAt: integer });
export type SkillSnapshot = z.infer<typeof skillSnapshotSchema>;
export function fault(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
