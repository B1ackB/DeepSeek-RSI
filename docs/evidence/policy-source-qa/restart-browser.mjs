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
	const card = panel.getByRole('region', { name: '仓库证据策略', exact: true }); await card.getByText('候选生成 2 · 候选已封存', { exact: true }).waitFor();
	await card.getByLabel('固定评测问题').selectOption('error-path');
	await card.getByText('已固定版本的只读会话', { exact: true }).click(); await card.getByRole('button', { name: /^打开或恢复只读会话 4/ }).click(); await card.getByText('当前源码：仓库快照 2', { exact: true }).waitFor();
	const state = await page.evaluate(async () => { const response = await fetch('/rsi-policy-fixture/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'status', payload: {} }) }); return (await response.json()).result.value; });
	const before = JSON.parse(await readFile(`${root}/browser-status.json`, 'utf8'));
	assert.equal(state.calls, 0); assert.equal(state.generationRequests.length, 0); assert.equal(state.attempts.length, 48);
	assert.deepEqual(state.policy, before.policy); assert.deepEqual(state.attempts, before.attempts); assert.equal(state.policy.reviews.length, 5); assert.ok(state.policy.reviews.slice(-3).every(row => row.status === 'passed'));
	assert.equal(state.policy.sessions.length, 5); assert.equal(state.policy.sources[3].qaAvailable, true); assert.deepEqual(errors, []);
	await writeFile(`${root}/restart-result.json`, JSON.stringify({ status: 'passed', generationRequestsAfterRestart: 0, evaluationAndDailyRequestsAfterRestart: 0, policyProjectionAndAttemptRowsUnchanged: true, totalAttempts: 48, sealedSourceGenerations: 2, retainedQAEvaluations: 3, oldSessionSource: 'snapshot 2', unchangedSessionBindings: 5, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
