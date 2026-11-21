import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('user-facing copy', () => {
  test('no surface claims authorship detection', () => {
    const pattern =
      /\b(ai[- ]?(generated|written|detect)|written by (an )?ai|synthetic|authored by)\b/i;
    for (const path of [
      'public/ui/onboarding/onboarding.html',
      'public/ui/privacy/privacy.html',
      'docs/store-listing.md',
    ]) {
      expect(read(path), path).not.toMatch(pattern);
    }
  });

  test('privacy page names model and thumbnail requests and DevTools verification', () => {
    const privacy = read('public/ui/privacy/privacy.html');

    expect(privacy).toContain('huggingface.co');
    expect(privacy).toContain('pbs.twimg.com');
    expect(privacy).toContain('DevTools');
  });

  test('privacy page states there are no accounts and no analytics', () => {
    const privacy = read('public/ui/privacy/privacy.html');

    expect(privacy).toContain('no accounts');
    expect(privacy).toContain('analytics');
  });
});
