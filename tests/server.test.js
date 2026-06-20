'use strict';
const request = require('supertest');

// Must mock pg and http-proxy-middleware before requiring server.js
const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
// Prevent openssl/fs calls during test load
jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],        // no migrations to run in tests
  readFileSync: () => Buffer.from('test'),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
const { app } = require('../server');

beforeEach(() => mockQuery.mockReset());

// ── Tapes ─────────────────────────────────────────────────────────────────────

describe('GET /api/tapes', () => {
  it('returns array of tape data objects', async () => {
    mockQuery.mockResolvedValue({ rows: [{ data: { id: 'VHS-0001', title: 'Jaws' } }] });
    const res = await request(app).get('/api/tapes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'VHS-0001', title: 'Jaws' }]);
  });

  it('returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/api/tapes');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/connection refused/);
  });
});

describe('POST /api/tapes', () => {
  it('inserts tape and returns 201 with the tape', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const tape = { id: 'VHS-0002', title: 'Alien', scanned_at: new Date().toISOString() };
    const res = await request(app).post('/api/tapes').send(tape);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('VHS-0002');
  });
});

describe('PUT /api/tapes/:id', () => {
  it('returns 404 when tape does not exist', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).put('/api/tapes/VHS-9999').send({ id: 'VHS-9999', title: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 200 with updated tape when tape exists', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const tape = { id: 'VHS-0001', title: 'Updated' };
    const res = await request(app).put('/api/tapes/VHS-0001').send(tape);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
  });
});

describe('DELETE /api/tapes/:id', () => {
  it('returns {ok:true} on success', async () => {
    mockQuery.mockResolvedValue({});
    const res = await request(app).delete('/api/tapes/VHS-0001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

describe('POST /api/jobs', () => {
  it('returns 400 when image is missing', async () => {
    const res = await request(app).post('/api/jobs').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image required/);
  });

  it('returns 201 with job id when image provided', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/jobs').send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^job_/);
  });
});

describe('GET /api/jobs/status', () => {
  // Regression: this route was shadowed by GET /api/jobs/:id — must return counts not a job
  it('returns status counts object with review_pending, not a job record', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { status: 'pending', count: '3' },
        { status: 'done', count: '7' },
      ],
    });
    const res = await request(app).get('/api/jobs/status');
    expect(res.status).toBe(200);
    // Must include all job statuses plus review_pending from review_items table
    expect(res.body).toMatchObject({ pending: 3, processing: 0, done: 7, failed: 0 });
    expect(res.body).toHaveProperty('review_pending');
    // Confirm it is NOT treating 'status' as a job id
    expect(res.body).not.toHaveProperty('retry_count');
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 404 for unknown job id', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/jobs/job_unknown');
    expect(res.status).toBe(404);
  });

  it('returns job record for known id', async () => {
    const job = { id: 'job_1', status: 'done', result: '[{"title":"Jaws"}]', error: null, retry_count: 0 };
    mockQuery.mockResolvedValue({ rows: [job] });
    const res = await request(app).get('/api/jobs/job_1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });
});

// ── Review items (cross-session queue) ────────────────────────────────────────

describe('GET /api/review/pending', () => {
  it('returns pending review items', async () => {
    const items = [
      { id: 'rev_1', job_id: 'job_1', data: { title: 'Jaws', condition: 'good' }, thumb: null, source: 'scan', status: 'pending', fail_reason: null, created_at: new Date().toISOString() },
    ];
    mockQuery.mockResolvedValue({ rows: items });
    const res = await request(app).get('/api/review/pending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('rev_1');
    expect(res.body[0].status).toBe('pending');
  });

  it('returns failed review items alongside pending', async () => {
    const items = [
      { id: 'rev_2', job_id: 'job_2', data: {}, thumb: null, source: 'scan', status: 'failed', fail_reason: 'Ollama timeout', created_at: new Date().toISOString() },
    ];
    mockQuery.mockResolvedValue({ rows: items });
    const res = await request(app).get('/api/review/pending');
    expect(res.status).toBe(200);
    expect(res.body[0].fail_reason).toBe('Ollama timeout');
  });

  it('returns 500 on db error', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/review/pending');
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/review/:id', () => {
  it('deletes a review item and returns {ok:true}', async () => {
    mockQuery.mockResolvedValue({});
    const res = await request(app).delete('/api/review/rev_1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/review', () => {
  it('returns 400 when data is missing', async () => {
    const res = await request(app).post('/api/review').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/data required/);
  });

  it('creates a fill review item and returns 201 with id', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/review').send({
      source: 'fill',
      data: { tape_id: 'VHS-0001', title: 'Jaws', year: '1975' },
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^rev_/);
  });

  it('creates a revalidate review item and returns 201 with id', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/review').send({
      source: 'revalidate',
      data: { tape_id: 'VHS-0002', title: 'Alien', year: '1979' },
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^rev_/);
  });
});

// GET /api/jobs/ready is now a compatibility stub that always returns []
describe('GET /api/jobs/ready', () => {
  it('returns empty array (jobs now flow through review_items)', async () => {
    const res = await request(app).get('/api/jobs/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── In-flight jobs (queue durability) ─────────────────────────────────────────

describe('GET /api/jobs/inflight', () => {
  it('returns pending and processing jobs with id and thumb', async () => {
    const jobs = [
      { id: 'job_p', thumb: null, created_at: new Date().toISOString() },
      { id: 'job_q', thumb: null, created_at: new Date().toISOString() },
    ];
    mockQuery.mockResolvedValue({ rows: jobs });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('job_p');
  });

  it('returns empty array when no inflight jobs', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── Job retry ─────────────────────────────────────────────────────────────────

describe('POST /api/jobs/:id/retry', () => {
  it('resets failed job to pending and returns {ok:true}', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/jobs/job_2/retry');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 when job id does not exist', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).post('/api/jobs/job_unknown/retry');
    expect(res.status).toBe(404);
  });
});

// ── Health / reliability ───────────────────────────────────────────────────────

describe('GET /api/health', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 200 with db:ok and ollama:ok when both healthy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llava:7b' }] }),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.ollama).toBe('ok');
    expect(res.body.ollamaModels).toContain('llava:7b');
  });

  it('returns 503 with db:error when database is down', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('error');
  });

  it('returns 200 with ollama:error when Ollama is unreachable', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.ollama).toBe('error');
  });
});
