'use strict';
// GET /api/vision/backends + backend selection carried from the UI to the job.

const request = require('supertest');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({ createProxyMiddleware: () => (_q, _s, next) => next() }));

const mockCallOllamaServer = jest.fn();
const mockPingOllama = jest.fn();
const mockResolveOllamaUrl = jest.fn();
jest.mock('../src/modules/ollama', () => ({
  callOllamaServer: (...args) => mockCallOllamaServer(...args),
  pingOllama: (...args) => mockPingOllama(...args),
  resolveOllamaUrl: (...args) => mockResolveOllamaUrl(...args),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
delete process.env.VISION_BACKEND;
delete process.env.OLLAMA_UPSTREAM;
['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET'].forEach(k => delete process.env[k]);

const vision = require('../src/modules/vision');
const { app } = require('../src/server.js');
const { VISION_DAILY_CAP, WORKERS_AI_MODEL, OLLAMA_MODEL } = require('../src/modules/config');

const realFetch = global.fetch;

function setAi() { globalThis.__CF_ENV = { AI: { run: jest.fn() } }; }
function usageRow(scans) { mockQuery.mockResolvedValue({ rows: [{ scans, neurons_est: 0 }] }); }
function ollamaUp(models) {
  mockResolveOllamaUrl.mockResolvedValue('http://ollama:11434');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: models.map(name => ({ name })) }) });
}
function ollamaDown() {
  mockResolveOllamaUrl.mockResolvedValue('http://ollama:11434');
  global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockCallOllamaServer.mockReset();
  mockPingOllama.mockReset().mockResolvedValue(false);
  mockResolveOllamaUrl.mockReset();
  delete globalThis.__CF_ENV;
  delete process.env.VISION_BACKEND;
  delete process.env.OLLAMA_UPSTREAM;
  vision.resetVisionStateForTests();
});
afterAll(() => { global.fetch = realFetch; delete globalThis.__CF_ENV; });

describe('getVisionBackends', () => {
  it('reports Workers AI available with remaining daily scans on Cloudflare', async () => {
    setAi();
    usageRow(12);
    global.fetch = jest.fn(); // must not probe Ollama without OLLAMA_UPSTREAM on Cloudflare
    const out = await vision.getVisionBackends();
    const wai = out.backends.find(b => b.id === 'workers-ai');
    expect(wai).toMatchObject({ available: true, status: 'ok', model: WORKERS_AI_MODEL, scansToday: 12, scanCap: VISION_DAILY_CAP, remaining: VISION_DAILY_CAP - 12 });
    expect(out.backends.find(b => b.id === 'ollama')).toMatchObject({ available: false, configured: false });
    expect(out.backends.find(b => b.id === 'manual')).toMatchObject({ available: true });
    expect(out.default).toBe('workers-ai');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('marks Workers AI capped and falls back to Ollama when reachable', async () => {
    setAi();
    process.env.OLLAMA_UPSTREAM = 'http://gpu-box:11434';
    usageRow(VISION_DAILY_CAP);
    ollamaUp(['llava:7b', 'moondream:latest']);
    const out = await vision.getVisionBackends();
    expect(out.backends.find(b => b.id === 'workers-ai')).toMatchObject({ available: false, status: 'capped', remaining: 0 });
    expect(out.backends.find(b => b.id === 'ollama')).toMatchObject({ available: true, models: ['llava:7b', 'moondream:latest'] });
    expect(out.default).toBe('ollama');
  });

  it('defaults to manual review when no AI backend can run', async () => {
    ollamaDown();
    const out = await vision.getVisionBackends();
    expect(out.backends.find(b => b.id === 'workers-ai')).toMatchObject({ available: false, status: 'unavailable' });
    expect(out.backends.find(b => b.id === 'ollama')).toMatchObject({ available: false, status: 'unreachable' });
    expect(out.default).toBe('manual');
  });

  it('flags a reachable Ollama that is missing the default model', async () => {
    ollamaUp(['qwen2.5vl:3b']);
    const out = await vision.getVisionBackends();
    const o = out.backends.find(b => b.id === 'ollama');
    expect(o.available).toBe(true);
    expect(o.reason).toMatch(new RegExp(OLLAMA_MODEL));
  });
});

describe('recognizeTapes with a chosen backend', () => {
  it('manual skips every AI call', async () => {
    setAi();
    const out = await vision.recognizeTapes('b64', { backend: 'manual' });
    expect(out).toMatchObject({ backend: 'manual', deferred: 'manual', items: [] });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockCallOllamaServer).not.toHaveBeenCalled();
  });

  it('ollama uses the chosen model even when Workers AI is the server default', async () => {
    setAi();
    mockCallOllamaServer.mockResolvedValue([{ title: 'Alien' }]);
    const out = await vision.recognizeTapes('b64', { backend: 'ollama', model: 'moondream' });
    expect(mockCallOllamaServer).toHaveBeenCalledWith('b64', 'moondream');
    expect(out).toMatchObject({ backend: 'ollama', model: 'moondream' });
  });

  it('ignores unsafe model names', async () => {
    mockCallOllamaServer.mockResolvedValue([]);
    await vision.recognizeTapes('b64', { backend: 'ollama', model: 'x"; rm -rf /' });
    expect(mockCallOllamaServer).toHaveBeenCalledWith('b64', OLLAMA_MODEL);
  });

  it('workers-ai overrides VISION_BACKEND=ollama when chosen explicitly', async () => {
    process.env.VISION_BACKEND = 'ollama';
    const run = jest.fn(async (_m, payload) => (payload.image ? { response: '[{"title":"Heat"}]' } : { response: 'ok' }));
    globalThis.__CF_ENV = { AI: { run } };
    mockQuery.mockResolvedValue({ rows: [{ scans: 1 }] });
    const out = await vision.recognizeTapes(Buffer.from('img').toString('base64'), { backend: 'workers-ai' });
    expect(out).toMatchObject({ backend: 'workers-ai', items: [{ title: 'Heat' }] });
    expect(mockCallOllamaServer).not.toHaveBeenCalled();
  });

  it('normalizes backend and model input', () => {
    expect(vision.normalizeBackend(' Workers-AI ')).toBe('workers-ai');
    expect(vision.normalizeBackend('claude')).toBeNull();
    expect(vision.normalizeModel('llava:13b')).toBe('llava:13b');
    expect(vision.normalizeModel('bad model')).toBeNull();
  });
});

describe('HTTP', () => {
  it('GET /api/vision/backends returns availability without auth', async () => {
    setAi();
    usageRow(3);
    const res = await request(app).get('/api/vision/backends');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.default).toBe('workers-ai');
    expect(res.body.backends.map(b => b.id)).toEqual(['workers-ai', 'ollama', 'manual']);
  });

  it('POST /api/jobs stores the image, thumb, chosen backend and model in real columns', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/jobs').send({ image: 'abc', thumb: 'data:image/jpeg;base64,t', backend: 'ollama', model: 'moondream' });
    expect(res.status).toBe(201);
    expect(res.body.backend).toBe('ollama');
    const [sql, params] = mockQuery.mock.calls[0];
    const cols = sql.match(/upload_jobs\(([^)]*)\)/)[1].split(',');
    expect(cols).toEqual(['id', 'image_data', 'thumb', 'status', 'created_at', 'updated_at', 'owner_id', 'vision_backend', 'vision_model']);
    const row = Object.fromEntries(cols.map((c, i) => [c, params[i]]));
    expect(row).toMatchObject({ image_data: 'abc', thumb: 'data:image/jpeg;base64,t', status: 'pending', vision_backend: 'ollama', vision_model: 'moondream' });
    expect(row.updated_at).toBe(row.created_at);
  });

  it('POST /api/jobs defaults to auto and drops a model for non-Ollama backends', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    let res = await request(app).post('/api/jobs').send({ image: 'abc' });
    expect(res.body.backend).toBe('auto');
    expect(mockQuery.mock.calls[0][1].slice(-2)).toEqual([null, null]);
    mockQuery.mockClear();
    res = await request(app).post('/api/jobs').send({ image: 'abc', backend: 'workers-ai', model: 'llava:7b' });
    expect(mockQuery.mock.calls[0][1].slice(-2)).toEqual(['workers-ai', null]);
  });

  it('POST /api/jobs rejects an unknown backend', async () => {
    const res = await request(app).post('/api/jobs').send({ image: 'abc', backend: 'gpt' });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('migration 010', () => {
  it('adds the vision_backend and vision_model columns used by POST /api/jobs', () => {
    const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'migrations', '010_upload_job_backend.sql'), 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS vision_backend TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS vision_model TEXT/);
  });
});

describe('auto resolution matches discovery', () => {
  it('uses Workers AI when VISION_BACKEND=ollama but Ollama is down and the AI binding exists', async () => {
    process.env.VISION_BACKEND = 'ollama';
    setAi();
    mockPingOllama.mockResolvedValue(false);
    await expect(vision.resolveAutoBackend()).resolves.toBe('workers-ai');
  });

  it('keeps Ollama when it is the preference and reachable', async () => {
    process.env.VISION_BACKEND = 'ollama';
    setAi();
    mockPingOllama.mockResolvedValue(true);
    await expect(vision.resolveAutoBackend()).resolves.toBe('ollama');
  });

  it('keeps Ollama off Cloudflare (no binding to fall back to)', async () => {
    mockPingOllama.mockResolvedValue(false);
    await expect(vision.resolveAutoBackend()).resolves.toBe('ollama');
  });
});
