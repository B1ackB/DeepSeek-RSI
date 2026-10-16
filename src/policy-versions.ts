import { constants, mkdirSync, realpathSync, lstatSync, openSync, fstatSync, readSync, closeSync, writeFileSync, fchmodSync, fsyncSync, linkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fault } from './contracts.ts';
import { policyContentSchema, policyDigest } from './policy-contracts.ts';

function directory(objects: string) {
	if (lstatSync(objects).isSymbolicLink()) throw fault('policy_object_invalid', 'Policy object directory cannot be a symlink');
	return realpathSync(objects);
}
export function readSealedJson<T>(objects: string, digest: string, maxBytes: number, parse: (input: unknown) => T) {
	z.string().regex(/^[a-f0-9]{64}$/).parse(digest);
	const path = join(directory(objects), `${digest}.json`);
	const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const before = fstatSync(fd);
		if (!before.isFile() || before.size > maxBytes || (before.mode & 0o222) !== 0) throw fault('policy_object_invalid', 'Policy object must be a bounded read-only regular file');
		const buffer = Buffer.alloc(maxBytes + 1); let length = 0;
		while (length < buffer.length) { const size = readSync(fd, buffer, length, buffer.length - length, length); if (!size) break; length += size; }
		const after = fstatSync(fd); const visible = lstatSync(path);
		if (length > maxBytes || length !== after.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== visible.ino || before.dev !== visible.dev || realpathSync(path) !== path) throw fault('policy_object_changed', 'Policy object changed while reading');
		const bytes = buffer.subarray(0, length);
		let decoded: unknown;
		try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
		catch { throw fault('policy_object_corrupt', 'Sealed object must contain valid UTF-8 JSON'); }
		const policy = parse(decoded);
		if (!bytes.equals(Buffer.from(JSON.stringify(policy))) || policyDigest(policy) !== digest) throw fault('policy_object_corrupt', 'Policy bytes or digest differ from the sealed object');
		return policy;
	} finally { closeSync(fd); }
}

export function sealJson<T>(objects: string, input: unknown, maxBytes: number, parse: (input: unknown) => T) {
	const content = parse(input); const digest = policyDigest(content);
	if (Buffer.byteLength(JSON.stringify(content)) > maxBytes) throw fault('policy_object_invalid', 'Sealed object exceeds its byte limit');
	mkdirSync(objects, { recursive: true, mode: 0o700 });
	const root = directory(objects); const staged = join(root, `.seal-${randomUUID()}`);
	const fd = openSync(staged, 'wx', 0o600);
	try { writeFileSync(fd, JSON.stringify(content)); fchmodSync(fd, 0o444); fsyncSync(fd); }
	catch (error) { closeSync(fd); unlinkSync(staged); throw error; }
	closeSync(fd);
	try {
		// Publish the complete file without replacing an existing object, including a corrupt one.
		try { linkSync(staged, join(root, `${digest}.json`)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
		readSealedJson(root, digest, maxBytes, parse);
		const directoryFd = openSync(root, constants.O_RDONLY);
		try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
		return { digest, content };
	} finally { unlinkSync(staged); }
}

export const readPolicy = (objects: string, digest: string) => readSealedJson(objects, digest, 65536, input => policyContentSchema.parse(input));
export const sealPolicy = (objects: string, input: unknown) => sealJson(objects, input, 65536, value => policyContentSchema.parse(value));
