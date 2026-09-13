import { z } from 'zod';
import { transform } from 'esbuild';
import type { SkillScenario } from './index.ts';

const outputSchema = z.strictObject({ title: z.string().min(1).max(200), html: z.string().min(1).max(262144), css: z.string().max(131072), javascript: z.string().max(131072) });
export const frontendScenario: SkillScenario = {
	info: { id: 'frontend', version: '1', label: '网页单页', kind: 'html' },
	matchesSkill: s => /前端|网页|页面设计|frontend|front-end|web[- ]design|ui[- ]design/i.test(`${s.name} ${s.description}`),
	matchesRequest: text => /前端|页面|网页|落地页|landing page|frontend|front-end/i.test(text) && /写|开发|设计|实现|搭建|修改|美化|制作|优化|重构|build|implement|design|create|code|write|refactor/i.test(text),
	instructions: '按照完整 Skill、任务需求和偏好，生成可预览的自包含单页。仅返回 JSON：{"title":"页面标题","html":"body 内的 HTML 片段","css":"完整 CSS","javascript":"完整 JavaScript，可为空"}。所有脚本放 javascript，所有样式表放 css；html 不含 script/style 标签或 on* 事件属性。禁止外部依赖、import、网络请求和工具调用。使用原生 DOM；图片可用 data URL。仅交付产物，不输出自评分数。',
	async compile(output, signal) {
		signal.throwIfAborted();
		const page = outputSchema.parse(JSON.parse(output));
		if (/<\s*\/?\s*(?:script|style)\b|\bon[a-z]+\s*=/i.test(page.html)) throw new Error('HTML 内的脚本和样式表必须放入独立编译字段');
		const js = await transform(page.javascript, { loader: 'js', format: 'iife', target: 'es2022', logLevel: 'silent' });
		const css = await transform(page.css, { loader: 'css', logLevel: 'silent' });
		if (js.warnings.length || css.warnings.length) throw new Error([...js.warnings, ...css.warnings].map(w => w.text).join('\n'));
		signal.throwIfAborted();
		const title = page.title.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
		return { kind: 'html', detail: 'CSS / JavaScript 编译通过；HTML 由浏览器解析，未检查交互或审美。', content: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css.code.replace(/<\/style/gi, '<\\/style')}</style></head><body>${page.html}<script>${js.code.replace(/<\/script/gi, '<\\/script')}</script></body></html>` };
	},
};
