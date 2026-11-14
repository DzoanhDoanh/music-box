import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../../src/shared/retry';

describe('bounded exponential retry', () => {
  it('backs off and returns the eventual committed result', async () => {
    const sleep = vi.fn(async () => {});
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue('committed');
    expect(await withRetry(operation, () => true, { sleep, random: () => 0.5 })).toBe('committed');
    expect(sleep.mock.calls).toEqual([[300], [600]]);
    expect(operation).toHaveBeenCalledTimes(3);
  });
  it('stops after the retry budget and never retries permanent failures', async () => {
    const error = new Error('offline');
    const operation = vi.fn().mockRejectedValue(error);
    await expect(withRetry(operation, () => true, { sleep: async () => {} })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    operation.mockClear();
    await expect(withRetry(operation, () => false)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
