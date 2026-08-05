import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifestPath = 'dist/manifest.json';
if (!existsSync(manifestPath)) throw new Error(`${manifestPath} does not exist`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (process.env.SLOPFILTER_BUILD_TARGET === 'test') {
  manifest.host_permissions.push('http://localhost:5174/*');
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
