import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const harness = process.env.RSI_HARNESS ?? '/Users/black/Documents/VSCodeProject/deepseek-harness';
const { chromium } = await import(pathToFileURL(resolve(harness, 'apps/web/node_modules/playwright/index.mjs')).href);
const log = await readFile(process.argv[2] ?? '/private/tmp/rsi-latency-host.log', 'utf8');
const launch = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];
assert.ok(launch, 'Missing authenticated local startup URL');
const browser = await chromium.launch({ executablePath: process.env.RSI_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, locale: 'zh-CN' });
	await page.goto(launch);
	await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true });
	if (await welcome.isVisible()) await welcome.click();
	await page.getByRole('button', { name: '设置', exact: true }).click();
	await page.getByRole('button', { name: '插件', exact: true }).click();
	await page.getByRole('tab', { name: 'DeepSeek RSI', exact: true }).click();
	await page.getByRole('heading', { name: 'DeepSeek RSI · G0 接入验证' }).waitFor();
	await page.getByTestId('rsi-marker').waitFor();
	await mkdir('.cache/latency-evidence', { recursive: true });
	const samples = [];
	for (let index = 0; index < 3; index++) {
		const result = await page.evaluate(async () => {
			const response = await fetch('/rsi-latency-fixture/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'run', payload: {} }) });
			if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
			return (await response.json()).result;
		});
		assert.equal(result.ok, true);
		const { receivedAt, attempt } = result.value;
		assert.equal(attempt.tokens.total, 130);
		const row = page.locator(`[data-rsi-attempt="${attempt.attemptId}"][data-rsi-total="130"]`);
		await row.waitFor({ state: 'visible' });
		await row.scrollIntoViewIfNeeded();
		assert.match(await row.innerText(), /130 Token/);
		// 截图等待浏览器完成合成；上界也包括 RPC 返回、DOM 检查及截图开销。
		await page.screenshot({ path: `.cache/latency-evidence/sample-${index + 1}.png` });
		const capturedAt = Date.now();
		const upperBoundMs = capturedAt - receivedAt;
		assert.ok(upperBoundMs >= 0 && upperBoundMs < 1000, `Usage-to-capture took ${upperBoundMs} ms`);
		samples.push({ receivedAt, capturedAt, upperBoundMs, attemptId: attempt.attemptId });
	}
	const evidence = { check: 'fixture_usage_to_browser_capture', status: 'passed', provider: 'rsi-browser-fixture', paidRequests: 0, samples };
	await writeFile('.cache/latency-evidence/result.json', `${JSON.stringify(evidence, null, 2)}\n`);
	console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
