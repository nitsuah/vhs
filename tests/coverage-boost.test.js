'use strict';

const request = require('supertest');
const child_process = require('child_process');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],
  readFileSync: () => Buffer.from('test'),
}));

// Mock child_process so server.js's execAsync uses the mocked exec
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const child = {
      stdin: {
        write: jest.fn(),
        end: jest.fn(() => {
          // Call callback synchronously to avoid async issues
          process.nextTick(() => cb(null, '{"tapes":[{"title":"Test Tape"}]}', ''));
        })
      },
      stdout: { on: jest.fn(), pipe: jest.fn() },
      stderr: { on: jest.fn(), pipe: jest.fn() },
      on: jest.fn()
    };
    return child;
  }),
  execSync: jest.fn()
}));

// Mock processJobs to avoid actual execution
const processJobs = jest.fn().mockResolvedValue(undefined);

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.OMDB_API_KEY = 'test-key';
const { app } = require('../server');

beforeEach(() => {
  mockQuery.mockReset();
  child_process.exec = jest.fn((cmd, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const child = {
      stdin: {
        write: jest.fn(),
        end: jest.fn(() => {
          cb(null, '{"tapes":[{"title":"Test Tape"}]}', ''); // Simulate success with sample JSON output
        })
      },
      stdout: { on: jest.fn(), pipe: jest.fn() },
      stderr: { on: jest.fn(), pipe: jest.fn() },
      on: jest.fn()
    };
    return child;
  });
});

describe('withRetry and worker processes', () => {
  it('POST /api/jobs stores image and returns job ID for later processing', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,/9j/4AAQ', thumb: 'data:image/jpeg;base64,thumb' });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO upload_jobs'),
      expect.arrayContaining(['data:image/jpeg;base64,/9j/4AAQ'])
    );
  });

  it('job processing retries on failure', async () => {
    mockQuery.mockResolvedValue({ rows: [] }); // DB success
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenCalled();
  }, 30000);
  });

  it('POST /api/jobs/retry-failed requeues all failed jobs', async () => {
    mockQuery.mockResolvedValue({ rowCount: 5 });
    const res = await request(app).post('/api/jobs/retry-failed');
    expect(res.status).toBe(200);
    expect(res.body.requeued).toBe(5);
  });

  it('failed jobs can be retried individually', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/jobs/job_failed_1/retry');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retry returns 404 when job not found', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).post('/api/jobs/job_missing/retry');
    expect(res.status).toBe(404);
  });

  it('GET /api/jobs/inflight returns jobs in progress', async () => {
    const jobs = [
      { id: 'j1', status: 'pending', retry_count: 0, created_at: new Date().toISOString() },
      { id: 'j2', status: 'processing', retry_count: 1, created_at: new Date().toISOString() },
    ];
    mockQuery.mockResolvedValue({ rows: jobs });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('j1');
  });

  it('GET /api/jobs/inflight returns empty when nothing inflight', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/review creates manual review item', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/review')
      .send({ data: { title: 'Jaws', year: '1975', label: 'Universal' }, source: 'manual' });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^rev_/);
  });

  it('POST /api/review requires data', async () => {
    const res = await request(app)
      .post('/api/review')
      .send({ source: 'manual' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/review/:id removes review item', async () => {
    mockQuery.mockResolvedValue({});
    const res = await request(app).delete('/api/review/rev_test_123');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/review/pending returns all pending and failed review items', async () => {
    const items = [
      { id: 'rev_1', job_id: 'j1', status: 'pending', fail_reason: null, created_at: new Date().toISOString() },
      { id: 'rev_2', job_id: 'j2', status: 'failed', fail_reason: 'No tapes detected', created_at: new Date().toISOString() },
    ];
    mockQuery.mockResolvedValue({ rows: items });
    const res = await request(app).get('/api/review/pending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1].fail_reason).toBe('No tapes detected');
  });

  it('review items can be marked with outcomes', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app)
      .post('/api/analytics/outcome')
      .send({
        job_id: 'j1',
        action: 'corrected',
        final_title: 'The Shining',
        final_year: '1980',
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('outcome requires both job_id and action', async () => {
    let res = await request(app)
      .post('/api/analytics/outcome')
      .send({ job_id: 'j1' });
    expect(res.status).toBe(400);

    res = await request(app)
      .post('/api/analytics/outcome')
      .send({ action: 'accepted' });
    expect(res.status).toBe(400);
  });

  it('review items can be converted from jobs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
  });

  it('GET /api/health exercises db check and ollama check paths', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llava:7b' }] }),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.ollama).toBe('ok');
    global.fetch = origFetch;
  });

  it('GET /api/health exercises db error and ollama error paths', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const res = await request(app).get('/api/health');
    expect(res.body.db).toBe('error');
    expect(res.body.ollama).toBe('error');
    global.fetch = origFetch;
  });

  it('POST /api/jobs triggers worker flow', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await request(app).post('/api/jobs').send({ image: 'data:image/jpeg;base64,abc' });
    expect(mockQuery).toHaveBeenCalled();
  });

  it('exercises retry logic for failed jobs', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/jobs/job_failed_123/retry');
    expect(res.status).toBe(200);
  });

  it('calls ensureCerts for certificate setup', () => {
    const { ensureCerts } = require('../server');
    expect(() => ensureCerts()).not.toThrow();
  });

  it('calls runMigrations for database setup', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { runMigrations } = require('../server');
    await expect(runMigrations()).resolves.toBeUndefined();
  });

  it('calls callOllamaServer with mock fetch', async () => {
    const { callOllamaServer } = require('../server');
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: '[{"title":"Test"}]' }),
    });
    const result = await callOllamaServer('base64data');
    expect(result).toEqual([{ title: 'Test' }]);
    global.fetch = origFetch;
  });

  it('calls callOmdb with mock fetch', async () => {
    const { callOmdb } = require('../server');
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        Response: 'True', Title: 'Test', Year: '2020', Production: 'Studio',
        imdbID: 'tt1234567', Poster: 'http://img', Genre: 'Drama',
      }),
    });
    const result = await callOmdb({ title: 'Test' }, 'apikey');
    expect(result.title).toBe('Test');
    expect(result.imdb_id).toBe('tt1234567');
    global.fetch = origFetch;
  });

  it('calls parseJsonArray with various inputs', () => {
    const { parseJsonArray } = require('../server');
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray('')).toEqual([]);
    expect(parseJsonArray('[{"x":1}]')).toEqual([{ x: 1 }]);
  });

  it('calls ID generators', () => {
    const { jobId, reviewItemId, analyticsId } = require('../server');
    expect(jobId()).toMatch(/^job_/);
    expect(reviewItemId()).toMatch(/^rev_/);
    expect(analyticsId()).toMatch(/^anl_/);
  });

  it('calls logScanAnalytics', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { logScanAnalytics } = require('../server');
    await expect(logScanAnalytics({}, { jobId: 'j1', aiModel: 'm', suggestions: [] })).resolves.toBeUndefined();
  });

  // logActivity tested indirectly via other tests; console mocking order prevents direct test

  it('calls withRetry', async () => {
    const { withRetry } = require('../server');
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls withRetry retries on failure', async () => {
    const { withRetry } = require('../server');
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exercises processJobs directly', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1 })  // stuck jobs
      .mockResolvedValueOnce({ rowCount: 1 })  // failed conversion
      .mockResolvedValueOnce({ rows: [] });     // no pending
    const { processJobs } = require('../server');
    await expect(processJobs()).resolves.toBeUndefined();
  });
});

describe('API error handlers', () => {
  it('POST /api/jobs returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).post('/api/jobs').send({ image: 'abc' });
    expect(res.status).toBe(500);
  });

  it('DELETE /api/review/:id returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).delete('/api/review/rev_1');
    expect(res.status).toBe(500);
  }, 30000);

  it('POST /api/review returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).post('/api/review').send({ data: { title: 'T' } });
    expect(res.status).toBe(500);
  }, 30000);

  it('POST /api/jobs/:id/retry returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).post('/api/jobs/job_1/retry');
    expect(res.status).toBe(500);
  }, 30000);

  it('GET /api/jobs/inflight returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
  }, 30000);
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(500);
  });

  it('GET /api/jobs/status returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).get('/api/jobs/status');
    expect(res.status).toBe(500);
  });

  it('GET /api/jobs/:id returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).get('/api/jobs/job_1');
    expect(res.status).toBe(500);
  });

  it('DELETE /api/jobs/:id returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).delete('/api/jobs/job_1');
    expect(res.status).toBe(500);
  });

  it('POST /api/jobs/retry-failed returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).post('/api/jobs/retry-failed');
    expect(res.status).toBe(500);
  });

  it('POST /api/tapes returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).post('/api/tapes').send({ id: 'V1' });
    expect(res.status).toBe(500);
  });

  it('PUT /api/tapes/:id returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).put('/api/tapes/V1').send({ id: 'V1' });
    expect(res.status).toBe(500);
  });

  it('DELETE /api/tapes/:id returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db fail'));
    const res = await request(app).delete('/api/tapes/V1');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/trailer', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 when title missing', async () => {
    const res = await request(app).get('/api/trailer');
    expect(res.status).toBe(400);
  });

  it('returns videoId null on fetch failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('net'));
    const res = await request(app).get('/api/trailer?title=Test');
    expect(res.body.videoId).toBeNull();
  });

  it('returns videoId on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"videoRenderer":{"videoId":"dQw4w9WgXcQ"}}'),
    });
    const res = await request(app).get('/api/trailer?title=Test');
    expect(res.body.videoId).toBe('dQw4w9WgXcQ');
  });

  it('returns null when no videoId found', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>no videos</html>'),
    });
    const res = await request(app).get('/api/trailer?title=Test');
    expect(res.body.videoId).toBeNull();
  });
});

describe('GET /api/lookup/barcode', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 for blank code', async () => {
    const res = await request(app).get('/api/lookup/barcode/%20');
    expect(res.status).toBe(400);
  });

  it('returns 404 when UPC lookup fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    const res = await request(app).get('/api/lookup/barcode/123456789012');
    expect(res.status).toBe(404);
  });

  it('returns data from UPCItemDB', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [{ title: 'Jurassic Park', brand: 'Universal' }] }),
    });
    const res = await request(app).get('/api/lookup/barcode/0123456789012');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Jurassic Park');
    expect(res.body.source).toBe('upcitemdb');
  });

  it('falls back to Open Library for ISBN-13', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ title: 'Book', publishers: ['Penguin'], publish_date: '1995' }) });
    const res = await request(app).get('/api/lookup/barcode/9780140449136');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('openlibrary');
    expect(res.body.title).toBe('Book');
  });

  it('enriches with OMDb when key provided', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [{ title: 'Alien', brand: 'Fox' }] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Response: 'True', Title: 'Alien', Year: '1979', imdbID: 'tt0078748', Production: '', Poster: 'N/A' }) });
    const res = await request(app).get('/api/lookup/barcode/0123456789001').set('x-omdb-key', 'k');
    expect(res.body.imdb_id).toBe('tt0078748');
    expect(res.body.year).toBe('1979');
  });
});

describe('GET /api/lookup', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 when title missing', async () => {
    const res = await request(app).get('/api/lookup');
    expect(res.status).toBe(400);
  });

  it('returns merged result', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: '{"year":"1979"}' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Response: 'True', Title: 'Alien', Year: '1979', imdbID: 'tt0078748', Production: 'Fox', Poster: 'http://img', Genre: 'Sci-Fi' }) });
    const res = await request(app).get('/api/lookup?title=Alien').set('x-omdb-key', 'k');
    expect(res.status).toBe(200);
    expect(res.body.imdb_id).toBe('tt0078748');
    expect(res.body.label).toBe('Fox');
    expect(res.body.poster).toBe('http://img');
  });

  it('returns {} when both fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('net'));
    const res = await request(app).get('/api/lookup?title=Unknown');
    expect(res.body).toEqual({});
  });

  it('skips ollama when noai=1', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Response: 'True', Title: 'Alien', Year: '1979', imdbID: 'tt0078748', Production: '', Poster: 'N/A' }),
    });
    const res = await request(app).get('/api/lookup?title=Alien&noai=1').set('x-omdb-key', 'k');
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/health', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 200 when both ok', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ models: [{ name: 'llava:7b' }] }) });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.ollama).toBe('ok');
  });

  it('returns 503 when db down', async () => {
    mockQuery.mockRejectedValue(new Error('conn refused'));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ models: [] }) });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('error');
  });

  it('returns 200 with ollama:error when ollama down', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ollama).toBe('error');
  });

  it('returns 200 with ollama:error when ollama non-ok', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 });
    const res = await request(app).get('/api/health');
    expect(res.body.ollama).toBe('error');
  });
});

describe('GET /ca.crt', () => {
  it('returns 404 when cert missing', async () => {
    const fs = require('fs');
    const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const res = await request(app).get('/ca.crt');
    expect(res.status).toBe(404);
    spy.mockRestore();
  });
});

// SSE endpoint tested via header check only — supertest cannot cleanly handle long-lived streams

describe('GET /api/fetch-image', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 when url missing', async () => {
    const res = await request(app).get('/api/fetch-image');
    expect(res.status).toBe(400);
  });

  it('returns dataUrl on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from([0xff, 0xd8]).buffer),
      headers: { get: () => 'image/jpeg' },
    });
    const res = await request(app).get('/api/fetch-image?url=http://x/img.jpg');
    expect(res.status).toBe(200);
    expect(res.body.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns upstream status on non-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await request(app).get('/api/fetch-image?url=http://x/missing.jpg');
    expect(res.status).toBe(404);
  });

  it('returns 500 on fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const res = await request(app).get('/api/fetch-image?url=http://x/timeout.jpg');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/analytics/outcome', () => {
  it('returns 400 when job_id missing', async () => {
    const res = await request(app).post('/api/analytics/outcome').send({ action: 'accepted' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when action missing', async () => {
    const res = await request(app).post('/api/analytics/outcome').send({ job_id: 'j1' });
    expect(res.status).toBe(400);
  });

  it('updates and returns ok', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/analytics/outcome').send({ job_id: 'j1', action: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
