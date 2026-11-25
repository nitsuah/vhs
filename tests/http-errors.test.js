const { serverError } = require('../src/modules/http-errors');

describe('serverError', () => {
  test('response never contains the error text', () => {
    const err = new Error('relation "tapes" does not exist');
    const jsonFn = jest.fn().mockReturnValue('json-return');
    const res = { status: jest.fn().mockReturnValue({ json: jsonFn }) };

    const result = serverError(res, err);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith({ error: 'internal server error' });
    expect(result).toBe('json-return');
  });

  test('console.error receives the error message', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('relation "tapes" does not exist');
    const res = { status: jest.fn().mockReturnValue({ json: jest.fn() }) };

    serverError(res, err);

    expect(spy).toHaveBeenCalledWith('Request failed:', 'relation "tapes" does not exist');
    spy.mockRestore();
  });

  test('null/undefined err does not throw', () => {
    const res = { status: jest.fn().mockReturnValue({ json: jest.fn() }) };

    let threw = false;
    try { serverError(res, null); } catch { threw = true; }
    expect(threw).toBe(false);

    threw = false;
    try { serverError(res, undefined); } catch { threw = true; }
    expect(threw).toBe(false);
  });

  test('return value is what json returned', () => {
    const jsonReturn = { ok: true };
    const jsonFn = jest.fn().mockReturnValue(jsonReturn);
    const res = { status: jest.fn().mockReturnValue({ json: jsonFn }) };

    const result = serverError(res, new Error('test'));

    expect(result).toBe(jsonReturn);
  });
});
