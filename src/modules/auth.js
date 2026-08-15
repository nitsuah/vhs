// ── GOOGLE OAUTH + JWT ─────────────────────────────────────────────────────────
'use strict';

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, JWT_SECRET, APP_BASE_URL } = require('./config');
const REDIRECT_URI  = `${APP_BASE_URL}/auth/google/callback`;

const ENABLED = !!(CLIENT_ID && CLIENT_SECRET);

if (ENABLED && !JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set when auth is enabled');
  process.exit(1);
}

function makeClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

function getAuthUrl(state) {
  return makeClient().generateAuthUrl({
    access_type: 'offline',
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
  return ticket.getPayload(); // { sub, email, name, picture, ... }
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
function requireAuth(req, res, next) {
  if (!ENABLED) return next();
  if (!req.user) return res.status(401).json({ error: 'not authenticated' });
  next();
}

module.exports = {
  ENABLED,
  getAuthUrl,
  exchangeCode,
  mintJWT,
  verifyJWT,
  setAuthCookie,
  clearAuthCookie,
  optionalAuth,
  requireAuth,
};
