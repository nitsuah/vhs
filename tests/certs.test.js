const { afterEach, beforeEach, describe, expect, it } = require('@jest/globals');

// Load a fresh copy of the module with mocked fs/child_process/config.
function load(hostIp = '') {
  jest.resetModules();
  jest.doMock('child_process', () => ({ execSync: jest.fn() }));
  jest.doMock('fs', () => ({ existsSync: jest.fn(), mkdirSync: jest.fn(), writeFileSync: jest.fn() }));
  jest.doMock('../src/modules/config', () => ({ CERT_DIR: '/certs', HOST_IP: hostIp }));
  const fs = require('fs');
  const { execSync } = require('child_process');
  const { ensureCerts } = require('../src/modules/certs');
  return { fs, execSync, ensureCerts };
}

describe('ensureCerts', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('child_process');
    jest.dontMock('fs');
    jest.dontMock('../src/modules/config');
  });

  it('reuses existing certs without generating anything', () => {
    const { fs, execSync, ensureCerts } = load();
    fs.existsSync.mockReturnValue(true);
    ensureCerts();
    expect(fs.existsSync).toHaveBeenCalledTimes(3);
    expect(execSync).not.toHaveBeenCalled();
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('generates certs when one file is missing', () => {
    const { fs, execSync, ensureCerts } = load();
    fs.existsSync.mockImplementation((p) => !p.endsWith('ca.crt'));
    ensureCerts();
    expect(fs.mkdirSync).toHaveBeenCalledWith('/certs', { recursive: true });
    const commands = execSync.mock.calls.map((c) => c[0]);
    expect(commands).toHaveLength(5);
    expect(commands[0]).toMatch(/^openssl genrsa .*ca\.key/);
    expect(commands[1]).toMatch(/^openssl req -new -x509 .*ca\.crt/);
    expect(commands[2]).toMatch(/^openssl genrsa .*server\.key/);
    expect(commands[3]).toMatch(/^openssl req -new -key .*server\.csr/);
    expect(commands[4]).toMatch(/^openssl x509 -req .*server\.crt/);
  });

  it('adds only localhost SANs when HOST_IP is empty', () => {
    const { fs, ensureCerts } = load('');
    fs.existsSync.mockReturnValue(false);
    ensureCerts();
    const [file, body] = fs.writeFileSync.mock.calls[0];
    expect(file).toMatch(/ext\.cnf$/);
    expect(body).toContain('subjectAltName=DNS:localhost,IP:127.0.0.1\n');
    expect(body).not.toContain('192.168');
  });

  it('appends HOST_IP to the SANs', () => {
    const { fs, ensureCerts } = load('192.168.1.5');
    fs.existsSync.mockReturnValue(false);
    ensureCerts();
    const body = fs.writeFileSync.mock.calls[0][1];
    expect(body).toContain('subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.5\n');
  });

  it('lets an openssl failure propagate', () => {
    const { fs, execSync, ensureCerts } = load();
    fs.existsSync.mockReturnValue(false);
    execSync.mockImplementation(() => { throw new Error('openssl missing'); });
    expect(() => ensureCerts()).toThrow('openssl missing');
  });
});
