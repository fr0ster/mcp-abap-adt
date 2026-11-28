/**
 * A failure answer names the connection failure by its typed fields (#394):
 * `connection_cause` (a network code), `session_error` (the connection's
 * session error) and `session_lost` (SAP's answer on a replaced session) —
 * from an `IAdtError`'s `connectionCause` / `sessionError` / `sessionLost`,
 * and from a thrown value's `code` / `sessionLost` when it is a listed one.
 * Never its words, an address or a URL.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  answerThrown,
  failurePayload,
  return_answer,
  thrownEntry,
} from '../../lib/answer';
import type { ToolResultLike } from '../../lib/toolResult';

function failure(error: IAdtError): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => error,
  } as unknown as IAdtResponse<never, IAdtError>;
}

const ctx = { tool: 'UpdateClass', detail: 'terse' } as const;
const payloadOf = (result: ToolResultLike) =>
  JSON.parse(result.content?.[0]?.text ?? '{}') as Record<string, unknown>;

/** A thrown value as the connection throws it: an Error with a code. */
function thrownWith(fields: Record<string, unknown>): Error {
  return Object.assign(new Error('The request failed: 10.0.0.1:443'), fields);
}

describe('failure answers name the connection failure', () => {
  it('an IAdtError with a network cause answers connection_cause', () => {
    const payload = failurePayload({
      origin: 'connection',
      message: 'The request failed: ECONNREFUSED',
      connectionCause: 'ECONNREFUSED',
    });
    assert.equal(payload.connection_cause, 'ECONNREFUSED');
    assert.equal(payload.session_error, undefined);
    assert.equal(payload.session_lost, undefined);
  });

  it('an IAdtError with a session error answers session_error', () => {
    const payload = failurePayload({
      origin: 'connection',
      message: 'gone',
      sessionError: 'ADT_SESSION_REPLACED',
    });
    assert.equal(payload.session_error, 'ADT_SESSION_REPLACED');
    assert.equal(payload.connection_cause, undefined);
  });

  it('an IAdtError SAP answered on a replaced session answers session_lost', () => {
    const payload = failurePayload({
      origin: 'refusal',
      message: 'Session not found',
      sessionLost: 'ADT_SESSION_REPLACED',
    });
    assert.equal(payload.session_lost, 'ADT_SESSION_REPLACED');
  });

  it('a refusal with none of them answers none', () => {
    const payload = failurePayload({ origin: 'refusal', message: 'locked' });
    for (const field of ['connection_cause', 'session_error', 'session_lost']) {
      assert.equal(Object.hasOwn(payload, field), false, field);
    }
  });

  it('return_answer carries them on the tool answer', () => {
    const result = return_answer(
      failure({
        origin: 'connection',
        message: 'The request failed: ECONNRESET',
        connectionCause: 'ECONNRESET',
      }),
      (v) => v,
      ctx,
    );
    assert.equal(payloadOf(result).connection_cause, 'ECONNRESET');
  });

  it('a thrown network error answers client_threw with connection_cause', () => {
    const payload = payloadOf(
      answerThrown(thrownWith({ code: 'ECONNREFUSED' }), ctx),
    );
    assert.equal(payload.error, 'client_threw');
    assert.equal(payload.connection_cause, 'ECONNREFUSED');
    assert.equal(payload.session_error, undefined);
  });

  it('a thrown session error answers client_threw with session_error', () => {
    const payload = payloadOf(
      answerThrown(thrownWith({ code: 'ADT_NOT_CONNECTED' }), ctx),
    );
    assert.equal(payload.session_error, 'ADT_NOT_CONNECTED');
    assert.equal(payload.connection_cause, undefined);
  });

  it('a thrown sessionLost answers session_lost', () => {
    const payload = payloadOf(
      answerThrown(thrownWith({ sessionLost: 'ADT_SESSION_REPLACED' }), ctx),
    );
    assert.equal(payload.session_lost, 'ADT_SESSION_REPLACED');
  });

  it('an unlisted code, no code and a non-object answer none of them', () => {
    for (const thrown of [
      thrownWith({ code: 'ERR_SOMETHING' }),
      thrownWith({ sessionLost: 'whatever' }),
      new Error('plain'),
      'a string',
    ]) {
      const payload = payloadOf(answerThrown(thrown, ctx));
      for (const field of [
        'connection_cause',
        'session_error',
        'session_lost',
      ]) {
        assert.equal(Object.hasOwn(payload, field), false, field);
      }
    }
  });

  it('a throwing getter answers none and does not throw', () => {
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'code', {
      get() {
        throw new Error('getter');
      },
    });
    const payload = payloadOf(answerThrown(hostile, ctx));
    assert.equal(Object.hasOwn(payload, 'connection_cause'), false);
  });

  it('thrownEntry names them on a client_threw entry', () => {
    const network = thrownEntry(thrownWith({ code: 'ETIMEDOUT' }), 'unlock');
    assert.equal(network.error, 'client_threw');
    assert.equal(network.connection_cause, 'ETIMEDOUT');
    const session = thrownEntry(
      thrownWith({ code: 'ADT_SESSION_REPLACED' }),
      'unlock',
    );
    assert.equal(session.session_error, 'ADT_SESSION_REPLACED');
  });
});
