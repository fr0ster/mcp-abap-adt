/**
 * The cause a failed connection is named by (fr0ster/mcp-abap-adt#353): the
 * stdio start line, and a tool call's `no_connection` answer.
 *
 * Only a listed code is named — Node's network codes a connection may fail
 * with (the system is not there, refused or cut the connection — `EPIPE`
 * when it cut it while the request was written, measured on macOS —, its
 * name does not resolve, no route reaches it) and the TLS failure codes
 * interfaces-auth allowlists. Never the error's message, the URL or the
 * host.
 */
import { TLS_FAILURE_CODES } from '@mcp-abap-adt/interfaces-auth';
import { child } from '../outsideValue';

/** Node's network codes a connection may fail with. */
const NETWORK_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
] as const;

/** The codes a failed connection is named by: the network's, then the TLS failures. */
export const CONNECTION_CAUSE_CODES = [
  ...NETWORK_CODES,
  ...TLS_FAILURE_CODES,
] as const;

/** A code a failed connection is named by. */
export type ConnectionCauseCode = (typeof CONNECTION_CAUSE_CODES)[number];

/**
 * The thrown value's `code` when it is one of {@link CONNECTION_CAUSE_CODES};
 * any other code, none, or a `code` that cannot be read (a throwing getter)
 * is `undefined`. The value is from outside the type system: it is read
 * guarded and compared as a string.
 */
export function connectionCauseOf(
  thrown: unknown,
): ConnectionCauseCode | undefined {
  let code: unknown;
  try {
    code = child(thrown, 'code');
  } catch {
    return undefined;
  }
  return CONNECTION_CAUSE_CODES.find((listed) => listed === code);
}
