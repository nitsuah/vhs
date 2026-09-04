'use strict';

// Unit tests for src/modules/auth.js (34% line coverage previously — the
// module's ENABLED flag is computed once at require time from env vars, so
// each scenario below resets the module registry and re-requires it under
// the env it needs to exercise both the auth-enabled and auth-disabled paths.

const mockGenerateAuthUrl = jest.fn(() => 'https://accounts.google.com/o/oauth2/auth?mock=1');
const mockGetToken = jest.fn();
const mockSetCredentials = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    setCredentials: mockSetCredentials,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

const BASE_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...BASE_ENV };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.JWT_SECRET;
  delete process.env.APP_BASE_URL;
}

function freshAuth() {
  jest.resetModules();
  return require('../src/modules/auth');
}

beforeEach(() => {
  resetEnv();
  mockGenerateAuthUrl.mockClear();
  mockGetToken.mockReset();
  mockSetCredentials.mockReset();
  mockVerifyIdToken.mockReset();
});

afterAll(() => { process.env = BASE_ENV; });

describe('auth disabled (no Google client configured)', () => {
  it('ENABLED is false', () => {
    const auth = freshAuth();
    expect(auth.ENABLED).toBe(false);
  });

  it('optionalAuth calls next() without setting req.user', () => {
    const auth = freshAuth();
    const req = {};
    const next = jest.fn();
    auth.optionalAuth(req, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('requireAuth is a no-op — always calls next()', () => {
    const auth = freshAuth();
    const next = jest.fn();
    const res = { status: jest.fn(() => res), json: jest.fn() };
    auth.requireAuth({}, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('auth enabled (Google client + JWT_SECRET configured)', () => {
  function enable() {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.JWT_SECRET = 'test-secret-at-least-this-long';
    process.env.APP_BASE_URL = 'http://localhost:8080';
    return freshAuth();
  }

  it('ENABLED is true', () => {
    expect(enable().ENABLED).toBe(true);
  });

  it('getAuthUrl builds a Google OAuth URL carrying the given state', () => {
    const auth = enable();
    const url = auth.getAuthUrl('state-123');
    expect(url).toContain('accounts.google.com');
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'state-123', scope: ['openid', 'email', 'profile'] })
    );
  });

  it('exchangeCode swaps a code for tokens and returns the ID payload', async () => {
    const auth = enable();
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'u1', email: 'a@b.com', name: 'A', picture: 'http://pic' }),
    });
    const payload = await auth.exchangeCode('authcode');
    expect(mockGetToken).toHaveBeenCalledWith('authcode');
    expect(mockSetCredentials).toHaveBeenCalledWith({ id_token: 'idtok' });
    expect(payload).toEqual({ sub: 'u1', email: 'a@b.com', name: 'A', picture: 'http://pic' });
  });

  it('mintJWT + verifyJWT round-trip the payload', () => {
    const auth = enable();
    const token = auth.mintJWT({ sub: 'u1', email: 'a@b.com', name: 'A', picture: 'p' });
    const decoded = auth.verifyJWT(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.email).toBe('a@b.com');
  });

  it('verifyJWT returns null for a garbage token instead of throwing', () => {
    const auth = enable();
    expect(auth.verifyJWT('not-a-real-token')).toBeNull();
  });

  it('setAuthCookie sets vhs_token as HttpOnly/SameSite=lax, non-secure on http:// base URL', () => {
    const auth = enable();
    const res = { cookie: jest.fn() };
    auth.setAuthCookie(res, 'jwt-value');
    expect(res.cookie).toHaveBeenCalledWith(
      'vhs_token',
      'jwt-value',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: false })
    );
  });

  it('setAuthCookie marks the cookie secure when APP_BASE_URL is https://', () => {
    jest.resetModules();
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.JWT_SECRET = 'test-secret-at-least-this-long';
    process.env.APP_BASE_URL = 'https://vhs.example.com';
    const auth = require('../src/modules/auth');
    const res = { cookie: jest.fn() };
    auth.setAuthCookie(res, 'jwt-value');
    expect(res.cookie).toHaveBeenCalledWith('vhs_token', 'jwt-value', expect.objectContaining({ secure: true }));
  });

  it('clearAuthCookie clears vhs_token', () => {
    const auth = enable();
    const res = { clearCookie: jest.fn() };
    auth.clearAuthCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith('vhs_token', { path: '/' });
  });

  it('optionalAuth sets req.user from a valid cookie', () => {
    const auth = enable();
    const token = auth.mintJWT({ sub: 'u1', email: 'a@b.com' });
    const req = { cookies: { vhs_token: token } };
    const next = jest.fn();
    auth.optionalAuth(req, {}, next);
    expect(req.user.sub).toBe('u1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('optionalAuth sets req.user to undefined for an invalid cookie', () => {
    const auth = enable();
    const req = { cookies: { vhs_token: 'garbage' } };
    const next = jest.fn();
    auth.optionalAuth(req, {}, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('optionalAuth leaves req.user unset when no cookie is present', () => {
    const auth = enable();
    const req = { cookies: {} };
    const next = jest.fn();
    auth.optionalAuth(req, {}, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('requireAuth rejects with 401 when req.user is absent', () => {
    const auth = enable();
    const next = jest.fn();
    const res = { status: jest.fn(() => res), json: jest.fn() };
    auth.requireAuth({}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'not authenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAuth calls next() when req.user is present', () => {
    const auth = enable();
    const next = jest.fn();
    const res = { status: jest.fn(() => res), json: jest.fn() };
    auth.requireAuth({ user: { sub: 'u1' } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('startup guard', () => {
  it('exits the process when auth is enabled but JWT_SECRET is empty', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    // JWT_SECRET intentionally left unset.
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    freshAuth();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/JWT_SECRET/));
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
