import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
await build({
	entryPoints: ['src/client/index.tsx'], outfile: 'dist/client.js', bundle: true, platform: 'browser', format: 'cjs', jsx: 'automatic',
	external: ['react', 'react/jsx-runtime'], define: { 'process.env.NODE_ENV': '"production"' },
	banner: { js: 'window.__ModuleLoader__.load({id:"@b1ackb/deepseek-rsi",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
	footer: { js: 'return module.exports;}});' },
});
if (process.argv.includes('--probe')) {
	await mkdir('.cache', { recursive: true });
	await writeFile('.cache/package.json', JSON.stringify({ name: 'rsi-g0-test-helper', version: '0.0.0-g0', type: 'module' }));
	await build({ entryPoints: ['scripts/host-probe.ts'], outfile: '.cache/host-probe.js', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
}
