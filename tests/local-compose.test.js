'use strict';

const fs = require('fs');
const path = require('path');

const compose = fs.readFileSync(path.join(__dirname, '..', 'config', 'docker-compose.yml'), 'utf8');

function loadAuth(env) {
  jest.resetModules();
  const saved = { ...process.env };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.AUTH_DISABLED;
  Object.assign(process.env, env);
  const auth = require('../src/modules/auth');
  process.env = saved;
  return auth;
}

function run(mw, headers) {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  mw({ headers }, res, next);
  return { res, next };
}

describe('open single-user mode stays local', () => {
  it.each(['cf-ray', 'cf-connecting-ip'])('refuses requests carrying %s', header => {
    const { refuseTunneledOpenMode } = loadAuth({ AUTH_DISABLED: '1' });
    const { res, next } = run(refuseTunneledOpenMode, { [header]: 'x' });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows direct local requests', () => {
    const { refuseTunneledOpenMode } = loadAuth({ AUTH_DISABLED: '1' });
    expect(run(refuseTunneledOpenMode, {}).next).toHaveBeenCalled();
  });

  it('does nothing when open mode is off', () => {
    const { refuseTunneledOpenMode } = loadAuth({});
    expect(run(refuseTunneledOpenMode, { 'cf-ray': 'x' }).next).toHaveBeenCalled();
  });
});

describe('ollama proxy request', () => {
  it('drops the browser Origin header', () => {
    const { forwardToOllama } = require('../src/modules/routes/system');
    const proxyReq = { removeHeader: jest.fn() };
    forwardToOllama(proxyReq, {});
    expect(proxyReq.removeHeader).toHaveBeenCalledWith('origin');
  });
});

describe('docker compose defaults', () => {
  it('keeps the tunnel behind a profile', () => {
    expect(compose).toMatch(/cloudflared:\r?\n\s+image: .*\r?\n\s+profiles: \[tunnel\]/);
  });

  it('publishes every port on loopback unless BIND_ADDR is set', () => {
    const ports = compose.match(/^\s+- ".*:\d+"\s*$/gm);
    expect(ports.length).toBeGreaterThanOrEqual(4);
    for (const p of ports) expect(p).toMatch(/"(127\.0\.0\.1|\$\{BIND_ADDR:-127\.0\.0\.1\}):/);
  });

  it('has no inline database password or wildcard origins', () => {
    expect(compose).toMatch(/POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?/);
    expect(compose).not.toContain('OLLAMA_ORIGINS=*');
  });
});
