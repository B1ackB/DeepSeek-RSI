import { z } from 'zod';
import { integer } from './contracts.ts';

const encoder = new TextEncoder();
const byteLength = (value: string) => encoder.encode(value).length;
const validUtf8 = (value: string) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(encoder.encode(value)) === value;
function comparePaths(a: string, b: string) { const x = encoder.encode(a); const y = encoder.encode(b); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; }

export const policyBudgetSchema = z.strictObject({
	maxRequests: integer.min(1).max(8), maxOutputTokens: integer.min(128).max(4096), maxInputBytes: integer.min(1024).max(131072),
	tokenStopThreshold: integer.min(1).max(100000), maxToolCalls: integer.min(1).max(16), maxToolResultBytes: integer.min(128).max(65536), maxDurationMs: integer.min(100).max(30000),
});
export const policyPathSchema = z.string().min(1).max(256).refine(path => !/[:\\\0]/.test(path) && path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'), 'Expected a relative snapshot path');
export const policyFilesSchema = z.array(z.strictObject({ path: policyPathSchema, content: z.string().refine(content => !content.includes('\0') && byteLength(content) <= 262144 && validUtf8(content)) })).min(1).max(32)
	.refine(files => new Set(files.map(file => file.path)).size === files.length && files.reduce((sum, file) => sum + byteLength(file.content), 0) <= 1048576, 'Snapshot paths must be unique and total at most 1 MiB');
export function repositoryPathDenied(path: string) {
	return !validUtf8(path) || /[\x00-\x1f\x7f*?\[\]{}]/.test(path) || path.split('/').some(part => /^(?:\.git|\.gitconfig|\.hg|\.svn|node_modules|\.cache|\.dsh|\.rsi|\.ssh|\.aws|\.azure|\.config|\.codex|\.agents|\.gnupg|\.kube|\.docker|\.npm|\.npmrc|\.netrc|\.pypirc|\.dockercfg|\.ds_store)$/i.test(part) || /^\.env/i.test(part) || /(?:^|[._-])(?:credentials?|secrets?|tokens?)(?:[._-]|$)/i.test(part) || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519|auth\.json)/i.test(part) || /\.(?:pem|key|p12|pfx|kdbx|keystore|jks|db|sqlite3?|log)(?:[.-].*)?$/i.test(part));
}
export function repositoryContentDenied(content: string) {
	// ponytail: conservative guards cover common literals, not arbitrary secrets; external disclosure needs explicit file review.
	return /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/.test(content)
		|| /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|authorization)\b["']?\s*[:=]\s*(["'])([^"'\r\n]+)\1/i.test(content)
		|| /^\s*(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|authorization)\s*[:=]\s*(?!process\.env\b|import\.meta\.env\b|os\.environ\b)[a-zA-Z0-9_+/.=-]+\s*$/im.test(content)
		|| /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(content);
}
export const repositorySelectionSchema = z.array(policyPathSchema).min(1).max(32).refine(paths => new Set(paths).size === paths.length && paths.every(path => !repositoryPathDenied(path)), 'Selection contains duplicate or sensitive/unsupported paths');
export const repositoryRootSchema = z.string().min(2).max(4096).refine(root => root.startsWith('/') && !/[\x00-\x1f\x7f]/.test(root) && root.slice(1).split('/').every(part => !!part && part !== '.' && part !== '..'), 'Expected canonical absolute repository provenance');
export const repositorySnapshotSchema = z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('repository-worktree'), root: repositoryRootSchema, files: policyFilesSchema })
	.refine(snapshot => snapshot.files.every((file, index) => !repositoryPathDenied(file.path) && !repositoryContentDenied(file.content) && (index === 0 || comparePaths(snapshot.files[index - 1].path, file.path) < 0)), 'Repository files must be sorted and pass sensitive path/content checks');
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export const policyConditionsDataSchema = z.strictObject({
	schemaVersion: z.literal(1), question: z.string().min(1).max(16000),
	files: policyFilesSchema,
	// ponytail: this gate is fixture-only; add a real route only with its spending and credential contract.
	provider: z.literal('rsi-policy-fixture'), model: z.literal('offline-v1'), budget: policyBudgetSchema,
	sourceSnapshot: z.strictObject({ root: repositoryRootSchema, digest: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
});

export const policySourceBindingSchema = z.strictObject({ workspaceId: z.string().min(1).max(1024), workspacePath: repositoryRootSchema, choiceId: z.uuid(), sourceId: z.uuid(), snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/) });
export const policyGenerationBudgetSchema = z.strictObject({ provider: z.literal('rsi-policy-generation-fixture'), model: z.literal('offline-v1'), maxRequests: z.literal(1), maxOutputTokens: integer.min(128).max(4096), maxInputBytes: integer.min(1024).max(32768), maxDurationMs: integer.min(100).max(30000) });
export const policyBatchBudgetSchema = z.strictObject({ maxRequests: integer.min(1).max(16), tokenStopThreshold: integer.min(1).max(200000), maxDurationMs: integer.min(100).max(60000) });
export const policySourceCaseSchema = z.enum(['symbol', 'call-chain', 'error-path']);
export type PolicySourceCase = z.infer<typeof policySourceCaseSchema>;
