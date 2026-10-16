import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2]; assert.ok(root);
const harness = process.env.RSI_HARNESS ?? '/Users/black/Documents/VSCodeProject/deepseek-harness';
const { chromium } = await import(pathToFileURL(resolve(harness, 'apps/web/node_modules/playwright/index.mjs')).href);
const launch = (await readFile(`${root}/host.log`, 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]; assert.ok(launch);
let page;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
	page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' }); const errors = []; page.on('pageerror', error => errors.push(error.message));
	await page.goto(launch); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.waitFor({ timeout: 3000 }).then(() => true, () => false)) await welcome.click();
	const panel = page.getByRole('complementary', { name: 'RSI 控制面板' }); const card = panel.getByRole('region', { name: '仓库证据策略', exact: true });
	await card.getByText('尚未明确采纳版本', { exact: true }).waitFor({ timeout: 20000 });
	const rpc = (endpoint, payload) => page.evaluate(async ({ endpoint, payload }) => {
		const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: endpoint.split('/').at(-1), payload }) }); return (await response.json()).result;
	}, { endpoint, payload });
	const status = async () => (await rpc('/rsi-policy-fixture/status', {})).value;
	const advanced = panel.locator('summary').filter({ hasText: '高级设置：Skill 与设计偏好' }); await advanced.click();
	const workspace = panel.getByLabel('受管工作区'); await workspace.selectOption({ label: '仓库证据策略隔离验证' });
	await card.locator('summary').filter({ hasText: /^评测 1/ }).click();
	assert.equal((await status()).calls, 0);
	await card.getByRole('button', { name: '选择基线', exact: true }).click(); await card.getByRole('group', { name: '确认版本选择' }).waitFor();
	await workspace.selectOption({ label: '另一个隔离工作区' }); assert.equal(await card.getByRole('group', { name: '确认版本选择' }).count(), 0);
	assert.equal((await status()).policy.choices.length, 0); assert.equal((await status()).calls, 0);
	await workspace.selectOption({ label: '仓库证据策略隔离验证' }); await advanced.click();
	await card.locator('summary').filter({ hasText: /^评测 1/ }).click();
	await card.getByRole('button', { name: '选择基线', exact: true }).click(); assert.equal((await status()).policy.choices.length, 0);
	await card.getByRole('button', { name: '取消选择', exact: true }).click(); assert.equal((await status()).policy.choices.length, 0);
	await card.getByRole('button', { name: '选择基线', exact: true }).click(); await card.getByRole('button', { name: '确认采纳基线', exact: true }).click();
	await card.getByText('新只读会话默认：第 1 次选择', { exact: true }).waitFor();
	await card.getByRole('button', { name: '创建固定响应只读会话', exact: true }).click();
	await card.getByText('已固定版本的只读会话', { exact: true }).waitFor();
	const old = (await status()).policy.sessions[0]; assert.equal((await status()).calls, 0);
	await card.getByRole('button', { name: '选择候选', exact: true }).click(); await card.getByRole('button', { name: '确认采纳候选', exact: true }).click(); await card.getByText('新只读会话默认：第 2 次选择', { exact: true }).waitFor();
	await card.getByRole('button', { name: '创建固定响应只读会话', exact: true }).click();
	await card.getByText('已固定版本的只读会话', { exact: true }).click();
	await card.getByRole('button', { name: /^打开或恢复只读会话 1/ }).click();
	await card.getByText('当前只读会话：会话 1 · 第 1 次选择', { exact: true }).waitFor();
	const editor = page.locator('[contenteditable="true"]').last(); await editor.pressSequentially('Explain total and cite the implementation.'); await editor.press('Enter');
	await page.getByText('total adds 1. Source: sample.js:1-3.', { exact: true }).first().waitFor({ timeout: 15000 });
	let state = await status(); assert.equal(state.calls, 3); assert.ok(state.requests[0].system.includes('Inspect the repository before answering.')); assert.deepEqual(state.policy.sessions[0], old);
	await card.getByRole('button', { name: '恢复第 1 次采纳版本', exact: true }).click(); await card.getByRole('button', { name: '确认恢复第 1 次采纳版本', exact: true }).click(); await card.getByText('新只读会话默认：第 3 次选择（恢复旧版）', { exact: true }).waitFor();
	await page.reload(); await card.getByText('新只读会话默认：第 3 次选择（恢复旧版）', { exact: true }).waitFor(); assert.equal((await status()).calls, 3);
	await card.getByRole('button', { name: '创建固定响应只读会话', exact: true }).click();
	await card.getByText('已固定版本的只读会话', { exact: true }).click(); await card.getByRole('button', { name: /^打开或恢复只读会话 3/ }).waitFor();
	state = await status(); assert.equal(state.policy.sessions.length, 3); assert.equal(state.policy.sessions[2].policyDigest, old.policyDigest); assert.notEqual(state.policy.sessions[1].policyDigest, old.policyDigest);
	const daily = state.attempts.filter(row => row.purpose === 'daily'); assert.equal(daily.length, 3); assert.ok(daily.every(row => row.state === 'succeeded' && row.usageState === 'confirmed')); assert.ok(JSON.stringify(state.requests.at(-1).messages).includes('return value + 1'));
	const sourceChecks = [];
	if (process.argv.includes('--sources')) {
		const sources = card.getByRole('region', { name: '仓库文件与快照', exact: true }); const paths = sources.getByLabel('仓库文件路径');
		await paths.fill('.env'); await sources.getByRole('button', { name: '预览所选文件', exact: true }).click(); await sources.getByRole('alert').waitFor();
		assert.equal((await status()).policy.sources.length, 0); assert.equal((await status()).calls, 3);
		await paths.fill('evidence.ts'); await sources.getByRole('button', { name: '预览所选文件', exact: true }).click(); await sources.getByLabel('快照文件 evidence.ts').waitFor(); assert.ok((await sources.getByLabel('快照文件 evidence.ts').inputValue()).includes('first'));
		await sources.getByRole('button', { name: '封存此预览', exact: true }).click(); await sources.getByRole('button', { name: '取消封存', exact: true }).click(); assert.equal((await status()).policy.sources[0].status, 'preview');
		await sources.getByRole('button', { name: '封存此预览', exact: true }).click(); await writeFile(`${root}/policy-review-home/workspace/evidence.ts`, 'export const sourceVersion = "stale-second";\n');
		await sources.getByRole('button', { name: '确认封存快照', exact: true }).click(); await sources.getByRole('alert').filter({ hasText: '源码已变化' }).waitFor(); assert.equal((await status()).policy.sources[0].status, 'preview');
		await sources.getByRole('button', { name: '预览所选文件', exact: true }).click(); await sources.getByText(/^快照 2 · 预览/).waitFor(); await sources.getByRole('button', { name: '封存此预览', exact: true }).click();
		if (!await workspace.isVisible()) await advanced.click(); await workspace.selectOption({ label: '另一个隔离工作区' }); assert.equal(await card.getByRole('group', { name: '确认封存快照' }).count(), 0); assert.equal(await card.getByLabel('快照文件 evidence.ts').count(), 0);
		await workspace.selectOption({ label: '仓库证据策略隔离验证' }); if (await workspace.isVisible()) await advanced.click();
		await sources.getByLabel('快照文件 evidence.ts').waitFor(); await sources.getByRole('button', { name: '封存此预览', exact: true }).click(); await sources.getByRole('button', { name: '确认封存快照', exact: true }).click(); await sources.getByText(/^快照 2 · 已明确封存/).waitFor();
		await sources.getByRole('button', { name: '使用此快照创建只读会话', exact: true }).click(); await card.getByText('当前源码：仓库快照 2', { exact: true }).waitFor(); const bound = (await status()).policy.sessions[3]; assert.equal((await status()).calls, 3);
		await writeFile(`${root}/policy-review-home/workspace/evidence.ts`, 'export const sourceVersion = "third";\n'); await paths.fill('evidence.ts'); await sources.getByRole('button', { name: '预览所选文件', exact: true }).click(); await sources.getByText(/^快照 3 · 预览/).waitFor(); await sources.getByRole('button', { name: '封存此预览', exact: true }).click(); await sources.getByRole('button', { name: '确认封存快照', exact: true }).click(); await sources.getByText(/^快照 3 · 已明确封存/).waitFor();
		await sources.getByRole('button', { name: '使用此快照创建只读会话', exact: true }).click(); await card.getByText('当前源码：仓库快照 3', { exact: true }).waitFor(); assert.equal((await status()).calls, 3);
		await writeFile(`${root}/policy-review-home/workspace/evidence.ts`, 'export const sourceVersion = "live-fourth";\n');
		await card.getByText('已固定版本的只读会话', { exact: true }).click();
		for (const [number, expected, calls] of [[4, 'stale-second', 6], [5, 'third', 9]]) {
			await card.getByRole('button', { name: new RegExp(`^打开或恢复只读会话 ${number}`) }).click(); await card.getByText(`当前只读会话：会话 ${number} · 第 3 次选择`, { exact: true }).waitFor();
			const editor = page.locator('[contenteditable="true"]').last(); await editor.pressSequentially('Read the confirmed snapshot and cite it.'); await editor.press('Enter');
			for (let attempt = 0; attempt < 100; attempt++) { state = await status(); if (state.calls >= calls && state.attempts.filter(row => row.purpose === 'daily').every(row => row.state === 'succeeded')) break; await new Promise(resolve => setTimeout(resolve, 100)); }
			assert.equal(state.calls, calls); assert.ok(JSON.stringify(state.requests.at(-1).messages).includes(expected)); assert.equal(JSON.stringify(state.requests.at(-1).messages).includes('live-fourth'), false);
		}
		assert.deepEqual(state.policy.sessions[3], bound); assert.equal(state.policy.sources.length, 3); assert.equal(JSON.stringify(state.requests).includes('LOCAL_PRIVATE_SENTINEL'), false);
		await page.reload(); await card.getByText('当前源码：仓库快照 3', { exact: true }).waitFor(); await sources.getByLabel('快照文件 evidence.ts').waitFor(); assert.equal((await status()).calls, 9);
		await sources.scrollIntoViewIfNeeded(); sourceChecks.push('sensitive path rejected before preview', 'full source preview without dispatch', 'cancel seal without mutation', 'changed source requires fresh preview', 'workspace switch clears source and confirmation', 'explicit exact seal', 'new sessions bind exact source before first request', 'old/new source native full tasks', 'reload retains snapshots without replay');
	}
	if (process.argv.includes('--authorization')) {
		assert.ok(process.argv.includes('--sources')); const before = await status();
		let author = card.getByRole('region', { name: '策略生成与独立评测', exact: true });
		await author.getByLabel('本轮策略修改要求').fill('Inspect implementations, inspect callers, and cite source evidence.');
		await author.getByRole('button', { name: '准备生成授权', exact: true }).click(); await author.getByRole('group', { name: '授权生成候选', exact: true }).waitFor();
		await author.getByRole('button', { name: '取消本次授权', exact: true }).click(); assert.equal((await status()).generationRequests.length, 0);
		await author.getByRole('button', { name: '准备生成授权', exact: true }).click();
		if (!await workspace.isVisible()) await advanced.click(); await workspace.selectOption({ label: '另一个隔离工作区' }); assert.equal(await card.getByRole('group', { name: '授权生成候选', exact: true }).count(), 0);
		await workspace.selectOption({ label: '仓库证据策略隔离验证' }); if (await workspace.isVisible()) await advanced.click();
		author = card.getByRole('region', { name: '策略生成与独立评测', exact: true }); await author.getByLabel('本轮策略修改要求').fill('Inspect implementations, inspect callers, and cite source evidence.');
		await author.getByRole('button', { name: '准备生成授权', exact: true }).click(); await author.getByRole('button', { name: '确认授权生成候选', exact: true }).click();
		await author.getByText('候选生成 1 · 候选已封存', { exact: true }).waitFor(); state = await status();
		assert.equal(state.calls, 9); assert.equal(state.generationRequests.length, 1); assert.equal(state.policy.reviews.length, before.policy.reviews.length);
		assert.equal(state.policy.generations[0].sourceId, state.policy.sources[2].id); assert.deepEqual(state.policy.choices, before.policy.choices);
		assert.doesNotMatch(JSON.stringify(state.generationRequests), /stale-second|sourceVersion|evidence\.ts|sample\.js|LOCAL_PRIVATE_SENTINEL|repository-source-v1/);
		assert.deepEqual(state.generationRequests[0].tools, []);
		await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('group', { name: '授权独立评测', exact: true }).waitFor();
		await author.getByRole('button', { name: '取消本次授权', exact: true }).click(); assert.equal((await status()).calls, 9);
		await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('button', { name: '确认授权独立评测', exact: true }).click();
		for (let n = 0; n < 200; n++) { state = await status(); if (state.policy.reviews.at(-1)?.status === 'passed' && state.calls === 15) break; await new Promise(resolve => setTimeout(resolve, 50)); }
		assert.equal(state.calls, 15); assert.equal(state.policy.reviews.at(-1).status, 'passed'); assert.ok(state.policy.reviews.at(-1).sides.every(row => row.infrastructure && row.requests === 3 && row.tools === 2 && row.totalTokens === 45));
		assert.deepEqual(state.policy.choices, before.policy.choices); assert.deepEqual(state.policy.sessions, before.policy.sessions);
		await page.reload(); await card.getByText('候选生成 1 · 候选已封存', { exact: true }).waitFor(); state = await status(); assert.equal(state.calls, 15); assert.equal(state.generationRequests.length, 1);
		await card.getByRole('region', { name: '策略生成与独立评测', exact: true }).scrollIntoViewIfNeeded();
		sourceChecks.push('generation confirmation cancel/workspace reset without dispatch', 'exact sealed source and baseline bound', 'generator excludes selected source and held-out answers', 'generation does not authorize evaluation', 'independent evaluation confirmation cancel', 'two source full tool tasks with separate generation/batch accounting', 'no automatic adoption or session rebinding', 'reload without generation or evaluation replay');
	}
	await writeFile(`${root}/browser-status.json`, JSON.stringify(state, null, 2));
	const text = await card.innerText(); assert.doesNotMatch(text, /\b[a-f0-9]{12,64}\b|\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/i);
	await page.screenshot({ path: `${root}/sidebar.png` });
	await page.setViewportSize({ width: 760, height: 1000 }); await page.screenshot({ path: `${root}/sidebar-narrow.png` });
	assert.deepEqual(errors, []); await writeFile(`${root}/browser-result.json`, JSON.stringify({ status: 'passed', paidRequests: 0, calls: state.calls, generationCalls: state.generationRequests?.length ?? 0, choices: state.policy.choices.length, sessions: state.policy.sessions.length, checks: ['workspace switch clears pending confirmation', 'explicit confirmation/cancel', 'review without dispatch', 'old session first request after adoption', 'native full tool task', 'restore future binding', 'reload without replay', 'readable sidebar at wide/narrow viewport', ...sourceChecks], browserErrors: errors }, null, 2));
} catch (error) { if (page) { await page.screenshot({ path: `${root}/browser-failure.png` }); await writeFile(`${root}/browser-failure.txt`, await page.locator('body').innerText()); } throw error; } finally { await browser.close(); }
