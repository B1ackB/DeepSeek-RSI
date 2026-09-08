import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, symlinkSync, readdirSync, chmodSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { openStore } from '../src/store.ts';
import { describeSkill, sealFixture, installFixtureProvider } from '../src/skills.ts';
import { restrictWorker } from '../src/worker.ts';

test('real Harness Skill registry pins text and resources across durable bindings', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'rsi-skills-'));
	let store = openStore(join(dir, 'state.sqlite'));
	const ctx = new Context();
	try {
		await ctx.plugin(SkillRegistry);
		async function mint(session: string) {
			let scope!: ReturnType<typeof createScope>;
			await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, { session }); }, { inject: ['skills'] }));
			return scope;
		}
		const skillId = randomUUID();
		const v1 = await sealFixture(resolve('fixtures/v1'), join(dir, 'objects'), skillId, process.cwd());
		assert.equal((await sealFixture(resolve('fixtures/v1'), join(dir, 'objects'), skillId, process.cwd())).root, v1.root);
		const v2 = await sealFixture(resolve('fixtures/v2'), join(dir, 'objects'), skillId, process.cwd());
		assert.notEqual(v1.snapshot.versionDigest, v2.snapshot.versionDigest);
		ctx.skills.register({ name: 'g0-probe', description: 'Interfering global Skill', source: 'test', content: 'WRONG_GLOBAL' });
		const a = await mint('A');
		const b = await mint('B');
		store.bind('A', skillId, v1.snapshot.versionDigest);
		store.bind('B', skillId, v2.snapshot.versionDigest);
		installFixtureProvider(a.ctx, v1.snapshot, v1.root);
		installFixtureProvider(b.ctx, v2.snapshot, v2.root);
		assert.match((await ctx.skills.get('g0-probe', { scope: scopeOf(a.ctx) }))!.content, /G0_V1/);
		assert.match((await ctx.skills.get('g0-probe', { scope: scopeOf(b.ctx) }))!.content, /G0_V2/);
		assert.throws(() => store.bind('A', skillId, v2.snapshot.versionDigest), /different Skill/);
		await a.dispose(); store.close(); store = openStore(join(dir, 'state.sqlite'));
		assert.equal(store.bind('A', skillId, v1.snapshot.versionDigest).versionDigest, v1.snapshot.versionDigest);
		const resumed = await mint('A-restored');
		installFixtureProvider(resumed.ctx, v1.snapshot, v1.root);
		const definition = await ctx.skills.get('g0-probe', { scope: scopeOf(resumed.ctx) });
		assert.equal(definition?.resourceBase?.kind, 'directory');
		for (const file of ['probe.py', 'probe.sh', 'reference.txt']) assert.match(readFileSync(join(v1.root, file), 'utf8'), /G0_V1/);
		chmodSync(join(v1.root, 'SKILL.md'), 0o644);
		writeFileSync(join(v1.root, 'SKILL.md'), 'CORRUPT');
		const missing = await ctx.skills.get('g0-probe', { scope: scopeOf(resumed.ctx) }).catch(() => undefined);
		assert.equal(missing, undefined, 'Corrupt bound version must not fall back to global Skill');
		await resumed.dispose(); await b.dispose();
		symlinkSync('/etc/passwd', join(dir, 'bad'));
		await assert.rejects(describeSkill(join(dir, 'bad'), skillId, process.cwd()), /symbolic link/);
	} finally {
		await ctx.fiber.dispose(); store.close();
		const writable = (root: string) => { chmodSync(root, 0o700); for (const file of readdirSync(root, { withFileTypes: true })) if (file.isDirectory()) writable(join(root, file.name)); };
		writable(dir); rmSync(dir, { recursive: true, force: true });
	}
});

test('real Harness monotonic guard blocks a later scope-local tool and leaves daily tools available', async () => {
	const ctx = new Context();
	try {
		await ctx.plugin(SystemPrompt, {}); await ctx.plugin(ToolRuntime);
		let ran = 0;
		const tool = (name: string): ToolDefinition => ({ name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute: async () => { ran++; return 'EXECUTED'; } });
		ctx.tools.register(tool('host_probe'));
		const key = { id: 'g0-worker' } as Agent;
		let scope!: ReturnType<typeof createScope>;
		await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key); }, { inject: ['tools', 'systemPrompt'] }));
		restrictWorker(scope.ctx, new Set(['allowed_probe']));
		scope.ctx.tools.register(tool('allowed_probe'));
		scope.ctx.tools.register(tool('forbidden_probe'));
		const execute = (name: string, agent?: Agent) => ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId(randomUUID()), name, arguments: {}, ...(agent ? { agent } : {}) });
		assert.equal((await execute('forbidden_probe', key)).isError, true);
		assert.equal((await execute('host_probe', key)).isError, true);
		assert.equal(ran, 0);
		assert.equal((await execute('allowed_probe', key)).isError, false);
		assert.equal((await execute('host_probe')).isError, false);
		assert.equal(ran, 2);
		await scope.dispose();
	} finally { await ctx.fiber.dispose(); }
});
