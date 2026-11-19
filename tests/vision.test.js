('use strict');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const mockCallOllamaServer = jest.fn();
const mockPingOllama = jest.fn();
jest.mock('../src/modules/ollama', () => ({
  callOllamaServer: (...args) => mockCallOllamaServer(...args),
  pingOllama: (...args) => mockPingOllama(...args),
  resolveOllamaUrl: jest.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
delete process.env.VISION_BACKEND;

const {
  resolveBackend,
  getAiBinding,
  textFromAiResult,
  itemsFromAiText,
  neuronsFromUsage,
  isLicenseError,
  isLicenseAccepted,
  toImageBytes,
  recognizeTapes,
  CAP_MESSAGE,
  resetVisionStateForTests,
} = require('../src/modules/vision');
const { VISION_DAILY_CAP, WORKERS_AI_MODEL, NEURONS_PER_SCAN_EST } = require('../src/modules/config');

function setAi(runImpl) {
  globalThis.__CF_ENV = { AI: { run: runImpl || jest.fn() } };
}

function clearAi() {
  delete globalThis.__CF_ENV;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockCallOllamaServer.mockReset();
  mockPingOllama.mockReset().mockResolvedValue(false);
  clearAi();
  delete process.env.VISION_BACKEND;
  resetVisionStateForTests();
});

describe('resolveBackend', () => {
  it('defaults to ollama when no AI binding is present', () => {
    expect(resolveBackend()).toBe('ollama');
    expect(getAiBinding()).toBe(null);
  });

  it('defaults to workers-ai when the Cloudflare AI binding is present', () => {
    setAi();
    expect(resolveBackend()).toBe('workers-ai');
    expect(getAiBinding()).toBeTruthy();
  });

  it('honors an explicit VISION_BACKEND override', () => {
    setAi();
    process.env.VISION_BACKEND = 'ollama';
    expect(resolveBackend()).toBe('ollama');
    process.env.VISION_BACKEND = 'workers-ai';
    clearAi();
    expect(resolveBackend()).toBe('workers-ai');
  });
});

describe('helpers', () => {
  it('strips a data-URL prefix and decodes base64 into bytes', () => {
    const bytes = toImageBytes('data:image/jpeg;base64,SVdT'); // "IWS"
    expect(Buffer.from(bytes).toString('utf8')).toBe('IWS');
  });

  it('reads response text from several Workers AI envelopes', () => {
    expect(textFromAiResult('plain')).toBe('plain');
    expect(textFromAiResult({ response: 'from-response' })).toBe('from-response');
    expect(textFromAiResult({ result: { response: 'nested' } })).toBe('nested');
  });

  it('accepts a single JSON object response, not only an array', () => {
    const envelope = {
      result: {
        response: { title: 'Akira', year: '1988', label: 'Streamline', format: 'VHS', confidence: 'high' },
        usage: { prompt_tokens: 1689, completion_tokens: 26, neurons: 9.048 },
      },
      success: true,
    };
    const items = itemsFromAiText(textFromAiResult(envelope));
    expect(items).toEqual([expect.objectContaining({ title: 'Akira', label: 'Streamline' })]);
  });

  it('prefers an API-reported neuron count when present', () => {
    expect(neuronsFromUsage({ neurons: 9.048, input_tokens: 1689, output_tokens: 26 })).toBeCloseTo(9.048, 3);
  });

  it('estimates neurons from token usage, falling back to the safe default', () => {
    expect(neuronsFromUsage(null)).toBe(NEURONS_PER_SCAN_EST);
    const neu = neuronsFromUsage({ input_tokens: 2500, output_tokens: 200 });
    // 2500*4410 + 200*61493 per million ≈ 23.32
    expect(neu).toBeCloseTo(23.3236, 3);
  });

  it('detects Meta license errors and the 403 "thank you for agreeing" success', () => {
    expect(isLicenseError(new Error('Please agree to the Meta license'))).toBe(true);
    expect(isLicenseError(new Error('model overloaded'))).toBe(false);
    const accepted = new Error('AiError: Model Agreement: Thank you for agreeing to this model\'s terms. You may now use the model. (uuid)');
    expect(isLicenseAccepted(accepted)).toBe(true);
    expect(isLicenseError(accepted)).toBe(false);
  });

  it('treats the official agree 403 as a completed license handshake', async () => {
    const run = jest.fn()
      .mockRejectedValueOnce(new Error('Thank you for agreeing to this model\'s terms. You may now use the model.'))
      .mockResolvedValueOnce({
        response: '[{"title":"Akira","format":"VHS","confidence":"high"}]',
      });
    setAi(run);
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ scans: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await recognizeTapes(Buffer.from('img').toString('base64'));
    expect(result.items[0].title).toBe('Akira');
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1]).toEqual({ prompt: 'agree' });
  });

  it('uses a conservative daily cap under 10k neurons', () => {
    expect(VISION_DAILY_CAP).toBe(200);
    expect(VISION_DAILY_CAP * NEURONS_PER_SCAN_EST).toBeLessThanOrEqual(8000);
  });
});

describe('recognizeTapes', () => {
  it('uses Ollama when that backend is selected', async () => {
    process.env.VISION_BACKEND = 'ollama';
    mockCallOllamaServer.mockResolvedValue([{ title: 'Jaws' }]);
    const result = await recognizeTapes('b64');
    expect(result).toMatchObject({ items: [{ title: 'Jaws' }], backend: 'ollama', deferred: null });
    expect(mockCallOllamaServer).toHaveBeenCalledWith('b64', 'llava:7b');
  });

  it('returns a deferred cap result when the daily reserve is rejected and Ollama is down', async () => {
    setAi(jest.fn());
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery.mockResolvedValueOnce({ rows: [] }); // reserve: no row → cap
    mockPingOllama.mockResolvedValue(false);
    const result = await recognizeTapes('b64');
    expect(result.deferred).toBe('cap');
    expect(result.message).toBe(CAP_MESSAGE);
    expect(result.items).toEqual([]);
  });

  it('falls back to Ollama when the daily cap is hit and Ollama is reachable', async () => {
    setAi(jest.fn());
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery.mockResolvedValueOnce({ rows: [] }); // cap
    mockPingOllama.mockResolvedValue(true);
    mockCallOllamaServer.mockResolvedValue([{ title: 'Akira' }]);
    const result = await recognizeTapes('b64');
    expect(result).toMatchObject({ backend: 'ollama', fallback: 'cap', items: [{ title: 'Akira' }], deferred: null });
  });

  it('runs Workers AI, agrees to the Meta license first, and parses the JSON array', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ response: 'acknowledged' }) // license agree
      .mockResolvedValueOnce({
        response: '[{"title":"Akira","year":"1988","label":"Streamline","format":"VHS","confidence":"high"}]',
        usage: { prompt_tokens: 2500, completion_tokens: 80 },
      });
    setAi(run);
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ scans: 1 }] }) // reserve
      .mockResolvedValueOnce({ rows: [] }); // record neurons
    const result = await recognizeTapes(Buffer.from('fakeimg').toString('base64'));
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][0]).toBe(WORKERS_AI_MODEL);
    expect(run.mock.calls[0][1]).toEqual({ prompt: 'agree' });
    expect(run.mock.calls[1][1].prompt).toMatch(/cataloging VHS tapes/);
    expect(run.mock.calls[1][1].image).toBe(`data:image/jpeg;base64,${Buffer.from('fakeimg').toString('base64')}`);
    expect(result).toMatchObject({
      backend: 'workers-ai',
      deferred: null,
      items: [expect.objectContaining({ title: 'Akira', label: 'Streamline' })],
    });
  });

  it('retries after a license error on the vision call', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ response: 'ok' }) // first agree
      .mockRejectedValueOnce(new Error('You must agree to the Meta license'))
      .mockResolvedValueOnce({ response: 'ok' }) // re-agree
      .mockResolvedValueOnce({ response: '[{"title":"Jaws","format":"VHS","confidence":"high"}]' });
    setAi(run);
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ scans: 2 }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await recognizeTapes('SVdT');
    expect(result.items[0].title).toBe('Jaws');
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('falls back to Ollama when Workers AI throws and Ollama is up', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ response: 'ok' })
      .mockRejectedValueOnce(new Error('model overloaded'));
    setAi(run);
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ scans: 3 }] }) // reserve
      .mockResolvedValueOnce({ rows: [] }); // release
    mockPingOllama.mockResolvedValue(true);
    mockCallOllamaServer.mockResolvedValue([{ title: 'Tron' }]);
    const result = await recognizeTapes('b64');
    expect(result).toMatchObject({ backend: 'ollama', fallback: 'error', items: [{ title: 'Tron' }] });
  });

  it('defers to manual review when Workers AI throws and Ollama is down', async () => {
    const run = jest.fn()
      .mockResolvedValueOnce({ response: 'ok' })
      .mockRejectedValueOnce(new Error('model overloaded'));
    setAi(run);
    process.env.VISION_BACKEND = 'workers-ai';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ scans: 3 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockPingOllama.mockResolvedValue(false);
    const result = await recognizeTapes('b64');
    expect(result.deferred).toBe('error');
    expect(result.message).toMatch(/model overloaded/);
    expect(result.message).toMatch(/manual review/);
  });
});
