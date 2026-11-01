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

// Keep the real lookup functions as defaults for existing GET tests; proposal
// route tests override these module-level references without live providers.
jest.mock('../src/modules/omdb', () => {
  const actual = jest.requireActual('../src/modules/omdb');
  return { ...actual, enhancedLookup: jest.fn(actual.enhancedLookup) };
});
jest.mock('../src/modules/tmdb', () => {
  const actual = jest.requireActual('../src/modules/tmdb');
  return { ...actual, tmdbLookup: jest.fn(actual.tmdbLookup) };
});
jest.mock('../src/modules/ollama', () => {
  const actual = jest.requireActual('../src/modules/ollama');
  return { ...actual, resolveOllamaUrl: jest.fn(actual.resolveOllamaUrl) };
});

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.FETCH_IMAGE_HOST_ALLOWLIST = 'example.com';
const { app } = require('../src/server.js');
const { enhancedLookup } = require('../src/modules/omdb');
const { tmdbLookup } = require('../src/modules/tmdb');
const { resolveOllamaUrl } = require('../src/modules/ollama');
const actualEnhancedLookup = jest.requireActual('../src/modules/omdb').enhancedLookup;
const actualTmdbLookup = jest.requireActual('../src/modules/tmdb').tmdbLookup;
const actualResolveOllamaUrl = jest.requireActual('../src/modules/ollama').resolveOllamaUrl;

beforeEach(() => {
  mockQuery.mockReset();
  enhancedLookup.mockClear();
  tmdbLookup.mockClear();
  resolveOllamaUrl.mockClear();
  enhancedLookup.mockImplementation(actualEnhancedLookup);
  tmdbLookup.mockImplementation(actualTmdbLookup);
  resolveOllamaUrl.mockImplementation(actualResolveOllamaUrl);
});

// ── Tapes ─────────────────────────────────────────────────────────────────────

describe('GET /api/tapes', () => {
  it('returns array of tape data objects', async () => {
    mockQuery.mockResolvedValue({ rows: [{ data: { id: 'VHS-0001', title: 'Jaws' } }] });
    const res = await request(app).get('/api/tapes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'VHS-0001', title: 'Jaws' }]);
  });

  it('returns 500 on db error without leaking the raw error message', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/api/tapes');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal server error');
    expect(res.body.error).not.toMatch(/connection refused/);
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

// ── Analytics outcome ─────────────────────────────────────────────────────────

describe('POST /api/analytics/outcome', () => {
  it('returns 400 when job_id or action is missing', async () => {
    const r1 = await request(app).post('/api/analytics/outcome').send({ action: 'accepted' });
    expect(r1.status).toBe(400);

    const r2 = await request(app).post('/api/analytics/outcome').send({ job_id: 'job_1' });
    expect(r2.status).toBe(400);
  });

  it('updates scan_analytics and returns {ok:true}', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/analytics/outcome').send({
      job_id: 'job_1',
      action: 'accepted',
      final_title: 'Jaws',
      final_year: '1975',
      final_label: 'Universal',
      imdb_id: 'tt0073195',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('records corrected action when user changed the AI title', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await request(app).post('/api/analytics/outcome').send({
      job_id: 'job_2',
      action: 'corrected',
      final_title: 'Ghostbusters',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── Barcode lookup ────────────────────────────────────────────────────────────

describe('GET /api/lookup/barcode/:code', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 for blank code', async () => {
    const res = await request(app).get('/api/lookup/barcode/%20');
    expect(res.status).toBe(400);
  });

  it('returns title from UPCItemDB when found', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [{ title: 'Jurassic Park', brand: 'Universal' }] }),
    });
    const res = await request(app).get('/api/lookup/barcode/0123456789012');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Jurassic Park');
    expect(res.body.source).toBe('upcitemdb');
  });

  it('returns 404 when neither UPCItemDB nor Open Library finds the code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    const res = await request(app).get('/api/lookup/barcode/0000000000000');
    expect(res.status).toBe(404);
  });

  it('falls back to Open Library for ISBN-13 codes', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })  // UPCItemDB miss
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ title: 'Some Book', publishers: ['Penguin'], publish_date: '1995' }) }); // Open Library hit
    const res = await request(app).get('/api/lookup/barcode/9780140449136');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('openlibrary');
    expect(res.body.title).toBe('Some Book');
  });

  it('enriches with OMDb when API key header is provided', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [{ title: 'Alien', brand: 'Fox' }] }) })  // UPCItemDB
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Response: 'True', Title: 'Alien', Year: '1979', imdbID: 'tt0078748', Production: '', Poster: 'https://example.com/alien.jpg' }) }); // OMDb
    const res = await request(app)
      .get('/api/lookup/barcode/0123456789001')
      .set('x-omdb-key', 'testkey');
    expect(res.status).toBe(200);
    expect(res.body.imdb_id).toBe('tt0078748');
    expect(res.body.year).toBe('1979');
  });
});

// ── Metadata lookup ───────────────────────────────────────────────────────────

describe('GET /api/lookup', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).get('/api/lookup');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title required/);
  });

  it('returns merged Ollama + OMDb result', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: '{"year":"1979","label":"Fox","value_low":"5","value_high":"20"}' }),
      })  // Ollama
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Response: 'True', Title: 'Alien', Year: '1979', imdbID: 'tt0078748', Production: 'Brandywine', Poster: 'https://example.com/alien.jpg' }),
      }); // OMDb
    const res = await request(app)
      .get('/api/lookup?title=Alien')
      .set('x-omdb-key', 'testkey');
    expect(res.status).toBe(200);
    expect(res.body.imdb_id).toBe('tt0078748');
    expect(res.body.year).toBe('1979');
    expect(res.body.poster).toBe('https://example.com/alien.jpg');
  });

  it('omits poster when OMDb returns N/A', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: '{}' }) })  // Ollama
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Response: 'True', Title: 'Ghost', Year: '1990', imdbID: 'tt0099653', Production: '', Poster: 'N/A' }) }); // OMDb
    const res = await request(app)
      .get('/api/lookup?title=Ghost')
      .set('x-omdb-key', 'testkey');
    expect(res.status).toBe(200);
    expect(res.body.imdb_id).toBe('tt0099653');
    expect(res.body.poster).toBeUndefined();
  });

  it('reports why, instead of an empty object, when both Ollama and OMDb fail', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    const res = await request(app).get('/api/lookup?title=Unknown');
    expect(res.status).toBe(200);
    expect(res.body.error).toBe('no_metadata_found');
    expect(res.body.reasons.ollama).toBe('unreachable');
  });
});

// ── Proposal-only Fill API ────────────────────────────────────────────────────

describe('POST /api/fill/proposals', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  const tape = {
    label: 'Alien',
    year: 'Unknown',
    format: 'VHS',
    value_low: '',
    value_high: '',
    imdb_id: 'tt0078748'
  };

  it('rejects unsupported fields, invalid provider values, and non-boolean noai', async () => {
    const unsupportedBody = await request(app).post('/api/fill/proposals').send({
      tape: { ...tape, apiKey: 'secret' }
    });
    expect(unsupportedBody.status).toBe(400);

    const invalidTape = await request(app).post('/api/fill/proposals').send({ tape: [] });
    expect(invalidTape.status).toBe(400);

    const missingLabel = await request(app).post('/api/fill/proposals').send({
      tape: { year: '1979' }
    });
    expect(missingLabel.status).toBe(400);

    const unsupportedTopLevel = await request(app).post('/api/fill/proposals').send({
      tape,
      omdbKey: 'secret'
    });
    expect(unsupportedTopLevel.status).toBe(400);

    const invalidProvider = await request(app).post('/api/fill/proposals').send({
      tape,
      provider: 'imdb'
    });
    expect(invalidProvider.status).toBe(400);

    const invalidNoai = await request(app).post('/api/fill/proposals').send({
      tape,
      noai: 'true'
    });
    expect(invalidNoai.status).toBe(400);
  });

  it('returns OMDb and Ollama proposals without mutating tapes or review items', async () => {
    enhancedLookup.mockResolvedValueOnce({
      title: 'Alien',
      year: '1979',
      label: 'Brandywine',
      imdb_id: 'tt0078748',
      source: 'omdb_exact'
    });
    resolveOllamaUrl.mockResolvedValueOnce('http://ollama');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: '{"format":"VHS","value_low":"5","value_high":"20"}'
      })
    });

    const res = await request(app)
      .post('/api/fill/proposals')
      .set('x-omdb-key', 'test-omdb-key')
      .send({ tape });

    expect(res.status).toBe(200);
    expect(res.body.partialFailures).toEqual({});
    expect(res.body.proposals.map((proposal) => proposal.field)).toEqual(['year', 'value_low', 'value_high']);
    expect(res.body.proposals.every((proposal) => proposal.confidence === 'verified')).toBe(true);
    expect(enhancedLookup).toHaveBeenCalledWith({ title: 'Alien' }, 'test-omdb-key');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('supports TMDb with noai and reports Ollama as skipped', async () => {
    tmdbLookup.mockResolvedValueOnce({
      title: 'Alien',
      year: '1979',
      imdb_id: 'tt0078748',
      source: 'tmdb_search'
    });

    const res = await request(app)
      .post('/api/fill/proposals')
      .set('x-tmdb-key', 'test-tmdb-key')
      .send({ tape, provider: 'tmdb', noai: true });

    expect(res.status).toBe(200);
    expect(res.body.partialFailures).toEqual({ ollama: 'skipped' });
    expect(res.body.proposals).toMatchObject([
      { field: 'year', value: '1979', confidence: 'verified' }
    ]);
    expect(tmdbLookup).toHaveBeenCalledWith({ title: 'Alien' }, 'test-tmdb-key');
    expect(resolveOllamaUrl).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns fixed failure codes and never exposes raw provider errors', async () => {
    enhancedLookup.mockRejectedValueOnce(new Error('provider key secret'));
    resolveOllamaUrl.mockResolvedValueOnce('http://ollama');
    global.fetch = jest.fn().mockRejectedValue(new TypeError('network secret'));

    const res = await request(app)
      .post('/api/fill/proposals')
      .set('x-omdb-key', 'test-omdb-key')
      .send({ tape });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      proposals: [],
      partialFailures: { omdb: 'provider_error', ollama: 'unreachable' }
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns safe no-configuration and skipped codes when no candidate is available', async () => {
    const res = await request(app)
      .post('/api/fill/proposals')
      .send({ tape, noai: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      proposals: [],
      partialFailures: { omdb: 'not_configured', ollama: 'skipped' }
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ── Image proxy ───────────────────────────────────────────────────────────────

describe('GET /api/fetch-image', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  it('returns 400 when url param is missing', async () => {
    const res = await request(app).get('/api/fetch-image');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url required/);
  });

  it('fetches remote image and returns base64 dataUrl', async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // minimal JPEG magic bytes
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeJpeg.buffer),
      headers: { get: () => 'image/jpeg' },
    });
    const res = await request(app).get('/api/fetch-image?url=https://example.com/poster.jpg');
    expect(res.status).toBe(200);
    expect(res.body.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns 404 when upstream image returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: () => Promise.resolve(Buffer.alloc(0).buffer),
      headers: { get: () => null },
    });
    const res = await request(app).get('/api/fetch-image?url=https://example.com/missing.jpg');
    expect(res.status).toBe(404);
  });

  it('returns 500 when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const res = await request(app).get('/api/fetch-image?url=https://example.com/timeout.jpg');
    expect(res.status).toBe(500);
  });
});

// ── Job deletion + retry-failed ───────────────────────────────────────────────

describe('DELETE /api/jobs/:id', () => {
  it('deletes a job and returns {ok:true}', async () => {
    mockQuery.mockResolvedValue({});
    const res = await request(app).delete('/api/jobs/job_1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/jobs/retry-failed', () => {
  it('resets all failed jobs to pending and returns count', async () => {
    mockQuery.mockResolvedValue({ rowCount: 3 });
    const res = await request(app).post('/api/jobs/retry-failed');
    expect(res.status).toBe(200);
    expect(res.body.requeued).toBe(3);
  });

  it('returns 0 when no failed jobs exist', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).post('/api/jobs/retry-failed');
    expect(res.status).toBe(200);
    expect(res.body.requeued).toBe(0);
  });
});

// ── Activity log ──────────────────────────────────────────────────────────────

describe('GET /api/logs', () => {
  it('returns the activity log array', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
