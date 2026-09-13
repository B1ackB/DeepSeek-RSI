import type { SkillScenario } from './index.ts';
export const textScenario: SkillScenario = {
	info: { id: 'text', version: '1', label: '通用文本', kind: 'text' },
	matchesSkill: () => true,
	matchesRequest: () => false,
	instructions: '按照所给完整 Skill、任务需求和偏好，直接返回文本产物。仅使用本次提供的资料；需要外部文件或工具但输入未提供时明确说明限制，不虚构执行结果。不要返回自评分数。',
	async compile(output, signal) {
		signal.throwIfAborted();
		if (!output.trim() || output.includes('\0') || Buffer.byteLength(output) > 524288) throw new Error('文本产物为空、含 NUL 或超出大小上限');
		return { kind: 'text', content: output, detail: '文本格式检查通过；文本没有编译步骤，内容由用户判断。' };
	},
};
