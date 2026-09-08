import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL('/Users/black/Documents/VSCodeProject/deepseek-harness/apps/web/node_modules/playwright/index.mjs').href);
const log = await readFile('/private/tmp/rsi-g1-live-low-host.log', 'utf8');
const launch = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]; assert.ok(launch);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let page;
async function rpc(group, endpoint, payload = {}) { return page.evaluate(async ({ group, endpoint, payload }) => {
	const response = await fetch(`/${group}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: endpoint, payload }) });
	if (!response.ok) throw new Error(`HTTP ${response.status}`); return (await response.json()).result;
}, { group, endpoint, payload }); }
try {
	page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
	await page.goto(launch); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.isVisible()) await welcome.click();
	const existing = await rpc('rsi-g1-live-probe', 'status');
	const prepared = existing.value?.analysis ? existing : await rpc('rsi-g1-live-probe', 'prepare'); assert.equal(prepared.ok, true); assert.equal(prepared.value.calls, 0);
	const analysis = prepared.value.analysis; assert.equal(analysis.status, 'prepared');
	assert.deepEqual(analysis.budget, { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low', maxRequests: 1, maxOutputTokens: 4096, maxDurationMs: 300000, maxInputBytes: 32768 });
	assert.ok(Buffer.byteLength(JSON.stringify([analysis.system, analysis.input])) <= 32768);
	await page.getByText('高级设置：Skill 与设计偏好', { exact: true }).click();
	await page.getByLabel('受管工作区').selectOption({ label: 'RSI G1 Low 真实验收' });
	await page.getByRole('textbox', { name: '分析发送内容' }).waitFor();
	const began = Date.now();
	await page.getByRole('button', { name: '确认范围与预算，开始分析', exact: true }).click();
	let final;
	for (;;) {
		final = await rpc('rsi-g1-live-probe', 'status'); assert.equal(final.ok, true);
		if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(final.value.analysis.status)) break;
		if (Date.now() - began > 310000) throw new Error('Host failed to settle inside the approved window');
		await setTimeout(1000);
	}
	const snapshot = (await rpc('rsi', 'snapshot')).value;
	const rows = snapshot.attempts.filter(a => a.ownerId === analysis.id);
	assert.equal(final.value.calls, 1); assert.equal(rows.length, 1);
	await mkdir('.cache/g1-live-low-evidence', { recursive: true });
	const evidence = { date: '2026-09-08', analysisId: analysis.id, status: final.value.analysis.status, error: final.value.analysis.error, budget: analysis.budget, inputBytes: Buffer.byteLength(JSON.stringify([analysis.system, analysis.input])), durationMs: Date.now() - began, attempts: rows, result: final.value.analysis.result };
	await writeFile('.cache/g1-live-low-evidence/result.json', JSON.stringify(evidence, null, '\t') + '\n');
	if (rows[0].usageState === 'confirmed') {
		await page.locator(`[data-rsi-owner="rsi"][data-rsi-total="${rows[0].tokens.total}"]`).waitFor();
		await page.getByRole('heading', { name: 'Skill 优化' }).scrollIntoViewIfNeeded();
		await page.screenshot({ path: '.cache/g1-live-low-evidence/usage.png' });
	}
	if (evidence.status === 'succeeded') {
		const index = evidence.result.directions.findIndex(d => d.objective === 'brevity');
		assert.ok(index >= 0, 'The fixed conciseness request needs a matching direction');
		const direction = evidence.result.directions[index];
		await page.getByText(`${direction.title} · 简洁表达`, { exact: true }).click();
		const form = page.locator('details.rsi-card').filter({ has: page.locator('summary').filter({ hasText: `${direction.title} · 简洁表达` }) });
		await form.getByLabel('必须保留的信息').fill('版本标记、执行结果与任何错误');
		await form.getByRole('button', { name: '保存授权草稿', exact: true }).click();
		await page.getByText('简洁表达 · 草稿，未授权修改', { exact: true }).waitFor();
		assert.equal(await page.getByRole('button', { name: '正式授权：等待评测契约', exact: true }).isDisabled(), true);
		const saved = (await rpc('rsi', 'snapshot')).value;
		const draft = saved.business.drafts.find(d => d.analysisId === analysis.id);
		assert.equal(draft.status, 'draft');
		assert.equal(saved.attempts.filter(a => a.ownerId === analysis.id).length, 1);
		for (const file of ['SKILL.md', 'probe.py', 'probe.sh', 'reference.txt']) assert.deepEqual(await readFile(`.cache/g1-live-low-workspace/sample/${file}`), await readFile(`fixtures/v1/${file}`));
		evidence.draft = draft; evidence.sourceUnchanged = true;
		await writeFile('.cache/g1-live-low-evidence/result.json', JSON.stringify(evidence, null, '\t') + '\n');
		await page.screenshot({ path: '.cache/g1-live-low-evidence/draft.png' });
	}
	console.log(JSON.stringify({ status: evidence.status, error: evidence.error, requests: rows.length, tokens: rows[0].tokens, durationMs: evidence.durationMs, directions: evidence.result?.directions.map(d => ({ objective: d.objective, title: d.title })) }));
	assert.equal(evidence.status, 'succeeded', evidence.error ?? 'Analysis failed');
} finally {
	try {
		if (page) assert.equal((await rpc('rsi-g1-live-probe', 'cleanup')).ok, true);
	} finally { await browser.close(); }
}
