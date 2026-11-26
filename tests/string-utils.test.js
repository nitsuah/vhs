const { describe, expect, it } = require('@jest/globals');
const { levenshteinDistance, normalizeTitleForLookup } = require('../src/modules/string-utils');

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('is the length of the other string when one side is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('is symmetric for kitten and sitting', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('sitting', 'kitten')).toBe(3);
  });

  it.each([
    ['substitution', 'cat', 'cut'],
    ['insertion', 'cat', 'cart'],
    ['deletion', 'cart', 'cat'],
  ])('counts one %s as 1', (_name, a, b) => {
    expect(levenshteinDistance(a, b)).toBe(1);
  });

  it('coerces numbers to strings', () => {
    expect(levenshteinDistance(123, 124)).toBe(1);
  });

  it('clamps inputs to 512 characters', () => {
    const a = 'a'.repeat(600);
    const b = `${'a'.repeat(512)}${'b'.repeat(88)}`;
    expect(levenshteinDistance(a, b)).toBe(0);
  });
});

describe('normalizeTitleForLookup', () => {
  it.each([null, undefined, ''])('returns an empty string for %p', (value) => {
    expect(normalizeTitleForLookup(value)).toBe('');
  });

  it.each([
    ['The Matrix (1999)', 'matrix'],
    ['Aliens VHS', 'aliens'],
    ["A Bug's Life (DVD)", 'bug s life'], // the apostrophe becomes a space before articles are stripped
    ['Tom & Jerry', 'tom and jerry'],
    ['Pulp Fiction -', 'pulp fiction'],
    ['Mission: Impossible', 'mission impossible'],
    ['Spider-Man', 'spider-man'],
    ['1999', ''],
    ['!!!', ''],
    ['Movie', 'movie'],
    ['The Movie Theater', 'movie theater'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeTitleForLookup(input)).toBe(expected);
  });
});
