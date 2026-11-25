const { afterEach, describe, expect, it } = require('@jest/globals');
const { withRetry } = require('../src/modules/retry');

afterEach(() => jest.restoreAllMocks());

describe('withRetry', () => {
  it('returns immediately when the first attempt succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(withRetry(fn, 3, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
  it('retries failures and returns the later success', async () => {
    const fn = jest.fn().mockRejectedValueOnce(Error('first')).mockRejectedValueOnce(Error('second')).mockResolvedValue('ok');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(withRetry(fn, 3, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('rethrows the final error after maxAttempts', async () => {
    const error = Error('offline');
    const fn = jest.fn().mockRejectedValue(error);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(withRetry(fn, 3, 0)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
