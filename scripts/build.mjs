import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
await build({ entryPoints: ['src/scenarios/index.ts'], outfile: 'dist/scenarios.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.types.json'], { stdio: 'inherit' });
await build({
	entryPoints: ['src/client/index.tsx'], outfile: 'dist/client.js', bundle: true, platform: 'browser', format: 'cjs', jsx: 'automatic',
	external: ['react', 'react/jsx-runtime'], define: { 'process.env.NODE_ENV': '"production"' },
	banner: { js: 'window.__ModuleLoader__.load({id:"@b1ackb/deepseek-rsi",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
	footer: { js: 'return module.exports;}});' },
});
if (process.argv.includes('--probe') || process.argv.includes('--latency') || process.argv.includes('--g1-fixture')) {
	await mkdir('.cache', { recursive: true });
	await writeFile('.cache/package.json', JSON.stringify({ name: 'rsi-g0-test-helper', version: '0.0.0-g0', type: 'module' }));
	const probe = process.argv.includes('--g1-fixture') ? 'g1-browser-fixture' : process.argv.includes('--latency') ? 'latency-probe' : 'host-probe';
	await build({ entryPoints: [`scripts/${probe}.ts`], outfile: `.cache/${probe}.js`, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
}
