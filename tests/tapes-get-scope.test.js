'use strict';

const mockQuery = jest.fn();
jest.mock('../src/modules/db', () => ({ pool: { query: (...a) => mockQuery(...a) } }));

function load(enabled, localOpen = !enabled) {
  jest.resetModules();
  jest.doMock('../src/modules/auth', () => ({ ENABLED: enabled, LOCAL_OPEN: localOpen }));
  return require('../src/modules/routes/tapes').tapesGetHandler;
}

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => mockQuery.mockReset());

describe('tapesGetHandler scoping', () => {
  it('returns an empty list when auth is not configured and open mode is not opted in', async () => {
    const handler = load(false, false);
    const res = mockRes();
    await handler({}, res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns an empty list and never queries when auth is enabled and the caller is anonymous', async () => {
    const handler = load(true);
    const res = mockRes();
    await handler({}, res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('scopes to the signed-in user when auth is enabled', async () => {
    const handler = load(true);
    mockQuery.mockResolvedValue({ rows: [{ data: { id: 'T1' } }] });
    const res = mockRes();
    await handler({ user: { sub: 'u1' } }, res);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('owner_id = $1'), ['u1']);
    expect(res.json).toHaveBeenCalledWith([{ id: 'T1' }]);
  });

  it('returns all tapes when auth is disabled', async () => {
    const handler = load(false);
    mockQuery.mockResolvedValue({ rows: [{ data: { id: 'T1' } }, { data: { id: 'T2' } }] });
    const res = mockRes();
    await handler({}, res);
    expect(mockQuery.mock.calls[0][0]).not.toContain('owner_id');
    expect(res.json).toHaveBeenCalledWith([{ id: 'T1' }, { id: 'T2' }]);
  });
});
