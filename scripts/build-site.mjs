#!/usr/bin/env node
// Bundle the front-end with esbuild and assemble dist/ (static site for GitHub Pages).
//   node scripts/build-site.mjs           production build
//   node scripts/build-site.mjs --serve   dev server on http://localhost:8080 with rebuild on change
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const serve = process.argv.includes('--serve');

mkdirSync(DIST, { recursive: true });
cpSync(join(ROOT, 'public'), DIST, { recursive: true });
writeFileSync(join(DIST, '.nojekyll'), '');
/** index.html points at this build's files; the version is a hash of them, so it only changes with the code. */
function writeIndex(version) {
  writeFileSync(join(DIST, 'index.html'), readFileSync(join(ROOT, 'src/index.html'), 'utf8').replaceAll('__BUILD__', version));
  writeFileSync(join(DIST, 'version.json'), JSON.stringify({ app: version }));
}
if (!existsSync(join(DIST, 'data/latest.json'))) {
  console.warn('! dist/data/latest.json missing — run `npm run data` (live) or `npm run data:sample` (offline fixtures)');
}

// satellite.js re-exports an optional WebAssembly build that pulls in Node-only modules; the site
// only needs the plain-JS SGP4 functions, so the wasm entry is replaced with an empty module.
const stubSatelliteWasm = {
  name: 'stub-satellite-wasm',
  setup(b) {
    b.onResolve({ filter: /\/wasm\/index\.js$/ }, (args) => (args.importer.includes('satellite.js') ? { path: 'wasm', namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export {};', loader: 'js' }));
  },
};

const options = {
  entryPoints: { app: join(ROOT, 'src/main.js') },
  plugins: [stubSatelliteWasm],
  bundle: true,
  format: 'esm',
  target: ['es2021', 'chrome100', 'safari15.4', 'firefox100'],
  outdir: DIST,
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'linked',
  logLevel: 'info',
  loader: { '.json': 'json' },
};

if (serve) {
  writeIndex(Date.now().toString(36));
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: DIST, port: 8080 });
  console.log(`dev server: http://localhost:${port}`);
} else {
  const result = await esbuild.build({ ...options, metafile: true });
  const out = Object.entries(result.metafile.outputs).map(([f, o]) => `${f.replace(ROOT + '/', '')} ${(o.bytes / 1024).toFixed(0)} KB`);
  const hash = createHash('sha1');
  for (const f of ['app.js', 'app.css', '../src/index.html']) hash.update(readFileSync(join(DIST, f)));
  const version = hash.digest('hex').slice(0, 10);
  writeIndex(version);
  console.log(out.join('\n'));
  console.log(`version ${version}`);
}
