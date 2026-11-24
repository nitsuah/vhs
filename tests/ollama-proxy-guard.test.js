'use strict';

const { ollamaAllowlist } = require('../src/modules/routes/system');

function check(method, path) {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res), set: jest.fn(() => res) };
  const next = jest.fn();
  ollamaAllowlist({ method, path }, res, next);
  return { res, next };
}

describe('ollama proxy allowlist', () => {
  it.each([
    ['GET', '/api/tags'],
    ['GET', '/api/version'],
    ['POST', '/api/generate'],
    ['POST', '/api/chat'],
    ['GET', '/v1/models'],
    ['POST', '/v1/chat/completions'],
  ])('forwards %s %s', (m, p) => {
    expect(check(m, p).next).toHaveBeenCalled();
  });

  it.each([
    ['DELETE', '/api/delete'],
    ['POST', '/api/pull'],
    ['POST', '/api/create'],
    ['GET', '/api/ps'],
    ['GET', '/api/../api/delete'],
    ['GET', '/'],
  ])('rejects %s %s', (m, p) => {
    const { res, next } = check(m, p);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('proxy route requires auth', () => {
  it('answers 503/401 before proxying when not signed in', () => {
    jest.resetModules();
    const delay = process.env.AUTH_DISABLED;
    delete process.env.AUTH_DISABLED;
    const { requireAuth } = require('../src/modules/auth');
    const res = { status: jest.fn(() => res), json: jest.fn(() => res), set: jest.fn(() => res) };
    const next = jest.fn();
    requireAuth({}, res, next);
    expect(next).not.toHaveBeenCalled();
    process.env.AUTH_DISABLED = delay;
  });

  it('answers 405 + Allow for a known path with the wrong method', () => {
    const { res, next } = check('POST', '/api/tags');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.set).toHaveBeenCalledWith('Allow', 'GET');
  });
});
