import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { chromium } = await import(pathToFileURL('/Users/black/Documents/VSCodeProject/deepseek-harness/apps/web/node_modules/playwright/index.mjs').href);
const launch = (await readFile(`${root}/host.log`, 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)[0];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' }); const errors = []; page.on('pageerror', error => errors.push(error.message));
	await page.goto(launch); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.waitFor({ timeout: 2000 }).then(() => true, () => false)) await welcome.click();
	const panel = page.getByRole('complementary', { name: 'RSI 控制面板' }); await panel.locator('summary').filter({ hasText: '高级设置：Skill 与设计偏好' }).click(); await panel.getByLabel('受管工作区').selectOption({ label: '仓库证据策略隔离验证' });
	const author = panel.getByRole('region', { name: '策略生成与独立评测', exact: true }); await author.getByText('候选生成 1 · 候选已封存', { exact: true }).waitFor();
	const status = () => page.evaluate(async () => { const response = await fetch('/rsi-policy-fixture/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'status', payload: {} }) }); return (await response.json()).result.value; });
	const before = await status(); assert.equal(before.calls, 0); assert.equal(before.generationRequests.length, 0); assert.equal(before.attempts.length, 29);
	await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('button', { name: '确认授权独立评测', exact: true }).click();
	let state;
	for (let n = 0; n < 200; n++) { state = await status(); if (state.calls === 6 && state.policy.reviews.at(-1).status === 'passed') break; await new Promise(resolve => setTimeout(resolve, 50)); }
	assert.equal(state.calls, 6); assert.equal(state.policy.reviews.at(-1).status, 'passed'); assert.equal(state.generationRequests.length, 0); assert.equal(state.attempts.length, 35);
	assert.deepEqual(state.policy.sessions, before.policy.sessions); assert.deepEqual(state.policy.choices, before.policy.choices); assert.deepEqual(state.policy.generations, before.policy.generations); assert.deepEqual(state.policy.reviews.slice(0, -1), before.policy.reviews);
	assert.ok(state.policy.reviews.at(-1).sides.every(row => row.infrastructure && row.facts && row.citations && row.tools === 2 && row.requests === 3)); assert.deepEqual(errors, []);
	await writeFile(`${root}/final-browser-result.json`, JSON.stringify({ status: 'passed', finalBuild: true, paidRequests: 0, generationRequests: 0, explicitlyAuthorizedEvaluationRequests: 6, preservedEarlierAttempts: 29, totalAttempts: 35, preservedSessions: 5, nativeFullTaskSides: 2, tools: 4, automaticAdoptions: 0, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
