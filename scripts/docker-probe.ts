import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runDocker, G0_IMAGE } from '../src/docker.ts';

const root = resolve('fixtures/v1');
const python = await runDocker(root, ['python', 'probe.py']);
assert.equal(python.exitCode, 0);
assert.match(python.stdout, /PY_G0_V1 REF_G0_V1/);
const shell = await runDocker(root, ['/bin/sh', 'probe.sh']);
assert.equal(shell.exitCode, 0);
assert.match(shell.stdout, /SH_G0_V1/);
const boundary = await runDocker(root, ['python', '-c', `import os,socket
assert os.getuid()==65534
assert not os.path.exists('/var/run/docker.sock')
for target in ['/skill/probe.py','/should-not-write']:
	try:
		open(target,'w').close()
	except OSError:
		pass
	else:
		raise AssertionError(target)
assert [n for _,n in socket.if_nameindex()]==['lo']
print('BOUNDARY_OK')`]);
assert.equal(boundary.exitCode, 0);
assert.match(boundary.stdout, /BOUNDARY_OK/);
const timeout = await runDocker(root, ['python', '-c', 'import subprocess,time; subprocess.Popen(["sleep","60"]); time.sleep(60)']);
assert.equal(timeout.interrupted, true);
const cancellation = new AbortController();
const timer = setTimeout(() => cancellation.abort(), 1500);
let cancelled;
try { cancelled = await runDocker(root, ['python', '-c', 'import time; time.sleep(60)'], cancellation.signal); }
finally { clearTimeout(timer); }
assert.equal(cancelled.interrupted, true);
console.log(JSON.stringify({ check: 'docker_lifecycle', status: 'passed', image: G0_IMAGE, containers: [python, shell, boundary, timeout, cancelled].map(({id,exitCode,interrupted,cleanup}) => ({id,exitCode,interrupted,cleanup})) }, null, 2));
