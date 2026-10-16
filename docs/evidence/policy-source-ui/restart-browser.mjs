import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = '/Users/black/Documents/ChatGPT/DeepSeek-RSI/.cache/policy-source-ui-xdRa88';
const { chromium } = await import(pathToFileURL(resolve('/Users/black/Documents/VSCodeProject/deepseek-harness/apps/web/node_modules/playwright/index.mjs')).href);
const launch = (await readFile(`${root}/host.log`, 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)[0];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' }); const errors = []; page.on('pageerror', error => errors.push(error.message));
	await page.goto(launch); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.waitFor({ timeout: 2000 }).then(() => true, () => false)) await welcome.click();
	const panel = page.getByRole('complementary', { name: 'RSI 控制面板' }); await panel.locator('summary').filter({ hasText: '高级设置：Skill 与设计偏好' }).click(); await panel.getByLabel('受管工作区').selectOption({ label: '仓库证据策略隔离验证' });
	const card = panel.getByRole('region', { name: '仓库证据策略', exact: true }); const sources = card.getByRole('region', { name: '仓库文件与快照', exact: true });
	await sources.getByLabel('快照文件 evidence.ts').waitFor(); assert.ok((await sources.getByLabel('快照文件 evidence.ts').inputValue()).includes('third'));
	await card.getByText('已固定版本的只读会话', { exact: true }).click(); await card.getByRole('button', { name: /^打开或恢复只读会话 4/ }).click(); await card.getByText('当前源码：仓库快照 2', { exact: true }).waitFor();
	await sources.getByLabel('仓库快照记录').selectOption({ label: '快照 2 · 已封存' }); await sources.getByText(/^快照 2 · 已明确封存/).waitFor(); assert.ok((await sources.getByLabel('快照文件 evidence.ts').inputValue()).includes('stale-second')); await sources.getByText(/来源工作区：/).waitFor();
	const state = await page.evaluate(async () => { const response = await fetch('/rsi-policy-fixture/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'status', payload: {} }) }); return (await response.json()).result.value; });
	assert.equal(state.calls, 0); assert.equal(state.policy.sources.length, 3); assert.equal(state.policy.sessions.length, 5); assert.equal(state.attempts.filter(row => row.purpose === 'daily').length, 9); assert.equal(state.policy.sessions[3].sourceId, state.policy.sources[1].id); assert.deepEqual(errors, []);
	await sources.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${root}/sidebar-resumed.png` }); await page.setViewportSize({ width: 760, height: 1000 }); await page.screenshot({ path: `${root}/sidebar-resumed-narrow.png` });
	await writeFile(`${root}/restart-result.json`, JSON.stringify({ status: 'passed', modelRequestsAfterRestart: 0, sources: state.policy.sources.length, sessions: state.policy.sessions.length, preservedDailyAttempts: 9, oldSessionSource: 'snapshot 2', browserErrors: errors }, null, 2));
} finally { await browser.close(); }
