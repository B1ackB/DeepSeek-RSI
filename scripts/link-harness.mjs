import { readdir, readFile, mkdir, symlink, lstat, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await realpath(process.argv[2] ?? (() => { throw new Error('Usage: npm run link:harness -- /path/to/deepseek-harness'); })());
const expected = 'd347e703908d0406b7a7ef80e3a0e594d86b2215';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== expected) throw new Error('Harness commit differs from G0 baseline');
const dirs = (await readdir(join(root, 'vendor'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => join(root, 'vendor', d.name));
for (const group of await readdir(join(root, 'packages'), { withFileTypes: true })) {
	if (!group.isDirectory()) continue;
	for (const pkg of await readdir(join(root, 'packages', group.name), { withFileTypes: true })) {
		if (pkg.isDirectory()) dirs.push(join(root, 'packages', group.name, pkg.name));
	}
}
// ponytail: 固定底座的开发链接；可发布底座就绪后改为正式 peer dependencies。
let count = 0;
for (const dir of dirs) {
	let pkg;
	try { pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
	if (!pkg.name?.startsWith('@deepseek-ai/')) continue;
	const target = resolve('node_modules', pkg.name);
	await mkdir(resolve('node_modules/@deepseek-ai'), { recursive: true });
	try {
		await lstat(target);
		if (await realpath(target) !== await realpath(dir)) throw new Error(`Refusing to replace ${target}`);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		await symlink(dir, target, 'dir');
	}
	count++;
}
console.log(`Linked ${count} Harness packages at ${expected.slice(0, 10)}; host checkout unchanged.`);
