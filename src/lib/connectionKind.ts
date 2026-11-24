/**
 * Whether a connection goes over RFC.
 *
 * Over RFC `RfcTransport` keeps one ABAP session for every call, so what an
 * ABAP program leaves in its session — a static buffer, say — is still there
 * on the next call. Over HTTP a stateless request ends its session.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

export function isRfcConnection(connection: IAbapConnection): boolean {
  return connection.getConfig?.().connectionType === 'rfc';
}

/**
 * How many single requests a reader keeps in flight at once on
 * `connection`: `parallel` over HTTP, one over RFC. An RFC connection is
 * one ABAP session, and one session answers one call at a time. Fetched in
 * parallel over RFC, reads were lost without an error: on premise
 * (2026-09-26) a SearchSource scan of the shared package read 4 of its 13
 * sources and found nothing, where one at a time read all 13 and found
 * both hits, as HTTP does. SearchSource's sequential version and the
 * package walks' `concurrentReader` read through this.
 */
export function readsInFlight<P>(
  connection: IAbapConnection,
  parallel: P,
): P | 1 {
  return isRfcConnection(connection) ? 1 : parallel;
}
