import type {} from '@deepseek-ai/cordis';
import { frontendScenario } from './frontend.ts';
import { textScenario } from './text.ts';

import { scenarioInfoSchema, type ScenarioInfo, type Artifact } from './contracts.ts';
export type { ScenarioInfo, Artifact } from './contracts.ts';
/** 可信开发者扩展；模型输出不能提供回调、命令或注册新场景。 */
export interface SkillScenario {
	info: ScenarioInfo;
	matchesSkill(skill: { name: string; description: string }): boolean;
	matchesRequest(text: string): boolean;
	instructions: string;
	compile(output: string, signal: AbortSignal): Promise<Artifact>;
}
export function createScenarioRegistry() {
	const entries = new Map<string, SkillScenario>();
	function register(scenario: SkillScenario) {
		const info = scenarioInfoSchema.parse(scenario.info);
		if (entries.has(info.id)) throw new Error(`Scenario already registered: ${info.id}`);
		if (!scenario.instructions.trim() || scenario.instructions.length > 16000) throw new Error('Invalid scenario instructions');
		const entry = Object.freeze({ ...scenario, info: Object.freeze(info) });
		entries.set(info.id, entry);
		return () => { if (entries.get(info.id) === entry) entries.delete(info.id); };
	}
	register(frontendScenario); register(textScenario);
	return {
		register,
		get(id: string, version?: string) { const s = entries.get(id); if (!s || (version && s.info.version !== version)) throw new Error(`Scenario unavailable or changed: ${id}`); return s; },
		forSkill(skill: { name: string; description: string }) { return [...entries.values()].reverse().filter(s => s.info.id !== 'text').find(s => s.matchesSkill(skill)) ?? entries.get('text')!; },
		forRequest(text: string) { return [...entries.values()].reverse().filter(s => s.info.id !== 'text').find(s => s.matchesRequest(text)); },
	};
}
declare module '@deepseek-ai/cordis' { interface Context { rsiScenarios: ReturnType<typeof createScenarioRegistry>; } }
