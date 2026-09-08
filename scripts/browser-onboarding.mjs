import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const harness = process.env.RSI_HARNESS ?? '/Users/black/Documents/VSCodeProject/deepseek-harness';
const { chromium } = await import(pathToFileURL(resolve(harness, 'apps/web/node_modules/playwright/index.mjs')).href);
const log = await readFile(process.argv[2] ?? '/private/tmp/rsi-onboarding-host.log', 'utf8');
const launch = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]; assert.ok(launch);
const evidenceDir = '.cache/onboarding-evidence'; await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
	const errors = []; page.on('pageerror', error => errors.push(error.message));
	await page.goto(launch); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.isVisible()) await welcome.click();
	const panel = page.getByRole('complementary', { name: 'RSI 控制面板' });
	await panel.getByRole('heading', { name: 'Skill 优化' }).waitFor({ timeout: 20000 });
	assert.equal(await panel.getByLabel('受管工作区').isVisible(), false);
	const status = () => page.evaluate(async () => {
		const r = await fetch('/rsi-g1-fixture/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'status', payload: {} }) }); return (await r.json()).result.value;
	});
	const send = async text => { const editor = page.locator('[contenteditable="true"]').last(); await editor.fill(text); await editor.press('Enter'); };
	const reply = async name => { const radio = page.getByRole('radio', { name, exact: true }); await radio.click(); await radio.press('Enter'); };
	await send('请设计一个前端落地页，结论保持简洁');
	await page.getByRole('radio', { name: '纳入 rsi-frontend-design', exact: true }).waitFor({ timeout: 20000 });
	assert.equal((await status()).calls, 0); assert.equal((await status()).state.skills.length, 0);
	await page.screenshot({ path: `${evidenceDir}/question.png` });
	await reply('纳入 rsi-frontend-design');
	await panel.getByText('已纳入：rsi-frontend-design', { exact: true }).waitFor();
	await page.getByText('固定响应：本次流程验证完成，没有生成页面。', { exact: true }).first().waitFor();
	assert.equal((await status()).state.enrollments.length, 1);
	await send('继续调整配色，说明保持简洁');
	await page.getByText('固定响应：本次流程验证完成，没有生成页面。', { exact: true }).nth(1).waitFor();
	assert.equal((await status()).state.enrollments.length, 1); assert.equal(await page.getByRole('radio', { name: '纳入 rsi-frontend-design', exact: true }).count(), 0);
	await page.screenshot({ path: `${evidenceDir}/included.png` });
	await panel.getByRole('button', { name: '结束本次任务', exact: true }).click();
	await panel.getByText('已纳入：rsi-frontend-design', { exact: true }).waitFor({ state: 'hidden' });
	await send('/rsi-frontend-design 设计一个新的页面');
	await page.getByRole('radio', { name: '暂不纳入，继续编写', exact: true }).waitFor();
	await reply('暂不纳入，继续编写');
	await panel.getByText('本次暂不纳入 RSI', { exact: true }).waitFor();
	await page.getByText('固定响应：本次流程验证完成，没有生成页面。', { exact: true }).nth(2).waitFor();
	const final = await status(); assert.equal(final.state.enrollments.length, 2); assert.equal(final.state.enrollments[1].decision, 'declined'); assert.deepEqual(errors, []);
	const evidence = { status: 'passed', paidRequests: 0, fixtureCalls: final.calls, checks: ['advanced controls collapsed', 'ordinary composer triggers enrollment before model', 'explicit consent enrolls without manual setup', 'same-session followup does not ask again', 'end task asks again', 'decline continues ordinary task'], browserErrors: errors };
	await writeFile(`${evidenceDir}/result.json`, JSON.stringify(evidence, null, '\t') + '\n'); console.log(JSON.stringify(evidence));
} catch (error) { for (const page of browser.contexts().flatMap(c => c.pages())) await page.screenshot({ path: `${evidenceDir}/failure.png` }); throw error; }
finally { await browser.close(); }
