/**
 * `etagOf`: an answer's `ETag` header, a string or a list's first entry when
 * it is text; anything else carries none. Pinned for every header shape the
 * wire contract allows, as before its retype.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { etagOf } from '../../../lib/draft/readDraftEtags';

function answering(
  value: IAdtWireResponse['headers'][string],
  name = 'ETag',
): IAdtWireResponse {
  return {
    data: '',
    status: 200,
    statusText: 'OK',
    headers: { [name]: value },
  };
}

describe('etagOf', () => {
  const holed = new Array<string>(2);
  holed[1] = 'late';
  const cases: [string, IAdtWireResponse['headers'][string], string | null][] =
    [
      ['a string', 'abc', 'abc'],
      ['a list with a string first', ['abc', 'def'], 'abc'],
      ['a hole at 0', holed, null],
      ['an empty list', [], null],
      ['a list with a non-string first', [7, 'abc'], null],
      ['a number', 42, null],
      ['null', null, null],
      ['an object', { etag: 'abc' }, null],
    ];
  for (const [name, value, etag] of cases) {
    it(`reads ${name}`, () => {
      assert.equal(etagOf(answering(value)), etag);
    });
  }

  it('finds the header whatever its case, and none without it', () => {
    assert.equal(etagOf(answering('abc', 'etag')), 'abc');
    assert.equal(etagOf(answering('abc', 'X-Other')), null);
  });
});
