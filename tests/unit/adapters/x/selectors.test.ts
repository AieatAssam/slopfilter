import { describe, expect, test } from 'vitest';
import {
  resolveSelector,
  type SelectorEntry,
  selectorContract,
  validateSelectorContract,
} from '@/adapters/x/selectors';

describe('selector contract', () => {
  test('accepts the shipped contract', () => {
    expect(validateSelectorContract(selectorContract).ok).toBe(true);
    expect(selectorContract.entries).toHaveLength(14);
  });

  test('rejects an entry with an empty selectors array', () => {
    const value = {
      ...selectorContract,
      entries: [
        { ...selectorContract.entries[0], selectors: [] },
        ...selectorContract.entries.slice(1),
      ],
    };

    const result = validateSelectorContract(value);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('primary-column'))).toBe(true);
  });

  test('rejects an entry with no required flag', () => {
    const first = { ...selectorContract.entries[0] } as Record<string, unknown>;
    delete first.required;

    const result = validateSelectorContract({
      ...selectorContract,
      entries: [first, ...selectorContract.entries.slice(1)],
    });

    expect(result.ok).toBe(false);
  });

  test('resolveSelector returns the first matching fallback in declared order', () => {
    document.body.innerHTML =
      '<div data-testid="primaryColumn"><section aria-label="Timeline: Your Home Timeline"></section></div>';
    const entry: SelectorEntry = {
      id: 'test',
      description: 'test',
      selectors: ['[data-testid="does-not-exist"]', '[data-testid="primaryColumn"]'],
      required: true,
    };

    expect(resolveSelector(document, entry)?.getAttribute('data-testid')).toBe('primaryColumn');
  });

  test('resolveSelector returns null when no fallback matches', () => {
    document.body.innerHTML =
      '<div data-testid="primaryColumn"><section aria-label="Timeline: Your Home Timeline"></section></div>';
    const entry: SelectorEntry = {
      id: 'test',
      description: 'test',
      selectors: ['[data-testid="nope"]'],
      required: true,
    };

    expect(() => resolveSelector(document, entry)).not.toThrow();
    expect(resolveSelector(document, entry)).toBeNull();
  });
});
