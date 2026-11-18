/**
 * The server's words for a session the connection lost or never had: its
 * session error codes (`ADT_SESSION_ERROR`, interfaces-adt-connection), in
 * place of the connection's own prose, which advised the consumer about
 * the connector's internals (the owner, 2026-11-18: never answered; at most
 * logged). Told by the code alone, never by the words; the original goes to
 * the server's log at `debug`.
 */
import {
  ADT_SESSION_ERROR,
  type AdtSessionErrorCode,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { logger } from './logger';
import { child } from './thrownValue';

const CODES: ReadonlySet<unknown> = new Set(Object.values(ADT_SESSION_ERROR));

/** Whether `value` is one of the connection's session error codes. */
function isSessionCode(value: unknown): value is AdtSessionErrorCode {
  return CODES.has(value);
}

/** The session error code a thrown value carries as its `code`, if any. */
export function thrownSessionCode(
  thrown: unknown,
): AdtSessionErrorCode | undefined {
  const code = child(thrown, 'code');
  return isSessionCode(code) ? code : undefined;
}

/**
 * The answer's words for `code`: what ended, what did not run, and the
 * lock; `step`, the call's step that met it, where one is named.
 */
export function sessionEndWords(
  code: AdtSessionErrorCode,
  step?: string,
): string {
  switch (code) {
    case ADT_SESSION_ERROR.SESSION_REPLACED:
      return step === undefined
        ? 'SAP ended the session (an idle timeout, a logoff); this call did not run. Send it again: the next call opens a new session. A lock taken before, if any, is released.'
        : `SAP ended the session during the call, at its step ${step} (an idle timeout, a logoff): that step and the steps after it did not run. Send the call again: the next call opens a new session. A lock taken in the ended session is released.`;
    case ADT_SESSION_ERROR.NOT_CONNECTED:
      return "The connection's SAP session had ended (an idle timeout, a logoff); this call did not run. Send it again: the next call opens a new session.";
    case ADT_SESSION_ERROR.RELEASE_PENDING:
      return "The connection's previous SAP session is still being released; this call did not run. Send it again.";
  }
}

/** The connection's own words for `code`, to the server's log at `debug`. */
export function logSessionEnd(code: AdtSessionErrorCode, words: string): void {
  logger.debug('the connection reported its session; answered in fixed words', {
    code,
    message: words,
  });
}
