// ── GOOGLE OAUTH + JWT ─────────────────────────────────────────────────────────
'use strict';

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, JWT_SECRET, APP_BASE_URL } = require('./config');
const REDIRECT_URI  = `${APP_BASE_URL}/auth/google/callback`;

let ENABLED = !!(CLIENT_ID && CLIENT_SECRET);

// Without OAuth configured, protected routes are refused unless the operator
// explicitly opts in to open single-user mode (local development).
const LOCAL_OPEN = !ENABLED && process.env.NODE_ENV !== 'production' && /^(1|true|yes)$/i.test((process.env.AUTH_DISABLED || '').trim());


if (ENABLED && !JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set when auth is enabled');
  process.exit(1);
}

function makeClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

function getAuthUrl(state) {
  if (typeof state !== 'string' || !state) {
    throw new Error('State parameter is required');
  }
  return makeClient().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
}

async function exchangeCode(code) {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error('Invalid ID token payload');
  }
  return payload; // { sub, email, name, picture, ... }
}

function isValidOAuthState(state, cookieState) {
  return typeof state === 'string' && state.length > 0 &&
    typeof cookieState === 'string' && cookieState.length > 0 &&
    state === cookieState;
}

function mintJWT(payload) {
  // codeql[js/clear-text-storage-of-sensitive-data] JWT is stored in an HttpOnly cookie — not accessible to JS or plain-text storage
  return jwt.sign(
    { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyJWT(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function setAuthCookie(res, token) {
  const secure = APP_BASE_URL.startsWith('https://');
  res.cookie('vhs_token', token, { ...COOKIE_OPTS, secure }); // codeql[js/clear-text-storage-of-sensitive-data] JWT stored in HttpOnly cookie — not plain-text storage
}

function clearAuthCookie(res) {
  res.clearCookie('vhs_token', { path: '/' });
}

// ── Middleware ─────────────────────────────────────────────────────────────────

// Always runs; sets req.user if a valid JWT is present. Never rejects.
function optionalAuth(req, res, next) {
  if (!ENABLED) return next();
  const token = req.cookies?.vhs_token;
  if (token) req.user = verifyJWT(token) || undefined;
  next();
}

// Rejects with 401 when auth is enabled and no valid session exists.
// Fails closed (503) when OAuth is not configured, unless AUTH_DISABLED=1
// opts in to open single-user mode. Independent of NODE_ENV.
function requireAuth(req, res, next) {
  if (!ENABLED) {
    if (LOCAL_OPEN) return next();
    return res.status(503).json({ error: 'auth not configured' });
  }
  if (!req.user) return res.status(401).json({ error: 'not authenticated' });
  next();
}

// Open single-user mode is for local use only: refuse anything that arrived
// through a Cloudflare tunnel or edge (those requests carry cf-* headers).
function refuseTunneledOpenMode(req, res, next) {
  if (LOCAL_OPEN && (req.headers['cf-ray'] || req.headers['cf-connecting-ip'])) {
    return res.status(503).json({ error: 'open mode is local only: configure sign-in to use a tunnel' });
  }
  next();
}

if (LOCAL_OPEN) {
  console.warn('WARNING: sign-in is off (open single-user mode). Keep this instance on this machine or a trusted network.');
}

module.exports = {
  refuseTunneledOpenMode,
  ENABLED,
  LOCAL_OPEN,
  getAuthUrl,
  exchangeCode,
  isValidOAuthState,
  mintJWT,
  verifyJWT,
  setAuthCookie,
  clearAuthCookie,
  optionalAuth,
  requireAuth,
};
