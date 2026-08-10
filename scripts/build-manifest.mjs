import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifestPath = 'dist/manifest.json';
if (!existsSync(manifestPath)) throw new Error(`${manifestPath} does not exist`);

if (process.env.SLOPFILTER_BUILD_TARGET !== 'test') process.exit(0);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

manifest.host_permissions.push('http://localhost:5174/*');
for (const entry of manifest.content_scripts.filter((candidate) =>
  candidate.matches.includes('https://x.com/*'),
)) {
  manifest.content_scripts.push({
    matches: ['http://localhost:5174/*'],
    js: entry.js,
    ...(entry.css ? { css: entry.css } : {}),
    run_at: entry.run_at,
    ...(entry.world ? { world: entry.world } : {}),
  });
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
