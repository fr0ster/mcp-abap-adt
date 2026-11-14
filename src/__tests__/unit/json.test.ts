/**
 * JSON values (spec §4, the owner's decision): parsed output is checked once,
 * where it is parsed, in plain code, and typed `JsonValue` after.
 */
import { XMLParser } from 'fast-xml-parser';
import {
  answerValueOf,
  jsonFields,
  jsonOf,
  jsonOrText,
  parseJson,
} from '../../lib/json';
import { thrownCleanup } from '../../lib/strategies/safeFields';

describe('a parsed value is checked once, where it is parsed', () => {
  it('takes every JSON value as it is, built afresh', () => {
    const parsed: unknown = JSON.parse(
      '{"a":[1,"two",true,null,{"b":{}}],"c":"d"}',
    );
    const json = jsonOf(parsed);
    expect(json).toEqual(parsed);
    expect(json).not.toBe(parsed);
  });

  it('takes what the XML parser answers', () => {
    const parsed: unknown = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    }).parse('<a x="1"><b>t</b><b>u</b></a>');
    expect(jsonOf(parsed)).toEqual({ a: { x: '1', b: ['t', 'u'] } });
  });

  it.each([
    ['undefined', undefined],
    ['a function', () => 1],
    ['a bigint', BigInt(1)],
    ['a symbol', Symbol('s')],
  ])('refuses %s', (_name, value) => {
    expect(jsonOf(value)).toBeUndefined();
  });

  it('refuses a list or an object holding anything that is not JSON, at any depth', () => {
    expect(jsonOf([1, undefined])).toBeUndefined();
    expect(jsonOf({ a: { b: () => 1 } })).toBeUndefined();
    expect(jsonOf({ a: 1, b: undefined })).toBeUndefined();
  });

  // `JSON.parse` makes `__proto__` an own member; assigned as a key, it would
  // set the copy's prototype instead and leave the answer's text.
  it('keeps a member named __proto__ as a member', () => {
    const text = '{"__proto__":{"flag":true},"a":1}';
    const json = parseJson(text);
    expect(JSON.stringify(json)).toBe(text);
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
  });

  it('reads text as JSON, and answers undefined for text that is not', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('null')).toBeNull();
    expect(parseJson('not json')).toBeUndefined();
  });

  it('an answer is its JSON when it is JSON, else its text', () => {
    expect(jsonOrText('[1]')).toEqual([1]);
    expect(jsonOrText('null')).toBeNull();
    expect(jsonOrText('plain words')).toBe('plain words');
    expect(jsonOrText('')).toBe('');
  });
});

describe('our own fields as a JSON object', () => {
  it('leaves the absent members out, as JSON.stringify does', () => {
    const fields = { a: 'x', b: undefined, c: 0, d: null };
    const json = jsonFields(fields);
    expect(Object.keys(json)).toEqual(['a', 'c', 'd']);
    expect(JSON.stringify(json)).toBe(JSON.stringify(fields));
  });

  it('keeps a member named __proto__ as a member', () => {
    const fields: { [key: string]: string } = {};
    Object.defineProperty(fields, '__proto__', {
      value: 'x',
      enumerable: true,
    });
    const json = jsonFields(fields);
    expect(JSON.stringify(json)).toBe('{"__proto__":"x"}');
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
  });
});

describe("a thrown carrier's value reads as its JSON text says", () => {
  it('a Date reads as the text JSON.stringify writes for it', () => {
    const when = new Date('2026-01-01T00:00:00Z');
    expect(answerValueOf({ when, message: 'failed' })).toEqual({
      when: '2026-01-01T00:00:00.000Z',
      message: 'failed',
    });
  });

  it('a member JSON leaves out is left out, a list entry it writes null is null', () => {
    expect(answerValueOf({ a: 1, gone: () => 1, list: [() => 1, 2] })).toEqual({
      a: 1,
      list: [null, 2],
    });
  });

  it('a cleanup failure carrying a Date answers it as text', () => {
    const cleanup = thrownCleanup({
      failures: [{ when: new Date('2026-01-01T00:00:00Z'), message: 'm' }],
    });
    expect(JSON.stringify(cleanup)).toContain(
      '"when":"2026-01-01T00:00:00.000Z"',
    );
  });
});
