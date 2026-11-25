const { afterEach, beforeEach, describe, expect, it, jest } = require('@jest/globals');

describe('activity log', () => {
  let api, limit, originalLog, originalWarn;
  beforeEach(() => {
    originalLog = console.log;
    originalWarn = console.warn;
    jest.isolateModules(() => {
      api = require('../src/modules/activity-log');
      ({ LOG_LIMIT: limit } = require('../src/modules/config'));
    });
  });
  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });
  it('records entries and returns a defensive copy', () => {
    api.logActivity('info', 'hello');
    const entries = api.getActivityLog();
    expect(entries[0]).toMatchObject({ level: 'info', msg: 'hello' });
    expect(Number.isNaN(Date.parse(entries[0].ts))).toBe(false);
    entries.pop();
    expect(api.getActivityLog()).toHaveLength(1);
  });
  it('keeps only the newest LOG_LIMIT entries', () => {
    for (let i = 0; i < limit + 5; i++) api.logActivity('info', String(i));
    const entries = api.getActivityLog();
    expect(entries).toHaveLength(limit);
    expect(entries[0].msg).toBe('5');
    expect(entries.at(-1).msg).toBe(String(limit + 4));
  });
  it('sends SSE lines to clients and isolates write failures', () => {
    const write = jest.fn();
    api.getLogClients().add({ write });
    api.getLogClients().add({ write: () => { throw Error('closed'); } });
    expect(() => api.logActivity('info', 'hello')).not.toThrow();
    const line = write.mock.calls[0][0];
    expect(line).toMatch(/^data: .*\n\n$/);
    expect(JSON.parse(line.slice(6).trim()).msg).toBe('hello');
  });
  it('clears registered clients', () => {
    api.getLogClients().add({ write: jest.fn() });
    api.clearLogClients();
    expect(api.getLogClients().size).toBe(0);
  });
});
