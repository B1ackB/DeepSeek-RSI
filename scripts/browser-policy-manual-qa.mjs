import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2]; assert.ok(root); const wholePack = process.argv.includes('--pack');
const { chromium } = await import(pathToFileURL(resolve(process.env.RSI_HARNESS ?? '/Users/black/Documents/VSCodeProject/deepseek-harness', 'apps/web/node_modules/playwright/index.mjs')).href);
const launch = (await readFile(`${root}/host.log`, 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]; assert.ok(launch);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const main = 'src/policy-manual-qa.ts'; const inputs = 'src/policy-qa-inputs.ts';
const questions = [
	{ id: 'symbol', label: '符号定位', question: 'Locate the exported validator for manual question packs.', fact: 'definition', value: 'validateManualQa is exported by src/policy-manual-qa.ts.', refs: [{ path: main, start: 6, end: 7 }] },
	{ id: 'call-chain', label: '调用链', question: 'Trace manualSourceQuestion through manual pack schema parsing.', fact: 'edge', value: 'manualSourceQuestion calls validateManualQa, which parses policyQaContentSchema.', refs: [{ path: main, start: 15, end: 16 }, { path: main, start: 6, end: 7 }, { path: inputs, start: 11, end: 12 }] },
	{ id: 'error-path', label: '错误路径', question: 'Identify the failures for mismatched snapshot identity and invalid cited lines.', fact: 'errors', value: 'validateManualQa throws policy_qa_source_mismatch for a mismatched snapshot and policy_qa_citation_invalid for an absent file or excessive end line.', refs: [{ path: main, start: 8, end: 11 }] },
];
async function narrowPreview(page, panel, qa, packId) {
	await page.setViewportSize({ width: 760, height: 1000 }); const toggle = page.getByRole('button', { name: /RSI$/ }); if (await toggle.count()) await toggle.click();
	let narrowPanelVisible = false;
	try {
		const workspace = panel.getByLabel('受管工作区'); if (!await workspace.isVisible()) await panel.locator('summary').filter({ hasText: '高级设置：Skill 与设计偏好' }).click({ timeout: 2000 }); await workspace.selectOption({ label: '真实仓库人工问答验证' }, { timeout: 2000 });
		await qa.getByLabel('人工问答包记录').selectOption(packId, { timeout: 2000 }); await qa.getByText('人工配置固定问答包', { exact: true }).scrollIntoViewIfNeeded({ timeout: 2000 }); const box = await qa.boundingBox({ timeout: 2000 }); narrowPanelVisible = !!box && box.x >= 0 && box.x + box.width <= 760;
	} catch { /* Host may close the details column at this width; record the actual limit. */ }
	await page.screenshot({ path: `${root}/sidebar-narrow.png` });
	return narrowPanelVisible;
}

try {
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' }); const errors = []; page.on('pageerror', error => errors.push(error.message));
	await page.goto(launch); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
	const welcome = page.getByRole('button', { name: '继续', exact: true }); if (await welcome.waitFor({ timeout: 2000 }).then(() => true, () => false)) await welcome.click();
	const panel = page.getByRole('complementary', { name: 'RSI 控制面板' }); const card = panel.getByRole('region', { name: '仓库证据策略', exact: true });
	await panel.locator('summary').filter({ hasText: '高级设置：Skill 与设计偏好' }).click(); await panel.getByLabel('受管工作区').selectOption({ label: '真实仓库人工问答验证' });
	const status = () => page.evaluate(async () => { const response = await fetch('/rsi-policy-fixture/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'status', payload: {} }) }); return (await response.json()).result.value; });
	if (process.argv.includes('--restart')) {
		const before = JSON.parse(await readFile(`${root}/browser-status.json`, 'utf8'));
		const qa = card.getByRole('region', { name: '人工固定问答包', exact: true }); await qa.getByLabel('人工问答包记录').selectOption(before.policy.qaPacks[0].id);
		await qa.getByText('审阅人工包 1 · 已封存', { exact: true }).waitFor();
		await card.getByText('已固定版本的只读会话', { exact: true }).click(); await card.getByRole('button', { name: /^打开或恢复只读会话 1/ }).click();
		const state = await status(); assert.equal(state.calls, 0); assert.equal(state.generationRequests.length, 0); assert.deepEqual(state.policy, before.policy); assert.deepEqual(state.attempts, before.attempts); assert.deepEqual(errors, []);
		await qa.getByLabel('题目', { exact: true }).fill('Transient unsaved review edit'); assert.equal(await qa.getByRole('button', { name: '保存为修订草稿', exact: true }).isEnabled(), true);
		await qa.getByLabel('人工问答包记录').selectOption(before.policy.qaPacks[1].id); await qa.getByText('审阅人工包 2 · 草稿', { exact: true }).waitFor(); await qa.getByLabel('人工问答包记录').selectOption(before.policy.qaPacks[0].id); await qa.getByText('审阅人工包 1 · 已封存', { exact: true }).waitFor(); assert.equal(await qa.getByLabel('题目', { exact: true }).inputValue(), questions[0].question);
		await qa.getByText('人工配置固定问答包', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${root}/sidebar.png` }); const narrowPanelVisible = await narrowPreview(page, panel, qa, before.policy.qaPacks[0].id);
		await writeFile(`${root}/restart-result.json`, JSON.stringify({ status: 'passed', requestsAfterRestart: 0, identicalPolicyProjection: true, identicalAttemptRows: true, totalAttempts: state.attempts.length, wholePackEvaluations: state.policy.packEvaluations.length, packs: state.policy.qaPacks.length, reviews: state.policy.reviews.length, retainedSessions: state.policy.sessions.length, reloadedPackEditableAndSelectionExact: true, narrowPanelVisible, browserErrors: errors }, null, 2));
	} else {
		await card.locator('summary').filter({ hasText: /^评测 1/ }).click(); await card.getByRole('button', { name: '选择基线', exact: true }).click(); await card.getByRole('button', { name: '确认采纳基线', exact: true }).click();
		const sources = card.getByRole('region', { name: '仓库文件与快照', exact: true }); await sources.getByLabel('仓库文件路径').fill(`${main}\n${inputs}`); await sources.getByRole('button', { name: '预览所选文件', exact: true }).click(); await sources.getByLabel(`快照文件 ${main}`).waitFor();
		assert.equal(await sources.getByLabel(`快照文件 ${main}`).inputValue(), await readFile(resolve(main), 'utf8'));
		await sources.getByRole('button', { name: '封存此预览', exact: true }).click(); await sources.getByRole('button', { name: '确认封存快照', exact: true }).click(); await sources.getByText(/^快照 1 · 已明确封存/).waitFor();
		await sources.getByRole('button', { name: '使用此快照创建只读会话', exact: true }).click();
		const qa = sources.getByRole('region', { name: '人工固定问答包', exact: true });
		for (const question of questions) {
			await qa.getByLabel('配置题型').selectOption(question.id); await qa.getByLabel('题目', { exact: true }).fill(question.question); await qa.getByLabel('事实键', { exact: true }).fill(question.fact); await qa.getByLabel('标准答案', { exact: true }).fill(question.value);
			for (let i = 0; i < question.refs.length; i++) { if (i) await qa.getByRole('button', { name: '添加引用', exact: true }).click(); const ref = qa.getByRole('group', { name: `引用 ${i + 1}`, exact: true }); await ref.getByLabel('引用文件').selectOption(question.refs[i].path); await ref.getByLabel('起始行').fill(String(question.refs[i].start)); await ref.getByLabel('结束行').fill(String(question.refs[i].end)); }
		}
		await qa.getByRole('button', { name: '保存问答草稿', exact: true }).click(); await qa.getByText('审阅人工包 1 · 草稿', { exact: true }).waitFor();
		let state = await status(); assert.equal(state.calls, 0); assert.equal(state.generationRequests.length, 0); assert.equal(state.policy.qaPacks[0].status, 'draft'); assert.equal(JSON.stringify(state.policy.qaPacks).includes(questions[0].value), false);
		await qa.getByRole('button', { name: '准备封存问答包', exact: true }).click(); await qa.getByRole('button', { name: '取消问答包封存', exact: true }).click(); assert.equal((await status()).policy.qaPacks[0].status, 'draft');
		await qa.getByRole('button', { name: '准备封存问答包', exact: true }).click(); await qa.getByRole('button', { name: '确认封存问答包', exact: true }).click(); await qa.getByText('审阅人工包 1 · 已封存', { exact: true }).waitFor();
		const author = sources.getByRole('region', { name: '策略生成与独立评测', exact: true }); await author.getByLabel('本轮策略修改要求').fill('Locate implementations, follow relevant calls and errors, and cite observed source.'); await author.getByRole('button', { name: '准备生成授权', exact: true }).click(); await author.getByRole('button', { name: '取消本次授权', exact: true }).click(); assert.equal((await status()).generationRequests.length, 0);
		await author.getByRole('button', { name: '准备生成授权', exact: true }).click(); await author.getByRole('button', { name: '确认授权生成候选', exact: true }).click(); await author.getByText('候选生成 1 · 候选已封存', { exact: true }).waitFor();
		state = await status(); assert.equal(state.calls, 0); assert.equal(state.generationRequests.length, 1); for (const row of questions) assert.equal(JSON.stringify(state.generationRequests).includes(row.value), false);
		const pack = state.policy.qaPacks[0]; const bindings = state.policy.sessions; await author.getByLabel('评测问答包').selectOption(pack.id); assert.equal(await author.getByLabel('评测整批请求上限').inputValue(), '6'); await author.getByLabel('评测整批请求上限').fill('8');
		if (wholePack) {
			await author.getByLabel('评测范围', { exact: true }).selectOption('pack'); assert.equal(await author.getByLabel('评测整批请求上限').inputValue(), '8');
			await author.getByLabel('评测整批请求上限').fill('24'); assert.equal(await author.getByLabel('固定评测问题').isDisabled(), true);
			await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('button', { name: '取消本次授权', exact: true }).click();
			state = await status(); assert.equal(state.calls, 0); assert.equal(state.policy.packEvaluations.length, 0); assert.equal(state.policy.reviews.length, 1);
			await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('button', { name: '确认授权整包评测', exact: true }).click();
			const summary = card.getByRole('region', { name: '整包评测汇总', exact: true }); await summary.getByText('整包评测 1 · 三题固定检查通过', { exact: true }).waitFor({ timeout: 20000 });
			await summary.getByText('完整题目 3/3 · 20/24 次评测请求 · 300 Token（已确认 300，未知用量 0 次）', { exact: true }).waitFor();
			state = await status(); assert.equal(state.policy.packEvaluations.length, 1); assert.equal(state.policy.packEvaluations[0].packId, pack.id); assert.equal(state.policy.packEvaluations[0].packDigest, pack.digest); assert.equal(state.policy.packEvaluations[0].snapshotDigest, pack.snapshotDigest); assert.equal(state.policy.packEvaluations[0].completedCases, 3);
			await summary.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${root}/pack-summary.png` });
		} else {
		for (let i = 0; i < questions.length; i++) {
			await author.getByLabel('固定评测问题').selectOption(questions[i].id); await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('button', { name: '取消本次授权', exact: true }).click(); assert.equal((await status()).policy.reviews.length, i + 1);
			await author.getByRole('button', { name: '准备此候选的独立评测', exact: true }).click(); await author.getByRole('button', { name: '确认授权独立评测', exact: true }).click(); await card.locator('summary').filter({ hasText: new RegExp(`^评测 ${i + 2} · 固定检查通过`) }).waitFor({ timeout: 20000 });
		}
		}
		state = await status(); assert.equal(state.calls, 20); assert.equal(state.generationRequests.length, 1); assert.equal(state.policy.choices.length, 1); assert.deepEqual(state.policy.sessions, bindings); assert.ok(state.policy.reviews.slice(1).every(row => row.eligible));
		await qa.getByLabel('配置题型').selectOption('symbol'); await qa.getByLabel('题目', { exact: true }).fill('Locate the exported validator again, preserving the sealed parent.'); await qa.getByRole('button', { name: '保存为修订草稿', exact: true }).click(); await qa.getByText('审阅人工包 2 · 草稿', { exact: true }).waitFor();
		state = await status(); assert.equal(state.policy.qaPacks[1].parentId, pack.id); assert.equal(state.policy.qaPacks[0].status, 'sealed');
		await page.reload(); await card.getByText('候选生成 1 · 候选已封存', { exact: true }).waitFor(); await qa.getByLabel('人工问答包记录').selectOption(pack.id); await qa.getByText('审阅人工包 1 · 已封存', { exact: true }).waitFor(); assert.equal((await status()).calls, 20);
		await qa.getByText('人工配置固定问答包', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${root}/sidebar.png`, fullPage: false }); const narrowPanelVisible = await narrowPreview(page, panel, qa, pack.id); assert.deepEqual(errors, []);
		await writeFile(`${root}/browser-status.json`, JSON.stringify(state, null, 2)); await writeFile(`${root}/browser-result.json`, JSON.stringify({ status: 'passed', realRepositorySource: true, sourcePaths: [main, inputs], generationRequests: 1, evaluationRequests: 20, questionRequestCounts: state.policy.reviews.slice(1).map(row => row.sides.map(side => side.requests)), explicitSealingAndIndependentAuthorization: true, hiddenAnswers: true, budgetUnchangedUntilEdited: true, wholePack, wholePackEvaluations: state.policy.packEvaluations.length, unchangedBindings: bindings.length, unchangedChoices: 1, sealedParentAndRevisionDraft: true, reloadWithoutReplay: true, narrowPanelVisible, browserErrors: errors }, null, 2));
	}
} finally { await browser.close(); }
