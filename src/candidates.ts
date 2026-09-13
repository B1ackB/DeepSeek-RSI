import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fault, type SkillSnapshot } from './contracts.ts';
import { describeSkill, sealFixture } from './skills.ts';
import { runDocker } from './docker.ts';
import { candidateResponseSchema, flowChecks, type FlowTask } from './mainflow-contracts.ts';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function verify(root: string, snapshot: SkillSnapshot) {
	if ((await describeSkill(root, snapshot.skillId, snapshot.workspaceRoot)).versionDigest !== snapshot.versionDigest) throw fault('version_corrupt', '封存版本损坏或资源缺失');
}
export async function checkCandidate(task: FlowTask, raw: unknown, objects: string, signal: AbortSignal) {
	const result = candidateResponseSchema.parse(raw);
	if (result.kind !== 'candidate') throw fault('candidate_missing', '响应没有候选文件');
	await verify(task.baselineRoot, task.baseline);
	if (task.files.length !== task.baseline.files.length || task.files.some(f => hash(f.content) !== task.baseline.files.find(b => b.path === f.path)?.contentDigest)) throw fault('baseline_corrupt', '完整文件与冻结清单不一致');
	const allowed = new Set(task.paths);
	if (new Set(result.changes.map(f => f.path)).size !== result.changes.length || result.changes.some(f => !allowed.has(f.path) || !task.files.some(b => b.path === f.path))) throw fault('candidate_scope', '候选包含未授权或重复路径');
	const skillText = result.changes.find(f => f.path === 'SKILL.md')?.content ?? task.files.find(f => f.path === 'SKILL.md')!.content;
	const original = task.files.find(f => f.path === 'SKILL.md')!.content;
	const metadata = original.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];
	if (!skillText.trim() || (metadata && !skillText.startsWith(metadata))) throw fault('candidate_invalid', '候选 SKILL.md 为空或改变了固定元数据');
	if (result.changes.some(f => !f.content.trim() || f.content.includes('\0'))) throw fault('candidate_invalid', '候选包含空文件或 NUL');
	await mkdir(objects, { recursive: true });
	const staged = await mkdtemp(join(objects, '.candidate-'));
	try {
		for (const file of task.files) {
			const content = result.changes.find(f => f.path === file.path)?.content ?? file.content;
			await mkdir(join(staged, file.path, '..'), { recursive: true });
			await writeFile(join(staged, file.path), content, { mode: task.baseline.files.find(f => f.path === file.path)!.executable ? 0o755 : 0o644 });
		}
		signal.throwIfAborted();
		const snapshot = await describeSkill(staged, task.skillId, task.baseline.workspaceRoot);
		if (snapshot.versionDigest === task.baseline.versionDigest) throw fault('candidate_unchanged', '响应未实际改变 Skill，不生成新版');
		const scripts = snapshot.files.filter(f => /\.(py|sh)$/.test(f.path));
		const checks: FlowTask['checks'] = flowChecks.slice(0, 2).map(name => ({ name, status: 'passed', detail: '宿主根据完整基线与授权清单检查' }));
		if (scripts.length) {
			// 固定检查器不 import/运行候选 Python；Shell 只做 -n，禁用候选自报检查。
			const checker = 'import ast,pathlib,subprocess,json\nfor name in json.loads(__import__("sys").argv[1]):\n p=pathlib.Path(name)\n if p.suffix==".py": ast.parse(p.read_text(),filename=name)\n else: subprocess.run(["/bin/sh","-n",name],check=True)\nprint("syntax checks passed")';
			const checked = await runDocker(staged, ['python', '-c', checker, JSON.stringify(scripts.map(f => f.path))], signal);
			if (checked.interrupted || checked.exitCode !== 0) throw fault('script_check_failed', `Docker 语法检查失败：${checked.stdout.slice(0, 2000)}`);
			checks.push({ name: flowChecks[2], status: 'passed', detail: `${scripts.length} 个脚本；容器 ${checked.id} 已清理` });
		} else checks.push({ name: flowChecks[2], status: 'not_applicable', detail: '此 Skill 没有 Python/Shell 文件；未执行候选内容' });
		signal.throwIfAborted();
		const sealed = await sealFixture(staged, objects, task.skillId, task.baseline.workspaceRoot);
		checks.push({ name: flowChecks[3], status: 'passed', detail: sealed.snapshot.versionDigest });
		checks.push({ name: '产物对照', status: 'not_applicable', detail: '可生成新旧产物对照；是否采用由用户选择' });
		return { candidate: { snapshot: sealed.snapshot, root: sealed.root, changes: result.changes, reason: result.reason }, checks };
	} finally { await rm(staged, { recursive: true, force: true }); }
}
