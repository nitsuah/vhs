const { describe, expect, it } = require('@jest/globals');
const { isPrivateAddress } = require('../src/modules/ip-guard');

const PRIVATE = [
  '127.0.0.1', '0.0.0.0', '10.1.2.3', '100.64.0.1', '100.127.255.255', '169.254.169.254',
  '172.16.0.1', '172.31.255.255', '192.168.1.1', '198.18.0.1', '198.19.0.1', '224.0.0.1',
  '255.255.255.255', '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0',
  '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::10.0.0.1', '64:ff9b::7f00:1',
];
const PUBLIC = [
  '8.8.8.8', '1.1.1.1', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1',
  '198.17.0.1', '198.20.0.1', '223.255.255.255', '2606:4700:4700::1111',
  '2001:4860:4860::8888', '::ffff:8.8.8.8',
];
const UNPARSEABLE = ['', undefined, null, 'not-an-ip', '256.1.1.1', '1.2.3', '1.2.3.4.5', '12345::', ':::', '1::2::3', '::g'];

describe('isPrivateAddress', () => {
  it.each(PRIVATE)('treats %s as private', (addr) => {
    expect(isPrivateAddress(addr)).toBe(true);
  });

  it.each(PUBLIC)('treats %s as public', (addr) => {
    expect(isPrivateAddress(addr)).toBe(false);
  });

  it.each(UNPARSEABLE)('fails closed for %p', (addr) => {
    expect(isPrivateAddress(addr)).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isPrivateAddress('  8.8.8.8  ')).toBe(false);
    expect(isPrivateAddress(' 10.0.0.1 ')).toBe(true);
  });
});
