const { parseJsonArray, parseJsonObject } = require('../src/modules/json-parser');

describe('parseJsonArray', () => {
  test('leading and trailing prose around an array', () => {
    expect(parseJsonArray('Here is the list: [1, 2, 3] end')).toEqual([1, 2, 3]);
  });

  test('nested arrays', () => {
    expect(parseJsonArray('[[1,2],[3,4]]')).toEqual([[1,2],[3,4]]);
  });

  test('string value containing ] does not end array early', () => {
    expect(parseJsonArray('["a]b", "c"]')).toEqual(['a]b', 'c']);
  });

  test('escaped quote inside string', () => {
    expect(parseJsonArray('["say \\"hi\\""]')).toEqual(['say "hi"']);
  });

  test('unbalanced [1,2 gives []', () => {
    expect(parseJsonArray('[1,2')).toEqual([]);
  });

  test('balanced but invalid JSON {a:1} gives []', () => {
    expect(parseJsonArray('{a:1}')).toEqual([]);
  });

  test('null, undefined, and empty string give [] without throwing', () => {
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray(undefined)).toEqual([]);
    expect(parseJsonArray('')).toEqual([]);
  });

  test('only first structure returned when two are present', () => {
    expect(parseJsonArray('[1] [2]')).toEqual([1]);
  });
});

describe('parseJsonObject', () => {
  test('leading and trailing prose around an object', () => {
    expect(parseJsonObject('Sure! {"a":1} done')).toEqual({ a: 1 });
  });

  test('nested objects and arrays', () => {
    expect(parseJsonObject('{"x":{"y":[1,2]}}')).toEqual({ x: { y: [1,2] } });
  });

  test('string value containing } does not end object early', () => {
    expect(parseJsonObject('{"t":"a}b"}')).toEqual({ t: 'a}b' });
  });

  test('escaped quote inside string', () => {
    expect(parseJsonObject('{"t":"say \\"hi\\""}')).toEqual({ t: 'say "hi"' });
  });

  test('unbalanced {"a": gives null', () => {
    expect(parseJsonObject('{"a":')).toBeNull();
  });

  test('balanced but invalid JSON {a:1} gives null', () => {
    expect(parseJsonObject('{a:1}')).toBeNull();
  });

  test('null, undefined, and empty string give null without throwing', () => {
    expect(parseJsonObject(null)).toBeNull();
    expect(parseJsonObject(undefined)).toBeNull();
    expect(parseJsonObject('')).toBeNull();
  });

  test('only first structure returned when two are present', () => {
    expect(parseJsonObject('{"a":1} {"b":2}')).toEqual({ a: 1 });
  });
});