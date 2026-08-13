import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const run = (loose: boolean) => {
  const directory = mkdtempSync(join(tmpdir(), 'sf224-'));
  const input = join(directory, 'input.html');
  const output = join(directory, 'output.html');
  writeFileSync(
    input,
    '<main><p data-owner="@Alice" data-link="https://real.example/path">@Alice has a long post with more words.</p></main>',
  );
  execFileSync('node', [
    'scripts/sanitise-fixture.mjs',
    ...(loose ? ['--loose'] : []),
    input,
    output,
  ]);
  return readFileSync(output, 'utf8');
};

describe('drift capture sanitiser', () => {
  test('loose mode scrubs a page with no post elements', () => {
    const output = run(true);
    expect(output).toContain('@account01');
    expect(output).not.toContain('@Alice');
    expect(output).toContain('https://example.invalid/');
    expect(output).not.toContain('real.example');
    expect(output).toContain('Synthetic page text.');
  });

  test('default mode still rejects a page with no post elements', () => {
    expect(() => run(false)).toThrow();
  });
});
