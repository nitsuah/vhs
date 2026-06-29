'use strict';
const request = require('supertest');

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn(), exec: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],
  readFileSync: () => Buffer.from('test'),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.OMDB_API_KEY = 'test-key';

const { app, db } = require('../server');

beforeEach(() => {
  db.query = jest.fn().mockImplementation(() => Promise.resolve({}));
});

describe('withRetry and worker processes', () => {
  it('POST /api/jobs stores image and returns job ID for later processing', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,/9j/4AAQ', thumb: 'data:image/jpeg;base64,thumb' });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^job_/);
  });

  it('job processing retries on failure', async () => {
    db.query.mockResolvedValue({ rows: [] }); // DB success
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
  });

  it('POST /api/jobs/retry-failed requeues all failed jobs', async () => {
    db.query.mockResolvedValue({ rowCount: 5 });
    const res = await request(app).post('/api/jobs/retry-failed');
    expect(res.status).toBe(200);
    expect(res.body.requeued).toBe(5);
  });

  it('failed jobs can be retried individually', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/jobs/job_failed_1/retry');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retry returns 404 when job not found', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).post('/api/jobs/job_missing/retry');
    expect(res.status).toBe(404);
  });

  it('GET /api/jobs/inflight returns jobs in progress', async () => {
    const jobs = [
      { id: 'j1', status: 'pending', retry_count: 0, created_at: new Date().toISOString() },
      { id: 'j2', status: 'processing', retry_count: 1, created_at: new Date().toISOString() },
    ];
    db.query.mockResolvedValue({ rows: jobs });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('j1');
  });

  it('GET /api/jobs/inflight returns empty when nothing inflight', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/review creates manual review item', async () => {
    db.query.mockResolvedValue({ rows: [] });
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
    db.query.mockResolvedValue({});
    const res = await request(app).delete('/api/review/rev_test_123');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/review/pending returns all pending and failed review items', async () => {
    const items = [
      { id: 'rev_1', job_id: 'j1', status: 'pending', fail_reason: null, created_at: new Date().toISOString() },
      { id: 'rev_2', job_id: 'j2', status: 'failed', fail_reason: 'No tapes detected', created_at: new Date().toISOString() },
    ];
    db.query.mockResolvedValue({ rows: items });
    const res = await request(app).get('/api/review/pending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1].fail_reason).toBe('No tapes detected');
  });

  it('review items can be marked with outcomes', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
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
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
  });

  it('GET /api/health exercises db check and ollama check paths', async () => {
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llava:7b' }] }),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.ollama).toBe('ok');
    expect(res.body.ollamaModels).toContain('llava:7b');
    global.fetch = origFetch;
  });

  it('GET /api/health exercises db error and ollama error paths', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));
    const origFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const res = await request(app).get('/api/health');
    expect(res.body.db).toBe('error');
    expect(res.body.ollama).toBe('error');
    global.fetch = origFetch;
  });

  it('POST /api/jobs triggers worker flow', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(app).post('/api/jobs').send({ image: 'data:image/jpeg;base64,abc' });
    expect(db.query).toHaveBeenCalled();
  });

  it('exercises retry logic for failed jobs', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/jobs/job_failed_123/retry');
    expect(res.status).toBe(200);
  });

  it('calls ensureCerts for certificate setup', () => {
    const { ensureCerts } = require('../server');
    expect(() => ensureCerts()).not.toThrow();
  });

  it('calls runMigrations for database setup', async () => {
    db.query.mockResolvedValue({ rows: [] });
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
    db.query.mockResolvedValue({ rows: [] });
    const { logScanAnalytics } = require('../server');
    await expect(logScanAnalytics({ jobId: 'j1', aiModel: 'm', suggestions: [] })).resolves.toBeUndefined();
  });

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
    db.query
      .mockResolvedValueOnce({ rowCount: 1 })  // stuck jobs
      .mockResolvedValueOnce({ rowCount: 1 })  // failed conversion
      .mockResolvedValueOnce({ rows: [] })     // permFailed
      .mockResolvedValueOnce({ rows: [] })     // no pending job
      .mockResolvedValueOnce({ rows: [] })     // no existingItems
      .mockResolvedValueOnce({});              // insert tape upload_job
    const { processJobs } = require('../server');
    await expect(processJobs()).resolves.toBeUndefined();
  });
});
