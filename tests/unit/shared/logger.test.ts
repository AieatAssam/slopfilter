import { describe, expect, test, vi } from 'vitest';
import { logger } from '@/shared/logger';

describe('logger', () => {
  test('prefixes every message with the slopfilter tag', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('hello');

    expect(info.mock.calls[0]?.[0]).toContain('[slopfilter]');
  });
});
