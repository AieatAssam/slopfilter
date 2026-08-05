import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { runSelfTest } from '@/adapters/x/selftest';

const readFixture = (name: string): string => readFileSync(`tests/fixtures/dom/x/${name}`, 'utf8');
const load = (name: string): Document => {
  document.documentElement.innerHTML = readFixture(name);
  return document;
};

describe('runSelfTest', () => {
  test('passes on the baseline fixture', () => {
    const result = runSelfTest(load('timeline-baseline.html'));

    expect(result.ok).toBe(true);
    expect(result.failedSelectorIds).toEqual([]);
  });

  test('fails with the timeline-container id on the broken fixture', () => {
    const result = runSelfTest(load('timeline-broken-selectors.html'));

    expect(result.ok).toBe(false);
    expect(result.failedSelectorIds).toEqual(['timeline-container']);
  });

  test('an optional selector failure does not pause the extension', () => {
    const root = load('timeline-baseline.html');
    root.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((element) => {
      element.remove();
    });

    const result = runSelfTest(root);

    expect(result.ok).toBe(true);
    expect(result.failedSelectorIds).toEqual([]);
    expect(result.optionalFailures).toContain('post-images');
  });
});
