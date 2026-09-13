// 固定 Paperlane 对照验收；只检查已保存响应，不调用模型，不修补生成内容。
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const directory = resolve(process.argv[2] ?? '.cache/live-guidance-evidence/real');
const harness = process.env.RSI_HARNESS ?? '/Users/black/Documents/VSCodeProject/deepseek-harness';
const { chromium } = await import(pathToFileURL(resolve(harness, 'apps/web/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const result = [];
try {
	for (const name of ['candidate-page', 'baseline-page']) {
		const raw = await readFile(resolve(directory, `${name}-response.txt`), 'utf8');
		const html = raw.trim().replace(/^```html\s*\n/i, '').replace(/\n```$/, '').trim();
		assert.match(html, /^<!doctype html>/i); assert.match(html, /<\/html>$/i);
		await writeFile(resolve(directory, `${name}.html`), html);
		const context = await browser.newContext({ javaScriptEnabled: true, reducedMotion: 'reduce' });
		const blocked = []; await context.route('**/*', route => { blocked.push(route.request().url()); return route.abort(); });
		const page = await context.newPage();
		await page.setContent(html);
		const structure = await page.evaluate(() => ({
			h1: document.querySelectorAll('h1').length === 1,
			product: /Paperlane/.test(document.body.innerText),
			fictional: /fictional|concept demo/i.test(document.body.innerText),
			faq: document.querySelectorAll('details').length >= 2,
			cta: !!document.querySelector('a[href="#start"]') && !!document.getElementById('start'),
			noScripts: document.querySelectorAll('script,iframe,object,embed').length === 0,
			headings: [...document.querySelectorAll('h2,h3')].map(e => e.textContent),
		}));
		const screens = [];
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
			await page.screenshot({ path: resolve(directory, `${name}-${width}.png`), fullPage: true });
			screens.push({ width, noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) });
		}
		let faqKeyboard = false; let ctaAnchor = false;
		if (structure.faq) {
			await page.locator('details summary').first().focus(); await page.keyboard.press('Space');
			faqKeyboard = await page.locator('details').first().evaluate(el => el.open);
		}
		if (structure.cta) { await page.locator('a[href="#start"]').first().click(); ctaAnchor = new URL(page.url()).hash === '#start'; }
		const passed = Object.entries(structure).filter(([key]) => key !== 'headings').every(([, value]) => value === true) && screens.every(s => s.noHorizontalOverflow) && faqKeyboard && ctaAnchor && blocked.length === 0;
		const extraControls = await page.evaluate(() => ({ forms: document.querySelectorAll('form').length, buttons: [...document.querySelectorAll('button')].map(b => ({ text: b.textContent, type: b.type, disabled: b.disabled })) }));
		let extraInteraction = { status: 'not_applicable', detail: '没有启用的额外表单提交按钮' };
		if (extraControls.forms && await page.locator('form input[type=email]').count()) {
			await page.locator('form input[type=email]').fill('reader@example.invalid');
			const before = await page.locator('body').innerText(); const beforeUrl = page.url(); const beforeRequests = blocked.length;
			await page.locator('form button[type=submit]').click();
			const changed = before !== await page.locator('body').innerText() || beforeUrl !== page.url() || blocked.length !== beforeRequests;
			extraInteraction = { status: changed ? 'needs_review' : 'failed', detail: changed ? '额外提交产生变化，需人工核对其语义' : '输入合法测试邮箱并点击启用的提交按钮后，没有可见反馈、导航或请求' };
		}
		result.push({ name, status: passed && extraInteraction.status === 'not_applicable' ? 'passed' : 'failed', requiredChecks: passed ? 'passed' : 'failed', extraInteraction, sha256: createHash('sha256').update(html).digest('hex'), structure, screens, faqKeyboard, ctaAnchor, extraControls, blockedRequests: blocked });
		await context.close();
	}
} finally { await browser.close(); }
await writeFile(resolve(directory, 'page-checks.json'), JSON.stringify(result, null, '\t') + '\n');
console.log(JSON.stringify(result));
assert.ok(result.every(r => r.status === 'passed'), 'See page-checks.json; generated files were not repaired');
