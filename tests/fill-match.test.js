'use strict';
const { scoreCandidate } = require('../src/modules/fill-match');

describe('scoreCandidate', () => {
  test('verified via imdb_id match', () => {
    const tape = { label: 'Orion', imdb_id: 'tt0088763' };
    const candidate = { title: 'Something else', imdb_id: 'tt0088763' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('verified');
    expect(res.score).toBe(1);
    expect(res.reasons).toContain('imdb_id match');
  });

  test('verified via barcode match', () => {
    const tape = { label: 'Orion', barcode: '012345678905' };
    const candidate = { title: 'Orion', barcode: '012345678905' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('verified');
    expect(res.score).toBe(1);
    expect(res.reasons).toContain('barcode match');
  });

  test('identifier mismatch: imdb_id mismatch', () => {
    const tape = { label: 'Orion', year: '1989', format: 'VHS', imdb_id: 'tt0088763' };
    const candidate = { title: 'Orion', year: '1989', format: 'VHS', imdb_id: 'tt0000001' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('low');
    expect(res.score).toBe(0);
    expect(res.reasons).toContain('imdb_id mismatch');
  });

  test('ambiguous remake: year mismatch', () => {
    const tape = { label: 'The Thing', year: '1982', format: 'VHS' };
    const candidate = { title: 'The Thing', year: '2011', format: 'VHS' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('low');
    expect(res.reasons).toContain('year mismatch');
  });

  test('wrong year', () => {
    const tape = { label: 'Orion', year: '1989', format: 'VHS' };
    const candidate = { title: 'Orion', year: '1990', format: 'VHS' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('low');
    expect(res.reasons).toContain('year mismatch');
  });

  test('edition/format mismatch', () => {
    const tape = { label: 'Orion', year: '1989', format: 'VHS' };
    const candidate = { title: 'Orion', year: '1989', format: 'DVD' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('low');
    expect(res.reasons).toContain('format mismatch');
  });

  test('same title after normalising: inferred', () => {
    const tape = { label: 'Orion!', year: '1989', format: 'VHS' };
    const candidate = { title: 'orion', year: '1989', format: 'vhs' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('inferred');
    expect(res.reasons[0]).toContain('title similar');
  });

  test('unrelated title, no identifiers: low', () => {
    const tape = { label: 'Orion' };
    const candidate = { title: 'Galaxy' };
    const res = scoreCandidate(tape, candidate);
    expect(res.level).toBe('low');
    expect(res.reasons).toContain('title differs');
  });
});