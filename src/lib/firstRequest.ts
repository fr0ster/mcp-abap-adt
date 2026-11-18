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
 * processes the request, so nothing ran. A stateful request (a LOCK) on such
 * a session is answered in the new session, which the connection reads as
 * replaced and throws `ADT_SESSION_REPLACED` for (measured on premise, the
 * live run of 2026-11-18); a lock SAP took in the new session ended with
 * that session's logoff, which the connection sends.
 *
 * A connection the factory builds counts its requests (`withRequestLedger`);
 * a call watches them (`watchRequests`) and reads, at its end, whether its
 * first request was such a refusal and whether any of its requests got an
 * answer. Read from the refusal's data alone: the status, the header
 * (`isCsrfRefusal`) and the connection's `sessionLost` mark, or the
 * connection's own session error code — never SAP's text. Our own logoff
 * (`disconnect`) is `ADT_NOT_CONNECTED` with no `sessionLost` mark, and a
 * request on a spent connection never reaches the wire.
 */
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import axios from 'axios';
import { isCsrfRefusal } from './csrfRefusal';
import { asciiUpper } from './plainText';
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
 * Whether `thrown` — what a request threw — says SAP ended the session the
 * request was sent in, before the request ran, as the connection marks it:
 *
 * - SAP's refusal of the token, `403` with `x-csrf-token: Required`, marked
 *   `sessionLost` `ADT_SESSION_REPLACED` — SAP refused it before processing
 *   it, whatever the request;
 * - the connection's own `ADT_SESSION_REPLACED` for a LOCK (`lock`): SAP
 *   answered it in a new session, and the lock it took there ended with
 *   that session's logoff, which the connection sends. For any other
 *   stateful request the same throw follows an answer SAP processed (a
 *   write in the new session), so it is not this.
 *
 * Our own logoff (`disconnect`) is `ADT_NOT_CONNECTED`, never this.
 */
export function isSessionReplacedBySap(
  thrown: unknown,
  lock: boolean,
): boolean {
  if (child(thrown, 'code') === ADT_SESSION_ERROR.SESSION_REPLACED) return lock;
  return (
    isCsrfRefusal(wireResponseOf(child(thrown, 'response'))) &&
    child(thrown, 'sessionLost') === ADT_SESSION_ERROR.SESSION_REPLACED
  );
}

/**
 * Whether `options` is a LOCK: a POST whose query, as it goes on the wire,
 * carries exactly one `_action`, decoded `LOCK` — the form adt-clients
 * sends, `…?_action=LOCK&accessMode=MODIFY`. The query is the one the
 * HTTP transport sends: the URL and its `params` joined by axios's
 * `getUri`, as `@mcp-abap-adt/connection`'s transport fixes a request
 * (`HttpTransport.fix`) — a plain object, `URLSearchParams` and lists
 * alike — then read by `URLSearchParams`. A repeated `_action`, or `LOCK`
 * in another parameter, is no LOCK.
 */
export function isLockRequest(options: IAbapRequestOptions): boolean {
  if (asciiUpper(options.method ?? '') !== 'POST') return false;
  const sent = axios.getUri({
    url: options.url ?? '',
    ...(options.params !== undefined ? { params: options.params } : {}),
  });
  const at = sent.indexOf('?');
  if (at < 0) return false;
  const [only, other] = new URLSearchParams(sent.slice(at + 1)).getAll(
    '_action',
  );
  return other === undefined && only === 'LOCK';
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
      if (
        ordinal === 1 &&
        isSessionReplacedBySap(error, isLockRequest(options))
      ) {
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
