/**
 * JSON values (spec §4, the owner's decision): parsed output is checked once,
 * where it is parsed, in plain code, and typed `JsonValue` after.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
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
    assert.deepStrictEqual(json, parsed);
    assert.notEqual(json, parsed);
  });

  it('takes what the XML parser answers', () => {
    const parsed: unknown = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    }).parse('<a x="1"><b>t</b><b>u</b></a>');
    assert.deepStrictEqual(jsonOf(parsed), { a: { x: '1', b: ['t', 'u'] } });
  });

  for (const [_name, value] of [
    ['undefined', undefined],
    ['a function', () => 1],
    ['a bigint', BigInt(1)],
    ['a symbol', Symbol('s')],
  ]) {
    it(format('refuses %s', _name), () => {
      assert.equal(jsonOf(value), undefined);
    });
  }

  it('refuses a list or an object holding anything that is not JSON, at any depth', () => {
    assert.equal(jsonOf([1, undefined]), undefined);
    assert.equal(jsonOf({ a: { b: () => 1 } }), undefined);
    assert.equal(jsonOf({ a: 1, b: undefined }), undefined);
  });

  // `JSON.parse` makes `__proto__` an own member; assigned as a key, it would
  // set the copy's prototype instead and leave the answer's text.
  it('keeps a member named __proto__ as a member', () => {
    const text = '{"__proto__":{"flag":true},"a":1}';
    const json = parseJson(text);
    assert.equal(JSON.stringify(json), text);
    assert.equal(Object.getPrototypeOf(json), Object.prototype);
  });

  it('reads text as JSON, and answers undefined for text that is not', () => {
    assert.deepStrictEqual(parseJson('{"a":1}'), { a: 1 });
    assert.equal(parseJson('null'), null);
    assert.equal(parseJson('not json'), undefined);
  });

  it('an answer is its JSON when it is JSON, else its text', () => {
    assert.deepStrictEqual(jsonOrText('[1]'), [1]);
    assert.equal(jsonOrText('null'), null);
    assert.equal(jsonOrText('plain words'), 'plain words');
    assert.equal(jsonOrText(''), '');
  });
});

describe('our own fields as a JSON object', () => {
  it('leaves the absent members out, as JSON.stringify does', () => {
    const fields = { a: 'x', b: undefined, c: 0, d: null };
    const json = jsonFields(fields);
    assert.deepStrictEqual(Object.keys(json), ['a', 'c', 'd']);
    assert.equal(JSON.stringify(json), JSON.stringify(fields));
  });

  it('keeps a member named __proto__ as a member', () => {
    const fields: { [key: string]: string } = {};
    Object.defineProperty(fields, '__proto__', {
      value: 'x',
      enumerable: true,
    });
    const json = jsonFields(fields);
    assert.equal(JSON.stringify(json), '{"__proto__":"x"}');
    assert.equal(Object.getPrototypeOf(json), Object.prototype);
  });
});

describe("a thrown carrier's value reads as its JSON text says", () => {
  it('a Date reads as the text JSON.stringify writes for it', () => {
    const when = new Date('2026-01-01T00:00:00Z');
    assert.deepStrictEqual(answerValueOf({ when, message: 'failed' }), {
      when: '2026-01-01T00:00:00.000Z',
      message: 'failed',
    });
  });

  it('a member JSON leaves out is left out, a list entry it writes null is null', () => {
    assert.deepStrictEqual(
      answerValueOf({ a: 1, gone: () => 1, list: [() => 1, 2] }),
      {
        a: 1,
        list: [null, 2],
      },
    );
  });

  it('a cleanup failure carrying a Date answers it as text', () => {
    const cleanup = thrownCleanup({
      failures: [{ when: new Date('2026-01-01T00:00:00Z'), message: 'm' }],
    });
    assert.ok(
      JSON.stringify(cleanup).includes('"when":"2026-01-01T00:00:00.000Z"'),
    );
  });
});
