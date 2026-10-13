/**
 * Identifiers for ADT requests.
 *
 * - `sap-adt-connection-id`: the connection's own identifier, written by
 *   `@mcp-abap-adt/connection` on every request.
 * - `sap-adt-request-id`: a fresh identifier per request, also written by the
 *   connection.
 *
 * Whether a request is stateful is not decided here or anywhere else in the
 * server: adt-clients marks the `LOCK` and the `UNLOCK` stateful for the one
 * request each, and the connection's transport says so on its own wire. A
 * tool's session is stateful only for that window (spec §5.7, D56). The
 * `session_id` a lock tool still returns identifies nothing on the wire.
 *
 * @see docs/architecture/STATEFUL_SESSION_GUIDE.md
 */

import * as crypto from 'node:crypto';

/**
 * A random identifier: 32 hexadecimal characters (a UUID without hyphens).
 * What `GetSession` and a lock tool hand back as `session_id`; it is sent on
 * no request.
 */
export function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
