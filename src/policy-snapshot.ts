import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fault } from './contracts.ts';
import { repositorySelectionSchema, policyConditionsSchema, repositoryContentDenied, repositorySnapshotSchema, type RepositorySnapshot } from './policy-contracts.ts';
import { readSealedJson, sealJson } from './policy-versions.ts';

const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
async function ancestry(root: string, path: string) {
	const parts = path.split('/');
	for (let index = 0; index < parts.length; index++) {
		const absolute = join(root, ...parts.slice(0, index));
		if (!(await lstat(absolute)).isDirectory() || await realpath(absolute) !== absolute) throw fault('repository_path_denied', 'Repository ancestry changed or contains a symlink');
	}
}
async function readSource(root: string, path: string, signal?: AbortSignal) {
	signal?.throwIfAborted();
	await ancestry(root, path);
	const absolute = join(root, path);
	const selected = await lstat(absolute, { bigint: true });
	if (!selected.isFile() || selected.nlink !== 1n || selected.size > 262144n) throw fault('repository_file_denied', `Expected a single-link regular file within 256 KiB: ${path}`);
	const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const before = await file.stat({ bigint: true });
		if (!before.isFile() || !same(selected, before)) throw fault('repository_changed', `Repository file changed: ${path}`);
		const buffer = Buffer.alloc(262145); let length = 0;
		while (length < buffer.length) {
			signal?.throwIfAborted();
			const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
			if (!bytesRead) break;
			length += bytesRead;
		}
		const after = await file.stat({ bigint: true }); const visible = await lstat(absolute, { bigint: true });
		await ancestry(root, path);
		if (!same(before, after) || !same(before, visible) || BigInt(length) !== after.size || length > 262144 || await realpath(absolute) !== absolute) throw fault('repository_changed', `Repository file changed: ${path}`);
		let content: string;
		try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length)); }
		catch { throw fault('repository_text_denied', `Expected UTF-8 text: ${path}`); }
		if (content.includes('\0') || repositoryContentDenied(content)) throw fault('repository_content_denied', `Binary or potentially sensitive content: ${path}`);
		signal?.throwIfAborted();
		return { path, content, identity: after };
	} finally { await file.close(); }
}

/** Explicit host selection only. No discovery, Git execution, or repository writes. */
export async function captureRepository(rootInput: string, pathsInput: unknown, signal?: AbortSignal): Promise<RepositorySnapshot> {
	const paths = repositorySelectionSchema.parse(pathsInput).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
	signal?.throwIfAborted();
	if (!isAbsolute(rootInput)) throw fault('repository_root_denied', 'Select an absolute checkout directory');
	const source = resolve(rootInput);
	if (!(await lstat(source)).isDirectory()) throw fault('repository_root_denied', 'Select a checkout directory, not a symlink');
	const root = await realpath(source); const identity = await lstat(root, { bigint: true });
	const git = await lstat(join(root, '.git'));
	if (!git.isFile() && !git.isDirectory()) throw fault('repository_root_denied', 'Checkout root needs a regular .git file or directory');
	const files: Awaited<ReturnType<typeof readSource>>[] = []; let bytes = 0;
	for (const path of paths) {
		const file = await readSource(root, path, signal);
		if ((bytes += Buffer.byteLength(file.content)) > 1048576) throw fault('repository_size_denied', 'Repository selection exceeds 1 MiB');
		files.push(file);
	}
	for (const file of files) {
		const current = await readSource(root, file.path, signal);
		if (!same(file.identity, current.identity) || file.content !== current.content) throw fault('repository_changed', `Repository file changed: ${file.path}`);
	}
	const currentRoot = await lstat(root, { bigint: true });
	if (await realpath(source) !== root || currentRoot.ino !== identity.ino || currentRoot.dev !== identity.dev) throw fault('repository_changed', 'Repository root changed');
	signal?.throwIfAborted();
	return repositorySnapshotSchema.parse({ schemaVersion: 1, kind: 'repository-worktree', root, files: files.map(({ path, content }) => ({ path, content })) });
}

// JSON escaping can expand the existing 1 MiB raw text cap by up to six times.
const objectLimit = 7 * 1048576;
export const readRepositorySnapshot = (objects: string, digest: string) => readSealedJson(objects, digest, objectLimit, input => repositorySnapshotSchema.parse(input));
export const sealRepositorySnapshot = (objects: string, input: unknown) => sealJson(objects, input, objectLimit, value => repositorySnapshotSchema.parse(value));
export function repositoryManifest(input: unknown) {
	return repositorySnapshotSchema.parse(input).files.map(file => ({ path: file.path, bytes: Buffer.byteLength(file.content), contentDigest: createHash('sha256').update(file.content).digest('hex') }));
}
export function repositoryPolicyConditions(objects: string, digest: string, input: unknown) {
	const { files: _files, sourceSnapshot: _source, ...taskShape } = policyConditionsSchema.shape;
	const task = z.strictObject(taskShape).parse(input);
	const snapshot = readRepositorySnapshot(objects, digest);
	return policyConditionsSchema.parse({ ...task, files: snapshot.files, sourceSnapshot: { root: snapshot.root, digest } });
}
