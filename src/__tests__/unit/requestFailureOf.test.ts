/**
 * `requestFailureOf`: a direct request's throw read as its error. The thrown
 * value is outside the type system, so its `response` is read: an integer
 * `status` and object `headers` make it a wire answer (`statusText` may be
 * absent); any other shape is no answer, and the error carries none.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { requestFailureOf } from '../../lib/answer';
import { wireResponseOf } from '../../lib/wireResponse';

const SENT = { method: 'GET', url: '/sap/bc/adt/x' };

function thrownWith(response: unknown): Error & { response: unknown } {
  return Object.assign(new Error('Request failed with status code 404'), {
    response,
  });
}

describe('requestFailureOf: the answer a throw carries', () => {
  it('reads a response with an integer status, headers and statusText', () => {
    const error = requestFailureOf(
      thrownWith({
        data: 'not found',
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'text/plain' },
      }),
      SENT,
    );
    assert.equal(error?.message, 'Request failed with status code 404');
    assert.deepStrictEqual(error?.request, SENT);
    assert.equal(error?.response?.status, 404);
    assert.equal(error?.response?.statusText, 'Not Found');
    assert.deepStrictEqual(error?.response?.headers, {
      'content-type': 'text/plain',
    });
    assert.equal(error?.response?.data, 'not found');
  });

  it('reads a response without statusText, which is then empty', () => {
    const error = requestFailureOf(
      thrownWith({ data: '', status: 500, headers: {} }),
      SENT,
    );
    assert.equal(error?.response?.status, 500);
    assert.equal(error?.response?.statusText, '');
  });

  for (const [_shape, response] of [
    ['a status that is a string', { status: '404', headers: {} }],
    ['a status that is not an integer', { status: 404.5, headers: {} }],
    ['no status', { headers: {} }],
    ['no headers', { status: 404 }],
    ['headers that are null', { status: 404, headers: null }],
    ['headers that are a list', { status: 404, headers: ['a'] }],
    ['headers that are a string', { status: 404, headers: 'a: b' }],
    ['a response that is not an object', 'HTTP 404'],
  ]) {
    it(format('carries no response for %s', _shape), () => {
      const error = requestFailureOf(thrownWith(response), SENT);
      assert.equal(error?.origin, 'connection');
      assert.equal(error?.message, 'Request failed with status code 404');
      assert.equal(error?.response, undefined);
      assert.deepStrictEqual(error?.request, SENT);
    });
  }

  it('answers a thrown string as its message, with no response', () => {
    const error = requestFailureOf('socket hang up', undefined);
    assert.equal(error?.message, 'socket hang up');
    assert.equal(error?.response, undefined);
    assert.equal(error?.request, undefined);
  });
});

describe('wireResponseOf', () => {
  it('keeps the header values a header can hold, and config and request', () => {
    const read = wireResponseOf({
      data: 1,
      status: 200,
      headers: {
        a: 'x',
        b: ['y', 'z'],
        c: 3,
        d: true,
        e: null,
        f: () => 'not a header',
      },
      config: { url: '/u' },
      request: { path: '/u' },
    });
    assert.deepStrictEqual(read, {
      data: 1,
      status: 200,
      statusText: '',
      headers: { a: 'x', b: ['y', 'z'], c: 3, d: true, e: null },
      config: { url: '/u' },
      request: { path: '/u' },
    });
  });
});
