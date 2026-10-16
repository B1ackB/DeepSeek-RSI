import type { Context } from '@deepseek-ai/cordis';
import type {} from '../src/index.ts';
import { join, dirname } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { registerPolicyGenerationAdapter } from './policy-generation.ts';
import { registerPolicyReviewAdapter } from './policy-review-fixture.ts';
import { sourceQaFiles } from '../src/policy-source-qa.ts';

export const inject = ['llm', 'rsiG0', 'rsiG1', 'workspaceRegistry', 'connection'];
export async function apply(ctx: Context) {
	if (process.env.RSI_POLICY_REVIEW_FIXTURE !== '1' || !process.env.DSH_HOME?.endsWith('/policy-review-home')) throw new Error('An isolated policy review home is required');
	const requests = registerPolicyReviewAdapter(ctx, ctx.rsiG0.store);
	const generationRequests = registerPolicyGenerationAdapter(ctx, ctx.rsiG0.store);
	const workspace = join(process.env.DSH_HOME, 'workspace');
	await mkdir(join(workspace, '.git'), { recursive: true });
	for (const [path, content] of [['evidence.ts', 'export const sourceVersion = "first";\n'], ['.env', 'LOCAL_PRIVATE_SENTINEL']]) {
		try { await access(join(workspace, path)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(join(workspace, path), content, { flag: 'wx', mode: 0o600 }); }
	}
	for (const { path, content } of sourceQaFiles()) {
		await mkdir(dirname(join(workspace, path)), { recursive: true });
		try { await access(join(workspace, path)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(join(workspace, path), content, { flag: 'wx', mode: 0o600 }); }
	}
	await ctx.workspaceRegistry.create(join(process.env.DSH_HOME, 'workspace'), '仓库证据策略隔离验证');
	if (process.env.RSI_POLICY_MANUAL_QA_REPOSITORY) await ctx.workspaceRegistry.create(process.env.RSI_POLICY_MANUAL_QA_REPOSITORY, '真实仓库人工问答验证');
	await mkdir(join(process.env.DSH_HOME, 'alternate'), { recursive: true });
	await ctx.workspaceRegistry.create(join(process.env.DSH_HOME, 'alternate'), '另一个隔离工作区');
	ctx.effect(() => ctx.connection.rpc.handle('/rsi-policy-fixture', async (endpoint, payload) => {
		if (endpoint !== 'status' || JSON.stringify(payload) !== '{}') throw new Error('Read-only fixture status only');
		return { ok: true, value: { calls: requests.length, requests, generationRequests, policy: ctx.rsiG0.store.policyReview(), attempts: ctx.rsiG0.store.snapshot().attempts } };
	}));
}
