import { z } from 'zod';
import { integer } from './contracts.ts';

export const dimensions = ['palette', 'density', 'typography', 'shape', 'imagery', 'motion'] as const;
export const dimensionSchema = z.enum(dimensions);
export const questions = {
	palette: { label: '配色', prompt: '页面的明暗和主色有什么偏好？', example: '浅色背景，蓝色作为强调色' },
	density: { label: '信息密度', prompt: '希望内容紧凑，还是留白多一些？', example: '留白多，首屏只突出一个重点' },
	typography: { label: '文字排版', prompt: '标题和正文希望呈现什么感觉？', example: '标题醒目，正文清晰克制' },
	shape: { label: '组件形状', prompt: '边框、圆角和卡片有什么偏好？', example: '少用圆角卡片，以分隔线组织内容' },
	imagery: { label: '图片使用', prompt: '希望图片主导，还是以文字和排版为主？', example: '以排版为主，避免装饰性大图' },
	motion: { label: '动效强度', prompt: '希望使用什么程度的动效？', example: '只保留必要反馈，减少移动动画' },
};
const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const preferenceText = z.string().trim().min(1).max(500);
export const preferenceSchema = z.strictObject({
	id, revision: integer.min(1), scope: z.enum(['project', 'personal']), workspaceId: z.string().min(1).nullable(), dimension: dimensionSchema, value: preferenceText, enabled: z.boolean(),
}).refine(p => (p.scope === 'personal') === (p.workspaceId === null), '偏好作用域与项目不一致');
export const answerSchema = z.strictObject({
	dimension: dimensionSchema, kind: z.enum(['value', 'no_preference', 'skip']), value: preferenceText.nullable(), scope: z.enum(['task', 'project', 'personal']),
}).refine(a => a.kind === 'value' ? a.value !== null : a.value === null && a.scope === 'task', '跳过或无偏好不能写入持久偏好');
export const resolvedPreferenceSchema = z.strictObject({
	dimension: dimensionSchema, kind: z.enum(['value', 'no_preference', 'skip', 'unspecified']), value: preferenceText.nullable(), source: z.enum(['task', 'project', 'personal', 'default']), preferenceId: id.nullable(), preferenceRevision: integer.min(1).nullable(),
}).refine(p => (p.kind === 'value') === (p.value !== null) && (['project', 'personal'].includes(p.source) ? p.kind === 'value' && p.preferenceId !== null && p.preferenceRevision !== null : p.preferenceId === null && p.preferenceRevision === null), '偏好值或来源记录不一致');
export const frozenDesignSchema = z.strictObject({
	brief: z.string().trim().min(1).max(4000), versionDigest: digest, preferences: z.array(resolvedPreferenceSchema).length(6),
}).refine(p => p.preferences.every((v, i) => v.dimension === dimensions[i]), '冻结偏好必须按固定顺序且不重复');
export const designTaskSchema = z.strictObject({
	id, revision: integer.min(1), skillId: id, workspaceId: z.string().min(1), versionDigest: digest, brief: z.string().trim().min(1).max(4000), status: z.enum(['collecting', 'ready', 'closed']), createdAt: integer,
	batches: z.array(z.strictObject({ dimensions: z.array(dimensionSchema).min(1).max(3), answered: z.boolean() })).max(2), answers: z.array(answerSchema).max(6), frozen: frozenDesignSchema.nullable(), frozenDigest: digest.nullable(),
}).refine(t => new Set(t.answers.map(a => a.dimension)).size === t.answers.length && new Set(t.batches.flatMap(b => b.dimensions)).size === t.batches.flatMap(b => b.dimensions).length && t.batches.filter(b => !b.answered).length <= 1, '答案和问题维度不能重复')
	.refine(t => (t.frozen === null) === (t.frozenDigest === null) && (t.status !== 'ready' || t.frozen !== null) && (t.status !== 'collecting' || t.frozen === null) && (!t.frozen || (t.frozen.versionDigest === t.versionDigest && t.frozen.brief === t.brief)), '冻结快照与状态不一致');
export const frontendStateSchema = z.strictObject({ preferences: z.array(preferenceSchema).max(768), tasks: z.array(designTaskSchema).max(256) })
	.refine(s => new Set(s.preferences.map(p => `${p.scope}:${p.workspaceId}:${p.dimension}`)).size === s.preferences.length && new Set(s.preferences.map(p => p.id)).size === s.preferences.length, '偏好键不能重复')
	.refine(s => new Set(s.tasks.map(t => t.id)).size === s.tasks.length && new Set(s.tasks.filter(t => t.status !== 'closed').map(t => t.skillId)).size === s.tasks.filter(t => t.status !== 'closed').length, '设计准备不能重复');
export type FrontendState = z.infer<typeof frontendStateSchema>;
export type DesignTask = z.infer<typeof designTaskSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Preference = z.infer<typeof preferenceSchema>;
export type FrozenDesign = z.infer<typeof frozenDesignSchema>;
