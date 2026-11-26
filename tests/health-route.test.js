'use strict';
const request = require('supertest');

const mockPoolQuery = jest.fn();
jest.mock('../src/modules/db', () => ({ pool: { query: (...a) => mockPoolQuery(...a) } }));

const mockLogActivity = jest.fn();
jest.mock('../src/modules/activity-log', () => ({ logActivity: (...a) => mockLogActivity(...a) }));

const mockResolveOllamaUrl = jest.fn();
jest.mock('../src/modules/ollama', () => ({ resolveOllamaUrl: (...a) => mockResolveOllamaUrl(...a) }));

const mockGetAiBinding = jest.fn();
const mockGetUsageToday = jest.fn();
const mockResolveBackend = jest.fn();
jest.mock('../src/modules/vision', () => ({
  getAiBinding: (...a) => mockGetAiBinding(...a),
  getUsageToday: (...a) => mockGetUsageToday(...a),
  resolveBackend: (...a) => mockResolveBackend(...a),
}));

const mockConfig = { WORKERS_AI_MODEL: '@cf/meta/llama-3.2-11b-vision-instruct', OLLAMA_MODEL: 'llava:7b', VISION_DAILY_CAP: 200 };
jest.mock('../src/modules/config', () => mockConfig);

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
delete process.env.OLLAMA_UPSTREAM;
delete process.env.VISION_BACKEND;
['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET'].forEach(k => delete process.env[k]);

const realFetch = global.fetch;
let app;

beforeAll(async () => {
  global.fetch = jest.fn();
  require('../src/modules/routes/health');
  ({ app } = require('../src/server.js'));
});

beforeEach(() => {
  [mockPoolQuery, mockLogActivity, mockResolveOllamaUrl, mockGetAiBinding, mockGetUsageToday, mockResolveBackend, global.fetch].forEach(m => m.mockReset());
  delete process.env.OLLAMA_UPSTREAM;
  delete process.env.VISION_BACKEND;
});

afterAll(() => { global.fetch = realFetch; });

describe('GET /api/health', () => {
  const req = () => request(app).get('/api/health');

  it('200: db ok, ollama not configured, workers-ai ok', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockGetAiBinding.mockReturnValue({ run: jest.fn() });
    mockGetUsageToday.mockResolvedValue({ scansToday: 5, neuronsEst: 100, scanCap: 200, atCap: false });
    mockResolveBackend.mockReturnValue('workers-ai');

    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok', db: 'ok', ollama: 'not configured',
      vision: { backend: 'workers-ai', model: mockConfig.WORKERS_AI_MODEL, workersAi: 'ok', ollama: 'not configured', scansToday: 5, scanCap: 200 },
      ts: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('ollamaModels');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('503: db fails', async () => {
    mockPoolQuery.mockRejectedValue(new Error('connection refused'));
    mockGetAiBinding.mockReturnValue(null);
    mockGetUsageToday.mockResolvedValue({ scansToday: 0, neuronsEst: 0, scanCap: 200, atCap: false });
    mockResolveBackend.mockReturnValue('ollama');
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await req();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'error', db: 'error', ollama: 'error',
      vision: { backend: 'ollama', model: mockConfig.OLLAMA_MODEL, workersAi: 'unavailable', ollama: 'error', ollamaModels: [], scansToday: 0, scanCap: 200 },
    });
  });

  it('200: ollama ok with models when OLLAMA_UPSTREAM set', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    process.env.OLLAMA_UPSTREAM = 'http://ollama:11434';
    mockGetAiBinding.mockReturnValue(null);
    mockGetUsageToday.mockResolvedValue({ scansToday: 0, neuronsEst: 0, scanCap: 200, atCap: false });
    mockResolveBackend.mockReturnValue('ollama');
    mockResolveOllamaUrl.mockResolvedValue('http://ollama:11434');
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'llava:7b' }, { name: 'moondream:latest' }] }) });

    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok', db: 'ok', ollama: 'ok', ollamaModels: ['llava:7b', 'moondream:latest'],
      vision: { backend: 'ollama', model: mockConfig.OLLAMA_MODEL, workersAi: 'unavailable', ollama: 'ok', ollamaModels: ['llava:7b', 'moondream:latest'], scansToday: 0, scanCap: 200 },
    });
    expect(global.fetch).toHaveBeenCalledWith('http://ollama:11434/api/tags', { signal: expect.any(AbortSignal) });
  });

  it('200: ollama error when fetch fails', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    process.env.OLLAMA_UPSTREAM = 'http://ollama:11434';
    mockGetAiBinding.mockReturnValue(null);
    mockGetUsageToday.mockResolvedValue({ scansToday: 0, neuronsEst: 0, scanCap: 200, atCap: false });
    mockResolveBackend.mockReturnValue('ollama');
    mockResolveOllamaUrl.mockResolvedValue('http://ollama:11434');
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok', db: 'ok', ollama: 'error', ollamaModels: [],
      vision: { backend: 'ollama', model: mockConfig.OLLAMA_MODEL, workersAi: 'unavailable', ollama: 'error', ollamaModels: [], scansToday: 0, scanCap: 200 },
    });
  });

  it('200: workers-ai capped at usage cap', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockGetAiBinding.mockReturnValue({ run: jest.fn() });
    mockGetUsageToday.mockResolvedValue({ scansToday: 200, neuronsEst: 8000, scanCap: 200, atCap: true });
    mockResolveBackend.mockReturnValue('workers-ai');

    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok', db: 'ok', ollama: 'not configured',
      vision: { backend: 'workers-ai', model: mockConfig.WORKERS_AI_MODEL, workersAi: 'capped', ollama: 'not configured', scansToday: 200, scanCap: 200 },
    });
    expect(res.body).not.toHaveProperty('ollamaModels');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});