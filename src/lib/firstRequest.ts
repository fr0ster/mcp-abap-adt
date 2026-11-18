/**
 * What a call's first SAP request on a connection met, for the one repeat
 * of a call SAP refused before anything of it ran (`BaseMcpServer`'s
 * dispatch, the owner's named exception to "no retries", 24.0.1).
 *
 * After SAP ends an idle session, the first request with its stale cookie
 * is answered `403` with `x-csrf-token: Required` and a new `SAP_SESSIONID`:
 * the connection reads the new id as a replaced session, marks the refusal
 * `sessionLost` (`ADT_SESSION_REPLACED`) and is spent before its own CSRF
 * resend (measured on premise, 2026-11-18). SAP checks the token before it
 * processes the request, so nothing ran.
 *
 * A connection the factory builds counts its requests (`withRequestLedger`);
 * a call watches them (`watchRequests`) and reads, at its end, whether its
 * first request was such a refusal and whether any of its requests got an
 * answer. Read from the refusal's data alone: the status, the header
 * (`isCsrfRefusal`) and the connection's `sessionLost` mark — never SAP's
 * text. Our own logoff (`disconnect`) carries no `sessionLost` mark, and a
 * request on a spent connection never reaches the wire.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import { isCsrfRefusal } from './csrfRefusal';
import { child } from './thrownValue';
import { wireResponseOf } from './wireResponse';

/** A call's watch over its connection's requests. */
interface Watch {
  /** Requests the call sent so far. */
  sent: number;
  /** Requests of the call that got an answer (any status the connection returned). */
  answered: number;
  /** Whether the call's first request was refused for its token by SAP in a new session. */
  firstRefusedInNewSession: boolean;
}

/** The call watching each ledgered connection, if one is. */
const watching = new WeakMap<object, Watch | undefined>();
/** The connections whose requests are counted. */
const ledgered = new WeakSet<object>();

/**
 * Whether `thrown` — what a request threw — is SAP's refusal of the token
 * in a session SAP replaced: `403` with `x-csrf-token: Required`, marked
 * `sessionLost` `ADT_SESSION_REPLACED` by the connection.
 */
export function isTokenRefusalInNewSession(thrown: unknown): boolean {
  return (
    isCsrfRefusal(wireResponseOf(child(thrown, 'response'))) &&
    child(thrown, 'sessionLost') === ADT_SESSION_ERROR.SESSION_REPLACED
  );
}

/** `connection` with its requests counted for a watching call; the same object. */
export function withRequestLedger<T extends IAbapConnection>(connection: T): T {
  const original = connection.makeAdtRequest.bind(connection);
  connection.makeAdtRequest = async (options) => {
    const watch = watching.get(connection);
    if (watch === undefined) return original(options);
    watch.sent += 1;
    const ordinal = watch.sent;
    try {
      const answer = await original(options);
      watch.answered += 1;
      return answer;
    } catch (error) {
      if (ordinal === 1 && isTokenRefusalInNewSession(error)) {
        watch.firstRefusedInNewSession = true;
      } else if (wireResponseOf(child(error, 'response')) !== undefined) {
        watch.answered += 1;
      }
      throw error;
    }
  };
  ledgered.add(connection);
  return connection;
}

/** What a watched call's requests met. */
export interface WatchedRequests {
  /**
   * Whether the call may run once more: its first request was SAP's refusal
   * of the token in a new session, and none of its requests got an answer.
   */
  readonly refusedBeforeAnyRan: boolean;
}

/**
 * Watches the requests a call sends on `connection` until the returned
 * `end` is called; `undefined` for a connection whose requests are not
 * counted (one the factory did not build), so nothing is known of them.
 */
export function watchRequests(
  connection: IAbapConnection,
): { end(): WatchedRequests } | undefined {
  if (!ledgered.has(connection)) return undefined;
  const watch: Watch = {
    sent: 0,
    answered: 0,
    firstRefusedInNewSession: false,
  };
  watching.set(connection, watch);
  return {
    end() {
      if (watching.get(connection) === watch) {
        watching.set(connection, undefined);
      }
      return {
        refusedBeforeAnyRan:
          watch.firstRefusedInNewSession && watch.answered === 0,
      };
    },
  };
}
