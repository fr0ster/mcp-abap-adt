/**
 * `failureOf` (spec §7.1, D14): one structural reader. Each source it knows,
 * and that it answers `undefined` for anything else.
 */

import {
  AuthProviderFailure,
  authError,
  logFields,
  render,
} from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import {
  ADT_REQUEST_ABORTED,
  failureOf,
  REQUEST_ABORTED_WORDS,
} from '../../../lib/auth/failures';
import {
  INSPECTION_ONLY_WORDS,
  ServerRefusal,
} from '../../../lib/auth/serverRefusal';

/** connection's `refusedAgain(at)`: the refusal it words itself. */
const refusedAgain = (at: 'logon' | 'request') =>
  authError.connection({ problem: 'refused-after-renewal', at });

describe('failureOf', () => {
  it('1. an AuthProviderFailure: authentication_failed with its kind, reason and hint', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const read = failureOf(new AuthProviderFailure(error));
    expect(read).toMatchObject({
      error: 'authentication_failed',
      kind: 'credential-refused',
      message: error.reason,
    });
    expect(read?.hint).toBe(error.hint);
  });

  it("2. connection's AuthRefusedError (refused-after-renewal): read through its own refusal", () => {
    const refusal = refusedAgain('request');
    const thrown = new AuthRefusedError(refusal, 'request');
    const read = failureOf(thrown);
    const words = render('connection', {
      problem: 'refused-after-renewal',
      at: 'request',
    });
    expect(read?.error).toBe('authentication_failed');
    expect(read?.kind).toBe('connection');
    expect(read?.message).toBe(words.reason);
    expect(read?.hint).toBe(words.hint);
    expect(logFields(read?.authError as never).kind).toBe('connection');
  });

  it("3. an own code 'ADT_REQUEST_ABORTED': request_aborted in fixed words", () => {
    const thrown = Object.assign(new Error('socket hang up at x'), {
      code: ADT_REQUEST_ABORTED,
    });
    expect(failureOf(thrown)).toEqual({
      error: 'request_aborted',
      message: REQUEST_ABORTED_WORDS,
    });
  });

  it('3b. a value with an own refusal that is a chain error (an IAdtError)', () => {
    const error = authError['credential-refused']({
      credential: 'user-password',
    });
    const adtError = {
      origin: 'refusal',
      message: 'the server said something',
      refusal: error,
    };
    const read = failureOf(adtError);
    expect(read?.error).toBe('authentication_failed');
    expect(read?.kind).toBe('credential-refused');
    expect(read?.message).toBe(error.reason);
  });

  it("3b. a value with an own refusal that is the connection's AuthRefusedError", () => {
    const refusal = refusedAgain('logon');
    const adtError = {
      origin: 'refusal',
      refusal: new AuthRefusedError(refusal, 'logon'),
    };
    expect(failureOf(adtError)?.kind).toBe('connection');
  });

  it('3b. a value with an own refusal that is an AuthProviderFailure', () => {
    const error = authError['renewal-declined']({ trigger: 'expired' });
    const read = failureOf({
      refusal: new AuthProviderFailure(error),
    });
    expect(read?.kind).toBe('renewal-declined');
  });

  it("4. the server's own refusals: their code and words", () => {
    expect(failureOf(new ServerRefusal('inspection_only'))).toEqual({
      error: 'inspection_only',
      message: INSPECTION_ONLY_WORDS,
    });
    expect(
      failureOf(new ServerRefusal('destination_refused', '--mcp: refused.')),
    ).toEqual({ error: 'destination_refused', message: '--mcp: refused.' });
  });

  it("4. a forged copy of a server refusal's fields is not one", () => {
    expect(
      failureOf({ serverRefusal: 'inspection_only', message: 'forged' }),
    ).toBeUndefined();
  });

  it('5. anything else: undefined', () => {
    expect(failureOf(new Error('x'))).toBeUndefined();
    expect(failureOf({ refusal: { reason: 'no kind' } })).toBeUndefined();
    expect(failureOf({ code: 'ECONNREFUSED' })).toBeUndefined();
    expect(failureOf({ kind: 'credential-refused' })).toBeUndefined();
    expect(failureOf('a string')).toBeUndefined();
  });

  it('never reads a message: a refusal is answered in its own words', () => {
    const error = authError['credential-refused']({ credential: 'token' });
    const thrown = { refusal: error, message: 'secret-in-a-message' };
    expect(JSON.stringify(failureOf(thrown))).not.toContain(
      'secret-in-a-message',
    );
  });
});
