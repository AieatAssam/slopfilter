import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifestPath = 'dist/manifest.json';
if (!existsSync(manifestPath)) throw new Error(`${manifestPath} does not exist`);

if (process.env.SLOPFILTER_BUILD_TARGET !== 'test') process.exit(0);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const xEntry = manifest.content_scripts.find((entry) => entry.matches.includes('https://x.com/*'));
if (!xEntry) throw new Error('x.com content script entry does not exist');

manifest.host_permissions.push('http://localhost:5174/*');
manifest.content_scripts.push({
  matches: ['http://localhost:5174/*'],
  js: xEntry.js,
  css: xEntry.css,
  run_at: xEntry.run_at,
});
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
