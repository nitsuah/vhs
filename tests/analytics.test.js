const { afterEach, beforeEach, describe, expect, it } = require('@jest/globals');

jest.mock('../src/modules/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/modules/ids', () => ({ analyticsId: () => 'anl_test' }));

const { pool } = require('../src/modules/db');
const { logScanAnalytics } = require('../src/modules/analytics');

describe('logScanAnalytics', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inserts one scan_analytics row with the expected params', async () => {
    const suggestions = [{ title: 'Alien' }];
    await logScanAnalytics({ jobId: 'job_1', aiModel: 'm1', suggestions });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO scan_analytics');
    expect(params).toHaveLength(8);
    expect(params[0]).toBe('anl_test');
    expect(Number.isNaN(Date.parse(params[1]))).toBe(false);
    expect(params.slice(2)).toEqual(['job_1', 'm1', JSON.stringify(suggestions), false, 'pending', null]);
  });

  it('passes omdbVerified and ownerId through', async () => {
    await logScanAnalytics({ jobId: 'job_2', aiModel: 'm2', suggestions: [], omdbVerified: true, ownerId: 'u1' });
    const params = pool.query.mock.calls[0][1];
    expect(params[5]).toBe(true);
    expect(params[7]).toBe('u1');
  });

  it('warns instead of throwing when the query rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    pool.query.mockRejectedValue(new Error('db down'));
    await expect(logScanAnalytics({ jobId: 'job_3', aiModel: 'm3', suggestions: [] })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Analytics log error');
  });
});
