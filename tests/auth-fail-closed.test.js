'use strict';

const BASE_ENV = { ...process.env };

function loadAuth(env) {
  jest.resetModules();
  process.env = { ...BASE_ENV };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.AUTH_DISABLED;
  Object.assign(process.env, env);
  return require('../src/modules/auth');
}

function run(mw, req = {}) {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  mw(req, res, next);
  return { res, next };
}

afterAll(() => { process.env = BASE_ENV; });

describe('requireAuth without OAuth configured', () => {
  it('refuses with 503 by default, even outside production', () => {
    const { requireAuth } = loadAuth({ NODE_ENV: 'development' });
    const { res, next } = run(requireAuth);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses with 503 in production', () => {
    const { requireAuth } = loadAuth({ NODE_ENV: 'production' });
    expect(run(requireAuth).res.status).toHaveBeenCalledWith(503);
  });

  it('passes through only with the explicit AUTH_DISABLED opt-in', () => {
    const { requireAuth, LOCAL_OPEN } = loadAuth({ AUTH_DISABLED: '1' });
    expect(LOCAL_OPEN).toBe(true);
    expect(run(requireAuth).next).toHaveBeenCalled();
  });
});

describe('requireAuth with OAuth configured', () => {
  const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', JWT_SECRET: 'j', AUTH_DISABLED: '1' };
  it('ignores AUTH_DISABLED and still requires a session', () => {
    const { requireAuth, LOCAL_OPEN } = loadAuth(env);
    expect(LOCAL_OPEN).toBe(false);
    expect(run(requireAuth).res.status).toHaveBeenCalledWith(401);
    expect(run(requireAuth, { user: { sub: 'u' } }).next).toHaveBeenCalled();
  });
});

describe('production never opens', () => {
  it('ignores AUTH_DISABLED when NODE_ENV=production', () => {
    const { requireAuth, LOCAL_OPEN } = loadAuth({ NODE_ENV: 'production', AUTH_DISABLED: '1' });
    expect(LOCAL_OPEN).toBe(false);
    expect(run(requireAuth).res.status).toHaveBeenCalledWith(503);
  });
});
