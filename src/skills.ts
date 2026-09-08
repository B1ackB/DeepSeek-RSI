import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, readdir, lstat, mkdir, mkdtemp, writeFile, chmod, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { SkillDefinition } from '@deepseek-ai/dsh-skill';
import { skillSnapshotSchema, fault, type SkillSnapshot } from './contracts.ts';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function readBounded(root: string, path: string) {
	const absolute = join(root, path);
	if (await realpath(absolute) !== absolute) throw fault('invalid_skill', 'Skill 路径含符号链接');
	const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const before = await file.stat();
		if (!before.isFile() || before.size > 262144) throw fault('invalid_skill', 'Skill 文件超过 256 KiB 或不是普通文件');
		const buffer = Buffer.alloc(262145);
		let length = 0;
		while (length < buffer.length) {
			const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
			if (bytesRead === 0) break;
			length += bytesRead;
		}
		const after = await file.stat();
		const visible = await lstat(absolute);
		if (length > 262144 || length !== after.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== visible.ino || before.dev !== visible.dev || await realpath(absolute) !== absolute) throw fault('skill_changed', '读取期间 Skill 文件或路径发生变化');
		return { bytes: buffer.subarray(0, length), executable: (before.mode & 0o111) !== 0 };
	} finally { await file.close(); }
}
export async function describeSkill(source: string, skillId: string, workspace: string): Promise<SkillSnapshot> {
	const root = await realpath(source);
	if ((await lstat(source)).isSymbolicLink()) throw fault('invalid_skill', 'Skill root cannot be a symbolic link');
	const files: SkillSnapshot['files'] = [];
	let total = 0;
	let directories = 0;
	async function walk(relative: string) {
		if (++directories > 64 || relative.split('/').length > 16) throw fault('invalid_skill', 'Skill 目录数量或深度超过当前上限');
		if (await realpath(join(root, relative)) !== join(root, relative)) throw fault('invalid_skill', 'Skill 目录含符号链接');
		for (const name of await readdir(join(root, relative))) {
			if (name.includes('\\') || name === '.' || name === '..') throw fault('invalid_skill', 'Invalid Skill path');
			const path = relative ? `${relative}/${name}` : name;
			const absolute = join(root, path);
			const stat = await lstat(absolute);
			if (stat.isDirectory()) { await walk(path); continue; }
			if (!stat.isFile() || stat.isSymbolicLink()) throw fault('invalid_skill', 'Only ordinary Skill files are supported');
			if (files.length >= 32) throw fault('invalid_skill', 'Skill 超过当前 32 文件上限');
			const { bytes, executable } = await readBounded(root, path);
			if ((total += bytes.length) > 1048576) throw fault('invalid_skill', 'Skill 超过当前 1 MiB 总大小上限');
			files.push({ path, contentDigest: digest(bytes), executable });
		}
	}
	await walk('');
	if (!files.some(f => f.path === 'SKILL.md')) throw fault('invalid_skill', 'SKILL.md is required');
	files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
	return skillSnapshotSchema.parse({ schemaVersion: 1, skillId, workspaceRoot: await realpath(workspace), sourceRoot: root, files, versionDigest: digest(JSON.stringify(files.map(f => [f.path, f.contentDigest, f.executable]))) });
}

export async function sealFixture(source: string, objects: string, skillId: string, workspace: string) {
	const snapshot = await describeSkill(source, skillId, workspace);
	await mkdir(objects, { recursive: true, mode: 0o700 });
	const staged = await mkdtemp(join(objects, '.seal-'));
	const target = join(objects, snapshot.versionDigest);
	try {
		for (const entry of snapshot.files) {
			const { bytes, executable } = await readBounded(snapshot.sourceRoot, entry.path);
			if (digest(bytes) !== entry.contentDigest || executable !== entry.executable) throw fault('skill_changed', 'Skill changed while sealing');
			await mkdir(join(staged, entry.path, '..'), { recursive: true });
			await writeFile(join(staged, entry.path), bytes, { mode: entry.executable ? 0o555 : 0o444 });
		}
		if ((await describeSkill(snapshot.sourceRoot, skillId, workspace)).versionDigest !== snapshot.versionDigest) throw fault('skill_changed', '封存期间来源文件清单发生变化');
		try { await rename(staged, target); } catch (error) {
			// macOS 对替换已封存的只读目录返回 EACCES；仍须逐字节核对目标。
			if (!['EEXIST', 'ENOTEMPTY', 'EACCES'].includes(String((error as NodeJS.ErrnoException).code))) throw error;
			const existing = await describeSkill(target, skillId, workspace);
			if (existing.versionDigest !== snapshot.versionDigest) throw fault('skill_changed', 'Existing sealed object is corrupt');
		}
		async function freezeDirectories(dir: string) {
			for (const entry of await readdir(dir, { withFileTypes: true })) if (entry.isDirectory()) await freezeDirectories(join(dir, entry.name));
			await chmod(dir, 0o555);
		}
		await freezeDirectories(target);
		return { snapshot, root: target };
	} finally { await rm(staged, { recursive: true, force: true }); }
}

export function installFixtureProvider(ctx: Context, snapshot: SkillSnapshot, root: string) {
	ctx.skills.registerProvider(() => ({
		name: 'rsi-g0',
		async list() { return [{ name: 'g0-probe', description: 'RSI version binding probe', invocation: { modelInvocable: true, userInvocable: true }, source: 'rsi', provider: 'rsi-g0', rank: 0, locator: snapshot.versionDigest, resourceBase: { kind: 'directory' as const, path: root } }]; },
		async get(candidate): Promise<SkillDefinition> {
			const current = await describeSkill(root, snapshot.skillId, snapshot.workspaceRoot);
			if (current.versionDigest !== snapshot.versionDigest) throw fault('skill_changed', 'Bound Skill version failed integrity check');
			const file = await open(join(root, 'SKILL.md'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			try { return { ...candidate, content: await file.readFile('utf8') }; } finally { await file.close(); }
		},
	}));
}
