import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);
export const G0_IMAGE = 'python@sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285';
export async function runDocker(skillRoot: string, command: readonly string[], signal?: AbortSignal) {
	const root = await realpath(skillRoot);
	const name = `rsi-g0-${randomUUID()}`;
	const docker = process.env.RSI_DOCKER_BIN ?? 'docker';
	const invoke = (args: string[], timeout = 10000, taskSignal?: AbortSignal) => exec(docker, args, { timeout, signal: taskSignal, maxBuffer: 1048576, encoding: 'utf8' });
	let id = '';
	let stdout = '';
	let interrupted = false;
	let exitCode: number | null = null;
	try {
		const created = await invoke(['create', '--name', name, '--label', `rsi.g0=${name}`, '--network=none', '--read-only', '--user=65534:65534', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--cpus=1', '--memory=256m', '--memory-swap=256m', '--pids-limit=64', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=16m', '--mount', `type=bind,src=${root},dst=/skill,readonly`, '--workdir=/skill', G0_IMAGE, ...command]);
		id = created.stdout.trim();
		if (!/^[a-f0-9]{64}$/.test(id)) throw new Error(`Docker did not return a container identity: ${name}`);
		const deadline = AbortSignal.timeout(10000);
		const stop = signal ? AbortSignal.any([signal, deadline]) : deadline;
		try { stdout = (await invoke(['start', '--attach', id], 0, stop)).stdout; }
		catch (error) {
			const e = error as NodeJS.ErrnoException & { killed?: boolean; stdout?: string };
			stdout = e.stdout ?? '';
			if (stop.aborted || e.killed || e.code === 'ABORT_ERR') interrupted = true;
			else throw error;
		}
		interrupted ||= stop.aborted;
		if (!interrupted) {
			const state = JSON.parse((await invoke(['inspect', '--format', '{{json .State}}', id])).stdout);
			if (state.Running !== false || !Number.isSafeInteger(state.ExitCode)) throw new Error(`Container did not finish: ${id}`);
			exitCode = state.ExitCode;
		}
		return { id, name, stdout, interrupted, exitCode, cleanup: 'complete' as const };
	} finally {
		// 杀 attach 进程不会停止容器；按刚创建的完整 ID 清理并核实。
		const filter = `label=rsi.g0=${name}`;
		const owned = (await invoke(['ps', '--all', '--quiet', '--no-trunc', '--filter', filter])).stdout.trim();
		if (owned) {
			if (!/^[a-f0-9]{64}$/.test(owned)) throw new Error(`Ambiguous G0 container ownership: ${name}`);
			await invoke(['rm', '--force', owned]);
		}
		if ((await invoke(['ps', '--all', '--quiet', '--filter', filter])).stdout.trim()) throw new Error(`G0 cleanup incomplete: ${name}`);
	}
}
