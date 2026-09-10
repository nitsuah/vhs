'use strict';

// Direct unit tests for the background worker (src/modules/worker.js), which
// previously had no dedicated test file (44% line coverage). Each test mocks
// pool.query for the exact sequence of calls processJobs() issues so the
// housekeeping steps (stuck-job reset, failed-job retry reset, permanently
// failed conversion) and the main pending-job pipeline can be exercised in
// isolation from the rest of the server.

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const mockCallOllamaServer = jest.fn();
jest.mock('../src/modules/ollama', () => ({
  callOllamaServer: (...args) => mockCallOllamaServer(...args),
  pingOllama: jest.fn(),
}));

const mockEnhancedLookup = jest.fn();
jest.mock('../src/modules/omdb', () => ({
  enhancedLookup: (...args) => mockEnhancedLookup(...args),
  callOmdb: jest.fn(),
}));

const mockLogScanAnalytics = jest.fn();
jest.mock('../src/modules/analytics', () => ({
  logScanAnalytics: (...args) => mockLogScanAnalytics(...args),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
const { processJobs, isWorkerBusy } = require('../src/modules/worker');

beforeEach(() => {
  mockQuery.mockReset();
  mockCallOllamaServer.mockReset();
  mockEnhancedLookup.mockReset();
  mockLogScanAnalytics.mockReset().mockResolvedValue(undefined);
});

describe('processJobs housekeeping', () => {
  it('resets stuck/failed jobs then returns when nothing is pending', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 }) // stuck-job reset
      .mockResolvedValueOnce({ rowCount: 0 }) // failed-job retry reset
      .mockResolvedValueOnce({ rows: [] })    // permanently-failed select
      .mockResolvedValueOnce({ rows: [] });   // next pending select — none
    await processJobs();
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockQuery.mock.calls[0][0]).toMatch(/status='pending'.*WHERE status='processing'/s);
    expect(mockCallOllamaServer).not.toHaveBeenCalled();
  });

  it('converts permanently-failed jobs into review_items and deletes them', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'job_x', thumb: 't', error: 'boom' }] })
      .mockResolvedValueOnce({ rows: [] }) // insert review_items
      .mockResolvedValueOnce({ rows: [] }) // delete upload_jobs
      .mockResolvedValueOnce({ rows: [] }); // next pending select — none
    await processJobs();
    expect(mockQuery).toHaveBeenCalledTimes(6);
    expect(mockQuery.mock.calls[3][0]).toMatch(/INSERT INTO review_items/);
    expect(mockQuery.mock.calls[3][1]).toContain('boom');
    expect(mockQuery.mock.calls[4][0]).toMatch(/DELETE FROM upload_jobs/);
  });

  it('falls back to a default fail_reason when the failed job has no error text', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'job_y', thumb: null, error: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await processJobs();
    expect(mockQuery.mock.calls[3][1]).toContain('Analysis failed max retries');
  });
});

describe('processJobs pending-job pipeline', () => {
  function withHousekeeping(pendingRow) {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 }) // stuck reset
      .mockResolvedValueOnce({ rowCount: 0 }) // retry reset
      .mockResolvedValueOnce({ rows: [] })    // permFailed select
      .mockResolvedValueOnce({ rows: pendingRow ? [pendingRow] : [] }); // next pending
  }

  it('runs a job end-to-end: Ollama scan, OMDb enrichment, insert, delete', async () => {
    withHousekeeping({ id: 'job_1', image_data: 'b64data', thumb: 'th1' });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // mark processing
      .mockResolvedValueOnce({ rows: [] }) // existingItems check — none
      .mockResolvedValueOnce({ rows: [] }) // insert review_items
      .mockResolvedValueOnce({ rows: [] }); // delete upload_jobs

    mockCallOllamaServer.mockResolvedValue([{ title: 'Jaws', confidence: 'high' }]);
    mockEnhancedLookup.mockResolvedValue({ title: 'Jaws', year: '1975', imdb_id: 'tt0073195' });

    await processJobs();

    expect(mockCallOllamaServer).toHaveBeenCalledWith('b64data');
    expect(mockEnhancedLookup).toHaveBeenCalled();
    expect(mockLogScanAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job_1', omdbVerified: true })
    );
    const insertCall = mockQuery.mock.calls[6];
    expect(insertCall[0]).toMatch(/INSERT INTO review_items/);
    expect(insertCall[1][1]).toBe('job_1');
    const deleteCall = mockQuery.mock.calls[7];
    expect(deleteCall[0]).toMatch(/DELETE FROM upload_jobs/);
  });

  it('keeps the raw title when OMDb has no confident match', async () => {
    withHousekeeping({ id: 'job_2', image_data: 'b64', thumb: null });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockCallOllamaServer.mockResolvedValue([{ title: 'Unreadable Spine', confidence: 'low' }]);
    mockEnhancedLookup.mockResolvedValue(null);

    await processJobs();

    expect(mockLogScanAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ omdbVerified: false })
    );
  });

  it('skips a job that already has review_items (duplicate-processing guard)', async () => {
    withHousekeeping({ id: 'job_3', image_data: 'b64', thumb: null });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // mark processing
      .mockResolvedValueOnce({ rows: [{ id: 'rev_existing' }] }) // existingItems — found
      .mockResolvedValueOnce({ rows: [] }); // delete upload_jobs

    await processJobs();

    expect(mockCallOllamaServer).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls[6][0]).toMatch(/DELETE FROM upload_jobs/);
  });

  it('marks the job failed and bumps retry_count when the Ollama call throws', async () => {
    withHousekeeping({ id: 'job_4', image_data: 'b64', thumb: null });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // mark processing
      .mockResolvedValueOnce({ rows: [] }) // existingItems — none
      .mockResolvedValueOnce({ rows: [] }); // the failure UPDATE

    mockCallOllamaServer.mockRejectedValue(new Error('ollama down'));

    await processJobs();

    const failCall = mockQuery.mock.calls[6];
    expect(failCall[0]).toMatch(/status='failed'.*retry_count=retry_count\+1/s);
    expect(failCall[1][0]).toBe('ollama down');
  });
});

describe('processJobs resilience', () => {
  it('swallows an outer pool failure and releases the busy guard', async () => {
    mockQuery.mockRejectedValue(new Error('pool unreachable'));
    await expect(processJobs()).resolves.toBeUndefined();
    expect(isWorkerBusy()).toBe(false);
  });

  it('re-entrant call is a no-op while a run is already in flight', async () => {
    let releaseHousekeeping;
    mockQuery.mockImplementationOnce(
      () => new Promise(resolve => { releaseHousekeeping = () => resolve({ rowCount: 0 }); })
    );
    const first = processJobs();
    expect(isWorkerBusy()).toBe(true);

    // A second call while the first is still running must return immediately
    // without touching the mock query queue.
    const callsBeforeSecond = mockQuery.mock.calls.length;
    await processJobs();
    expect(mockQuery.mock.calls.length).toBe(callsBeforeSecond);

    // Unblock the first run so it can finish housekeeping and exit cleanly.
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    releaseHousekeeping();
    await first;
    expect(isWorkerBusy()).toBe(false);
  });
});
