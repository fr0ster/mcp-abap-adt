/**
 * `connectionCauseOf`: the code a failed connection names (#353) — one of
 * Node's network codes or interfaces-auth's TLS failure codes, read guarded
 * from a value outside the type system; anything else is no cause.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TLS_FAILURE_CODES } from '@mcp-abap-adt/interfaces-auth';
import {
  CONNECTION_CAUSE_CODES,
  connectionCauseOf,
} from '../../../lib/auth/connectionCause';

const failure = (code: unknown) =>
  Object.assign(new Error('connect ECONNREFUSED sap.example:443'), { code });

describe('connectionCauseOf', () => {
  for (const code of [
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'CERT_HAS_EXPIRED',
    'SELF_SIGNED_CERT_IN_CHAIN',
  ]) {
    it(`a listed code is the cause: ${code}`, () => {
      assert.equal(connectionCauseOf(failure(code)), code);
    });
  }

  it('every TLS failure code of interfaces-auth is listed', () => {
    // Read as plain strings, so a list that lost them fails here at run time.
    const listed: readonly string[] = CONNECTION_CAUSE_CODES;
    for (const code of TLS_FAILURE_CODES) {
      assert.equal(listed.includes(code), true, code);
    }
  });

  it('a code not on the list is no cause', () => {
    assert.equal(connectionCauseOf(failure('ERR_SOMETHING_ELSE')), undefined);
  });

  it('a code that is not a string is no cause', () => {
    assert.equal(connectionCauseOf(failure(42)), undefined);
  });

  it('a value with no code, or no object, is no cause', () => {
    assert.equal(connectionCauseOf(new Error('x')), undefined);
    assert.equal(connectionCauseOf('ECONNREFUSED'), undefined);
    assert.equal(connectionCauseOf(undefined), undefined);
  });

  it('a throwing code getter is no cause, and nothing throws', () => {
    const thrown = new Error('x');
    Object.defineProperty(thrown, 'code', {
      get() {
        throw new Error('the getter threw');
      },
    });
    assert.equal(connectionCauseOf(thrown), undefined);
  });
});
