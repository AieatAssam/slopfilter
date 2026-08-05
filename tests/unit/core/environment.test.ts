import { describe, expect, test } from 'vitest';

describe('core test environment', () => {
  test('runs in the node environment with no DOM globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
