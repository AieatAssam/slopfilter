import { describe, expect, test } from 'vitest';

describe('dom test environment', () => {
  test('runs in the jsdom environment with DOM globals available', () => {
    expect(typeof document).not.toBe('undefined');
    expect(typeof window).not.toBe('undefined');
  });
});
