/**
 * `failureOf`: one structural reader. Each source it knows,
 * and that it answers `undefined` for anything else.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AuthProviderFailure,
  authError,
  logFields,
  render,
} from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { failureOf } from '../../../lib/auth/failures';
import {
  INSPECTION_ONLY_WORDS,
  ServerRefusal,
} from '../../../lib/auth/serverRefusal';
import { assertMatchObject } from '../../helpers/assertions';

/** connection's `refusedAgain(at)`: the refusal it words itself. */
const refusedAgain = (at: 'logon' | 'request') =>
  authError.connection({ problem: 'refused-after-renewal', at });

describe('failureOf', () => {
  it('1. an AuthProviderFailure: authentication_failed with its kind, reason and hint', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const read = failureOf(new AuthProviderFailure(error));
    assertMatchObject(read, {
      error: 'authentication_failed',
      kind: 'credential-refused',
      message: error.reason,
    });
    assert.equal(read?.hint, error.hint);
  });

  it("2. connection's AuthRefusedError (refused-after-renewal): read through its own refusal", () => {
    const refusal = refusedAgain('request');
    const thrown = new AuthRefusedError(refusal, 'request');
    const read = failureOf(thrown);
    const words = render('connection', {
      problem: 'refused-after-renewal',
      at: 'request',
    });
    assert.equal(read?.error, 'authentication_failed');
    assert.equal(read?.kind, 'connection');
    assert.equal(read?.message, words.reason);
    assert.equal(read?.hint, words.hint);
    assert.equal(logFields(read?.authError as never).kind, 'connection');
  });

  it("no step 3: an own code 'ADT_REQUEST_ABORTED' is not a failure it knows", () => {
    const thrown = Object.assign(new Error('socket hang up at x'), {
      code: 'ADT_REQUEST_ABORTED',
    });
    assert.equal(failureOf(thrown), undefined);
  });

  it('2. any value with an own refusal that is a chain error', () => {
    const error = authError['credential-refused']({
      credential: 'user-password',
    });
    const adtError = {
      origin: 'refusal',
      message: 'the server said something',
      refusal: error,
    };
    const read = failureOf(adtError);
    assert.equal(read?.error, 'authentication_failed');
    assert.equal(read?.kind, 'credential-refused');
    assert.equal(read?.message, error.reason);
  });

  it("no step 3b: a refusal that only carries the connection's AuthRefusedError is not read", () => {
    const refusal = refusedAgain('logon');
    const adtError = {
      origin: 'refusal',
      refusal: new AuthRefusedError(refusal, 'logon'),
    };
    assert.equal(failureOf(adtError), undefined);
  });

  it('no step 3b: a refusal that is an AuthProviderFailure is not read', () => {
    const error = authError['renewal-declined']({ trigger: 'expired' });
    assert.equal(
      failureOf({ refusal: new AuthProviderFailure(error) }),
      undefined,
    );
  });

  it("4. the server's own refusals: their code and words", () => {
    assert.deepStrictEqual(failureOf(new ServerRefusal('inspection_only')), {
      error: 'inspection_only',
      message: INSPECTION_ONLY_WORDS,
    });
    assert.deepStrictEqual(
      failureOf(new ServerRefusal('destination_refused', '--mcp: refused.')),
      { error: 'destination_refused', message: '--mcp: refused.' },
    );
  });

  it("4. a forged copy of a server refusal's fields is not one", () => {
    assert.equal(
      failureOf({ serverRefusal: 'inspection_only', message: 'forged' }),
      undefined,
    );
  });

  it('5. anything else: undefined', () => {
    assert.equal(failureOf(new Error('x')), undefined);
    assert.equal(failureOf({ refusal: { reason: 'no kind' } }), undefined);
    assert.equal(failureOf({ code: 'ECONNREFUSED' }), undefined);
    assert.equal(failureOf({ kind: 'credential-refused' }), undefined);
    assert.equal(failureOf('a string'), undefined);
  });

  it('never reads a message: a refusal is answered in its own words', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const thrown = { refusal: error, message: 'secret-in-a-message' };
    assert.ok(
      !JSON.stringify(failureOf(thrown)).includes('secret-in-a-message'),
    );
  });
});
