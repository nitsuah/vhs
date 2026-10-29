'use strict';
const { missingFields, suspiciousFields } = require('../src/modules/fill-audit');

describe('missingFields', () => {
  test('complete tape returns empty array', () => {
    const tape = {
      year: '1989',
      label: 'Orion',
      format: 'VHS',
      value_low: '5',
      value_high: '12',
      photo_face: 'x',
      photo_spine: 'y'
    };
    expect(missingFields(tape)).toEqual([]);
    expect(suspiciousFields(tape)).toEqual([]);
  });

  test('empty object missing all required fields plus cover and spine', () => {
    expect(missingFields({})).toEqual(['year', 'label', 'format', 'value_low', 'value_high', 'cover', 'spine']);
  });

  test('placeholder values count as missing for label', () => {
    expect(missingFields({ label: 'Unknown' })).toContain('label');
    expect(missingFields({ label: 'N/A' })).toContain('label');
    expect(missingFields({ label: '?' })).toContain('label');
  });

  test('photo_thumbnail alone satisfies cover', () => {
    const tape = { photo_thumbnail: 'x' };
    expect(missingFields(tape)).not.toContain('cover');
  });

  test('blank photo values count as missing artwork', () => {
    expect(missingFields({ photo_face: '   ', photo_thumbnail: '   ' })).toContain('cover');
    expect(missingFields({ photo_spine: '   ' })).toContain('spine');
  });
});

describe('suspiciousFields', () => {
  test('invalid year formats and out-of-range years', () => {
    expect(suspiciousFields({ year: '19x9' }, 2026)).toEqual(['year']);
    expect(suspiciousFields({ year: '1750' }, 2026)).toEqual(['year']);
    expect(suspiciousFields({ year: '2999' }, 2026)).toEqual(['year']);
  });

  test('value_low > value_high is suspicious', () => {
    expect(suspiciousFields({ value_low: '20', value_high: '5' })).toEqual(['value']);
  });

  test('imdb_id format validation', () => {
    expect(suspiciousFields({ imdb_id: 'tt12' })).toEqual(['imdb_id']);
    expect(suspiciousFields({ imdb_id: 'tt0088763' })).toEqual([]);
  });

  test('barcode format validation', () => {
    expect(suspiciousFields({ barcode: '12345' })).toEqual(['barcode']);
    expect(suspiciousFields({ barcode: '012345678905' })).toEqual([]);
  });
});