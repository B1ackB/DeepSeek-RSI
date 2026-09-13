import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, readdir, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { sealFixture } from '../src/skills.ts';
import { checkCandidate } from '../src/mainflow.ts';
import { flowBudget, flowTaskSchema } from '../src/mainflow-contracts.ts';

// 手动容器验收入口，不在 npm test 中启动运行时或消费模型额度。
const dir = await mkdtemp(join(tmpdir(), 'rsi-candidate-docker-'));
async function unlock(root: string) {
	await chmod(root, 0o700);
	for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isDirectory()) await unlock(join(root, entry.name));
}
try {
	const source = join(dir, 'source'); await cp(resolve('fixtures/v1'), source, { recursive: true });
	const id = randomUUID(), objects = join(dir, 'objects');
	const baseline = await sealFixture(source, objects, id, dir);
	const files = await Promise.all(baseline.snapshot.files.map(async f => ({ path: f.path, content: await readFile(join(source, f.path), 'utf8') })));
	const task = flowTaskSchema.parse({ id: randomUUID(), sessionId: 'docker-check', turn: 1, workspaceId: 'docker-check', skillId: id, name: 'g0-probe', baseline: baseline.snapshot, baselineRoot: baseline.root, files, brief: '固定容器语法验收', inherited: [], previewDigest: 'a'.repeat(64), status: 'checking', preference: '只验证语法，不执行脚本', scope: 'task', paths: files.map(f => f.path), budget: flowBudget, authorization: { operationId: randomUUID(), digest: 'b'.repeat(64), confirmedAt: Date.now() }, system: '', input: '', deadline: Date.now() + 60000, clarifications: [], candidate: null, checks: [], error: null, chosenDigest: null, approvedDigest: null, executionSessionId: null, createdAt: Date.now() });
	const candidate = (path: string, content: string) => ({ kind: 'candidate', reason: '人工固定样例，不是模型生成', changes: [{ path, content }] });
	const valid = await checkCandidate(task, candidate('probe.py', 'raise RuntimeError("MUST_NOT_EXECUTE")\n'), objects, new AbortController().signal);
	assert.ok(valid.checks.some(c => c.name.includes('Python AST') && c.status === 'passed'));
	await assert.rejects(checkCandidate(task, candidate('probe.py', 'def broken(:\n'), objects, new AbortController().signal), /SyntaxError/);
	await assert.rejects(checkCandidate(task, candidate('probe.sh', "#!/bin/sh\necho 'unclosed\n"), objects, new AbortController().signal), /syntax error/i);
	assert.equal((await readdir(objects)).some(name => name.startsWith('.candidate-')), false);
	for (const file of files) assert.equal(await readFile(join(source, file.path), 'utf8'), file.content);
	const result = { status: 'passed', checks: ['valid Python/Shell syntax through real Docker', 'valid Python body not executed', 'invalid Python rejected', 'invalid Shell rejected', 'candidate staging cleaned', 'original files unchanged'], evidence: valid.checks };
	if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, '\t') + '\n');
	console.log(JSON.stringify(result));
} finally { await unlock(dir); await rm(dir, { recursive: true, force: true }); }
