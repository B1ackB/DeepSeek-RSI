import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, linkSync, unlinkSync, chmodSync, readdirSync, statSync, existsSync } from 'node:fs';
import files from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { captureRepository, sealRepositorySnapshot, readRepositorySnapshot, repositoryManifest, repositoryPolicyConditions } from '../src/policy-snapshot.ts';
import { freezePolicyRun, policyDigest, policyRunSchema, policyConditionsSchema } from '../src/policy-contracts.ts';
import { policyTools } from '../src/policy.ts';
import { openStore } from '../src/store.ts';
import { verifyRepositorySnapshot } from '../scripts/policy-snapshot.ts';

function temporary() { const root = realpathSync(mkdtempSync(join(tmpdir(), 'rsi-snapshot-'))); const repo = join(root, 'repo'); mkdirSync(repo); mkdirSync(join(repo, '.git')); return { root, repo, objects: join(root, 'repository-snapshots') }; }
const policy = { schemaVersion: 1, kind: 'repository-evidence-policy', instructions: 'Read and cite frozen evidence.' };
const task = { schemaVersion: 1, question: 'Inspect selected evidence.', provider: 'rsi-policy-fixture', model: 'offline-v1', budget: { maxRequests: 3, maxOutputTokens: 512, maxInputBytes: 32768, tokenStopThreshold: 1000, maxToolCalls: 8, maxToolResultBytes: 4096, maxDurationMs: 5000 } };
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

test('real Git checkout captures exact dirty, untracked and explicitly selected ignored bytes without writing source or index', async () => {
	const { root, repo, objects } = temporary();
	try {
		const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8' });
		git('init', '-q'); writeFileSync(join(repo, 'main.ts'), 'export const total = 1;\n'); git('add', 'main.ts');
		git('-c', 'user.name=Offline fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
		writeFileSync(join(repo, 'main.ts'), '\ufeffexport const total = 2;\r\n'); writeFileSync(join(repo, 'notes.md'), '未提交内容\r\n');
		writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n'); writeFileSync(join(repo, 'ignored.txt'), 'selected ignored text'); writeFileSync(join(repo, 'other.ts'), 'not selected');
		const index = readFileSync(join(repo, '.git/index')); const status = git('status', '--porcelain=v1', '--untracked-files=all');
		const snapshot = await captureRepository(repo, ['notes.md', 'main.ts', 'ignored.txt']); const again = await captureRepository(repo, ['ignored.txt', 'notes.md', 'main.ts']);
		assert.deepEqual(snapshot, again); assert.deepEqual(snapshot.files.map(file => file.path), ['ignored.txt', 'main.ts', 'notes.md']);
		assert.equal(snapshot.files[1].content, '\ufeffexport const total = 2;\r\n'); assert.equal(git('show', 'HEAD:main.ts'), 'export const total = 1;\n');
		for (const entry of repositoryManifest(snapshot)) { const bytes = readFileSync(join(repo, entry.path)); assert.equal(entry.contentDigest, sha(bytes)); assert.equal(entry.bytes, bytes.length); }
		assert.deepEqual(readFileSync(join(repo, '.git/index')), index); assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), status);
		writeFileSync(join(repo, 'main.ts'), 'changed later');
		const sealed = sealRepositorySnapshot(objects, snapshot); snapshot.files[0].content = 'mutated caller object';
		const restored = readRepositorySnapshot(objects, sealed.digest); assert.equal(restored.files[1].content, '\ufeffexport const total = 2;\r\n'); assert.equal(restored.files[0].content, 'selected ignored text');
		assert.equal(statSync(join(objects, `${sealed.digest}.json`)).mode & 0o222, 0);
		assert.notEqual(policyDigest(await captureRepository(repo, ['ignored.txt', 'main.ts', 'notes.md'])), sealed.digest);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('sensitive paths fail the complete selection before opening any selected file; common secret content never leaves capture', async t => {
	const { root, repo } = temporary();
	try {
		writeFileSync(join(repo, 'safe.ts'), 'export const value = 1;'); let opens = 0; const original = files.open;
		const spy = t.mock.method(files, 'open', (...args: Parameters<typeof files.open>) => { opens++; return original(...args); }); syncBuiltinESMExports();
		for (const path of ['.git/config', '.gitconfig', '.env', '.ENV.local', 'src/.env.example', '.ssh/config', '.aws/config', '.azure/accessTokens.json', '.config/service/settings.json', '.codex/config.toml', '.agents/notes.md', '.dsh/home.json', '.rsi/store.json', 'node_modules/package/index.js', '.cache/data.txt', 'credentials.json', 'secrets.yaml', 'config/access-token.txt', 'id_ed25519', 'private.pem', 'private.key', 'auth.json', '.npmrc', '.netrc', 'state.sqlite-wal', 'debug.log']) await assert.rejects(captureRepository(repo, ['safe.ts', path]));
		assert.equal(opens, 0); spy.mock.restore(); syncBuiltinESMExports();
		for (const content of ['-----BEGIN RSA PRIVATE KEY-----\ndata', 'const apiKey = "example-sensitive";', '{"access_token": "private value"}', 'password = \'short\'', 'API_KEY=unquoted-value', 'https://user:private@example.invalid', 'sk-' + 'a'.repeat(32), 'ghp_' + 'a'.repeat(36), 'AKIA' + 'A'.repeat(16)]) {
			writeFileSync(join(repo, 'safe.ts'), content); await assert.rejects(captureRepository(repo, ['safe.ts']), error => error instanceof Error && error.message.includes('sensitive') && !error.message.includes(content));
		}
		writeFileSync(join(repo, 'safe.ts'), 'export const key = process.env.API_KEY;'); assert.equal((await captureRepository(repo, ['safe.ts'])).files.length, 1);
	} finally { t.mock.restoreAll(); syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); }
});

test('scope rejects traversal, directories, aliases, links, special files, invalid text and bounded-size overflow', async () => {
	const { root, repo } = temporary();
	try {
		writeFileSync(join(repo, 'a.ts'), 'text'); mkdirSync(join(repo, 'nested')); symlinkSync(join(repo, 'a.ts'), join(repo, 'alias.ts')); symlinkSync(join(repo, 'nested'), join(repo, 'alias-dir'));
		writeFileSync(join(repo, 'nested/a.ts'), 'nested'); writeFileSync(join(root, 'outside.ts'), 'outside'); linkSync(join(root, 'outside.ts'), join(repo, 'hard.ts'));
		execFileSync('mkfifo', [join(repo, 'pipe')]); writeFileSync(join(repo, 'bad.txt'), Buffer.from([0xff])); writeFileSync(join(repo, 'nul.txt'), 'a\0b'); writeFileSync(join(repo, 'large.txt'), 'x'.repeat(262145));
		for (const paths of [[], ['a.ts', 'a.ts'], ['../outside.ts'], ['/etc/passwd'], ['nested/../a.ts'], ['a\\b'], ['a:stream'], ['*.ts'], ['a\n.ts'], ['nested'], ['alias.ts'], ['alias-dir/a.ts'], ['hard.ts'], ['pipe'], ['bad.txt'], ['nul.txt'], ['large.txt'], ['missing'], Array.from({ length: 33 }, (_, index) => `${index}.ts`)]) await assert.rejects(captureRepository(repo, paths));
		for (let index = 0; index < 5; index++) writeFileSync(join(repo, `${index}.txt`), 'x'.repeat(262144));
		await assert.rejects(captureRepository(repo, ['0.txt', '1.txt', '2.txt', '3.txt', '4.txt']), /1 MiB/);
		symlinkSync(repo, join(root, 'repo-alias'));
		for (const alias of ['repo-alias', 'repo-alias/', 'repo-alias/.']) await assert.rejects(captureRepository(`${root}/${alias}`, ['a.ts']));
		await assert.rejects(captureRepository('relative', ['a.ts']));
		rmSync(join(repo, '.git'), { recursive: true }); symlinkSync(join(root, 'outside.ts'), join(repo, '.git')); await assert.rejects(captureRepository(repo, ['a.ts']));
		unlinkSync(join(repo, '.git')); writeFileSync(join(repo, '.git'), 'gitdir: /not-read-or-followed'); assert.equal((await captureRepository(repo, ['a.ts'])).files.length, 1);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('abort closes acquired descriptors and a mid-capture edit fails without a partial object; a fresh capture recovers', async t => {
	const { root, repo, objects } = temporary();
	try {
		writeFileSync(join(repo, 'a.ts'), 'original'); writeFileSync(join(repo, 'b.ts'), 'second');
		const original = files.open; let edited = false;
		const change = t.mock.method(files, 'open', async (...args: Parameters<typeof files.open>) => {
			if (args[0] === join(repo, 'b.ts') && !edited) { edited = true; writeFileSync(join(repo, 'a.ts'), 'changed'); }
			return original(...args);
		});
		syncBuiltinESMExports();
		await assert.rejects(captureRepository(repo, ['a.ts', 'b.ts']), /changed/); assert.equal(existsSync(objects), false); change.mock.restore(); syncBuiltinESMExports();
		const abort = new AbortController(); let handle: Awaited<ReturnType<typeof files.open>> | undefined;
		const cancel = t.mock.method(files, 'open', async (...args: Parameters<typeof files.open>) => {
			const acquired = await original(...args); handle = acquired; const read = acquired.read.bind(acquired);
			t.mock.method(acquired, 'read', async (...readArgs: Parameters<typeof acquired.read>) => { const result = await read(...readArgs); abort.abort(new Error('Controlled cancellation')); return result; }); return acquired;
		});
		syncBuiltinESMExports();
		await assert.rejects(captureRepository(repo, ['a.ts'], abort.signal), /Controlled cancellation/); assert.equal(handle!.fd, -1); cancel.mock.restore(); syncBuiltinESMExports();
		await assert.rejects(captureRepository(repo, ['a.ts'], AbortSignal.abort()), /aborted/);
		const mutateRead = t.mock.method(files, 'open', async (...args: Parameters<typeof files.open>) => {
			const acquired = await original(...args); handle = acquired; const read = acquired.read.bind(acquired); let changed = false;
			t.mock.method(acquired, 'read', async (...readArgs: Parameters<typeof acquired.read>) => { const result = await read(...readArgs); if (!changed) { changed = true; writeFileSync(join(repo, 'a.ts'), 'CHANGED'); } return result; }); return acquired;
		});
		syncBuiltinESMExports(); await assert.rejects(captureRepository(repo, ['a.ts']), /changed/); assert.equal(handle!.fd, -1); mutateRead.mock.restore(); syncBuiltinESMExports();
		const sealed = sealRepositorySnapshot(objects, await captureRepository(repo, ['a.ts', 'b.ts'])); assert.equal(readRepositorySnapshot(objects, sealed.digest).files[0].content, 'CHANGED'); assert.equal(readdirSync(objects).length, 1);
	} finally { t.mock.restoreAll(); syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); }
});

test('sealed snapshot verification and publication reject corruption without replacing targets, including expanded JSON', async () => {
	const { root, repo, objects } = temporary();
	try {
		writeFileSync(join(repo, 'a.ts'), 'export const value = 1;'); const captured = await captureRepository(repo, ['a.ts']); const sealed = sealRepositorySnapshot(objects, captured); const path = join(objects, `${sealed.digest}.json`); const bytes = readFileSync(path);
		assert.deepEqual(sealRepositorySnapshot(objects, captured), sealed); assert.deepEqual(readFileSync(path), bytes);
		chmodSync(path, 0o644); assert.throws(() => readRepositorySnapshot(objects, sealed.digest), /read-only/);
		writeFileSync(path, '{}'); chmodSync(path, 0o444); assert.throws(() => sealRepositorySnapshot(objects, captured)); assert.equal(readFileSync(path, 'utf8'), '{}'); assert.equal(readdirSync(objects).some(name => name.startsWith('.seal-')), false);
		unlinkSync(path); writeFileSync(path, JSON.stringify(captured, null, 2), { mode: 0o444 }); assert.throws(() => readRepositorySnapshot(objects, sealed.digest), /canonical|digest/);
		unlinkSync(path); symlinkSync(join(repo, 'a.ts'), path); assert.throws(() => readRepositorySnapshot(objects, sealed.digest));
		symlinkSync(objects, join(root, 'alias')); assert.throws(() => sealRepositorySnapshot(join(root, 'alias'), captured), /symlink/);
		assert.throws(() => sealRepositorySnapshot(objects, { ...captured, files: [{ path: '.env', content: 'do not seal' }] }));
		const escaped = { ...captured, files: Array.from({ length: 4 }, (_, index) => ({ path: `${index}.txt`, content: '\x01'.repeat(262144) })) }; const large = sealRepositorySnapshot(objects, escaped);
		assert.ok(statSync(join(objects, `${large.digest}.json`)).size > 6 * 1048576); assert.deepEqual(readRepositorySnapshot(objects, large.digest), escaped);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('abrupt publication loss leaves no authority: retry verifies complete objects and never sweeps unknown staging files', () => {
	const { root, repo } = temporary();
	try {
		const snapshot = { schemaVersion: 1, kind: 'repository-worktree', root: repo, files: [{ path: 'a.ts', content: 'frozen bytes' }] };
		for (const after of [false, true]) {
			const objects = join(root, `objects-${after}`); const input = join(root, 'input.json'); writeFileSync(input, JSON.stringify(snapshot));
			const script = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const original=fs.linkSync; fs.linkSync=(...args)=>{if(${after}) original(...args);process.exit(77)}; syncBuiltinESMExports(); const {sealRepositorySnapshot}=await import(${JSON.stringify(new URL('../src/policy-snapshot.ts', import.meta.url).href)}); sealRepositorySnapshot(process.argv[1],JSON.parse(fs.readFileSync(process.argv[2],'utf8')));`;
			const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, objects, input], { encoding: 'utf8' }); assert.equal(child.status, 77, child.stderr);
			const stage = readdirSync(objects).find(name => name.startsWith('.seal-'))!; assert.ok(stage); const old = readFileSync(join(objects, stage));
			assert.equal(existsSync(join(objects, `${policyDigest(snapshot)}.json`)), after);
			const sealed = sealRepositorySnapshot(objects, snapshot); assert.deepEqual(readRepositorySnapshot(objects, sealed.digest), snapshot); assert.deepEqual(readFileSync(join(objects, stage)), old); assert.equal(readdirSync(objects).length, 2);
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('snapshot conditions bind exact provenance and bytes; historical digests and persisted v7 JSON remain unchanged', async () => {
	const { root, repo, objects } = temporary(); const file = join(root, 'state.sqlite');
	try {
		const historical = JSON.parse(readFileSync(new URL('../docs/evidence/policy-gate/complete.json', import.meta.url), 'utf8')).run;
		assert.deepEqual(policyRunSchema.parse(historical), historical); assert.equal(policyDigest(policyConditionsSchema.parse(historical.conditions)), historical.conditionsDigest);
		writeFileSync(join(repo, 'a.ts'), 'captured'); const sealed = sealRepositorySnapshot(objects, await captureRepository(repo, ['a.ts']));
		const conditions = repositoryPolicyConditions(objects, sealed.digest, task); const run = freezePolicyRun(policy, conditions);
		for (const changed of [
			{ ...conditions, sourceSnapshot: { ...conditions.sourceSnapshot!, root: '/other/repository' } },
			{ ...conditions, sourceSnapshot: { ...conditions.sourceSnapshot!, digest: 'a'.repeat(64) } },
			{ ...conditions, files: [{ path: 'a.ts', content: 'replaced' }] },
		]) assert.equal(policyConditionsSchema.safeParse(changed).success, false);
		let store = openStore(file); const policyId = randomUUID(); store.sealPolicyVersion(policyId, historical.policy); store.sealPolicyVersion(policyId, policy, historical.policyDigest);
		for (const entry of [historical, run]) {
			const batch = store.authorizePolicyBatch({ id: randomUUID(), policyId, runtimeDigest: 'b'.repeat(64), runs: [{ side: 'candidate', run: entry }], budget: { maxRequests: 3, tokenStopThreshold: 1000, maxDurationMs: 5000 } });
			store.startPolicyRun(batch.authorization.id, entry.runId); store.finishPolicyRun(batch.authorization.id, entry.runId, 'failed');
		}
		store.close(); const raw = () => { const db = new DatabaseSync(file, { readOnly: true }); try { return { version: db.prepare('PRAGMA user_version').get(), rows: db.prepare('SELECT data FROM policy_batches ORDER BY rowid').all() }; } finally { db.close(); } };
		const before = raw(); store = openStore(file); store.close(); assert.deepEqual(raw(), before); assert.equal(before.version!.user_version, 7);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('full native fixed task reads captured source after the worktree is gone, keeps scope/accounting and releases resources', { timeout: 10000 }, async () => {
	const { root, repo, objects } = temporary();
	try {
		writeFileSync(join(repo, 'implementation.ts'), 'export const 未提交 = value => value + 7;\n'); writeFileSync(join(repo, '.env'), 'PRIVATE_SENTINEL');
		const sealed = sealRepositorySnapshot(objects, await captureRepository(repo, ['implementation.ts'])); rmSync(repo, { recursive: true });
		const run = freezePolicyRun(policy, repositoryPolicyConditions(objects, sealed.digest, task)); const tools = policyTools(run);
		await assert.rejects(tools.find(tool => tool.name === 'rsi_read')!.execute({ path: '.env' }, {} as never), /outside/);
		const result = await verifyRepositorySnapshot(objects, sealed.digest); assert.equal(result.error, null); assert.equal(result.result?.events.findLast(event => event.type === 'turn/end')?.data.reason.kind, 'completed');
		assert.deepEqual(result.result?.events.filter(event => event.type === 'tool/call').map(event => event.data.name), ['rsi_search', 'rsi_read']); assert.equal(result.result?.events.filter(event => event.type === 'tool/result').length, 2);
		assert.ok(JSON.stringify(result.dispatch.at(-1)!.messages).includes('value + 7')); assert.equal(JSON.stringify(result.dispatch).includes('PRIVATE_SENTINEL'), false);
		assert.equal(result.attempts.length, 3); assert.ok(result.attempts.every(row => row.state === 'succeeded' && row.usageState === 'confirmed' && row.owner === 'rsi' && row.ownerId === result.worker!.batchId)); assert.equal(result.attempts.reduce((sum, row) => sum + row.tokens.total!, 0), 45);
		assert.deepEqual(result.run.conditions.sourceSnapshot, { root: repo, digest: sealed.digest }); assert.equal(result.worker!.credentialsAbsent, true); assert.equal(result.disposed!.agents, 0); assert.equal(result.disposed!.forbiddenExecutions, 0);
		assert.equal(result.cleanup.processExited, true); assert.equal(result.cleanup.directoryRemoved, true); assert.equal(existsSync(result.cleanup.temporaryRoot), false); assert.throws(() => process.kill(result.worker!.pid, 0), { code: 'ESRCH' });
	} finally { rmSync(root, { recursive: true, force: true }); }
});
