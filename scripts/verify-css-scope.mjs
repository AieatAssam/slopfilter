import fs from 'node:fs';

const css = fs.readFileSync('public/content/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const selectors = [];
for (const m of css.matchAll(/([^{};]*)\{/g)) {
  const sel = m[1].trim();
  if (sel && !sel.startsWith('@')) selectors.push(sel);
}

const errors = [];
for (const sel of selectors) {
  for (const rawPart of sel.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    if (/\.r-|\.css-/.test(part)) errors.push(`X class in selector: ${part}`);
    if (!/\.slopfilter-/.test(part)) errors.push(`unscoped selector: ${part}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('ok\n');
