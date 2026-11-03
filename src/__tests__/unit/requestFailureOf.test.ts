/**
 * `requestFailureOf`: a direct request's throw read as its error. The thrown
 * value is outside the type system, so its `response` is read: an integer
 * `status` and object `headers` make it a wire answer (`statusText` may be
 * absent); any other shape is no answer, and the error carries none.
 */
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
    expect(error?.message).toBe('Request failed with status code 404');
    expect(error?.request).toEqual(SENT);
    expect(error?.response?.status).toBe(404);
    expect(error?.response?.statusText).toBe('Not Found');
    expect(error?.response?.headers).toEqual({ 'content-type': 'text/plain' });
    expect(error?.response?.data).toBe('not found');
  });

  it('reads a response without statusText, which is then empty', () => {
    const error = requestFailureOf(
      thrownWith({ data: '', status: 500, headers: {} }),
      SENT,
    );
    expect(error?.response?.status).toBe(500);
    expect(error?.response?.statusText).toBe('');
  });

  it.each([
    ['a status that is a string', { status: '404', headers: {} }],
    ['a status that is not an integer', { status: 404.5, headers: {} }],
    ['no status', { headers: {} }],
    ['no headers', { status: 404 }],
    ['headers that are null', { status: 404, headers: null }],
    ['headers that are a list', { status: 404, headers: ['a'] }],
    ['headers that are a string', { status: 404, headers: 'a: b' }],
    ['a response that is not an object', 'HTTP 404'],
  ])('carries no response for %s', (_shape, response) => {
    const error = requestFailureOf(thrownWith(response), SENT);
    expect(error?.origin).toBe('connection');
    expect(error?.message).toBe('Request failed with status code 404');
    expect(error?.response).toBeUndefined();
    expect(error?.request).toEqual(SENT);
  });

  it('answers a thrown string as its message, with no response', () => {
    const error = requestFailureOf('socket hang up', undefined);
    expect(error?.message).toBe('socket hang up');
    expect(error?.response).toBeUndefined();
    expect(error?.request).toBeUndefined();
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
    expect(read).toEqual({
      data: 1,
      status: 200,
      statusText: '',
      headers: { a: 'x', b: ['y', 'z'], c: 3, d: true, e: null },
      config: { url: '/u' },
      request: { path: '/u' },
    });
  });
});
