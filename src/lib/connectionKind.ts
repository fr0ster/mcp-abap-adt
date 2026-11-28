/**
 * Whether a connection goes over RFC.
 *
 * Over RFC `RfcTransport` keeps one ABAP session for every call, so what an
 * ABAP program leaves in its session — a static buffer, say — is still there
 * on the next call. Over HTTP a stateless request ends its session.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

/**
 * The kind each view carries from the connection it was built over
 * (`carryConnectionKind`): a batch connection, a forwarding or recording
 * view has no configuration of its own (adt-clients' `AdtBatchConnection`
 * declares no `getConfig`), so it reads as the connection under it.
 */
const carriedKinds = new WeakMap<object, boolean>();

export function isRfcConnection(connection: IAbapConnection): boolean {
  return (
    carriedKinds.get(connection) ??
    connection.getConfig?.().connectionType === 'rfc'
  );
}

/** Gives `view`, built over `outer`, the connection kind `outer` has. */
export function carryConnectionKind(
  view: object,
  outer: IAbapConnection,
): void {
  carriedKinds.set(view, isRfcConnection(outer));
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
/**
 * An embedder's bound on the requests in flight (`requestsInFlight`): a
 * positive whole number, else a throw naming `name`. The configured one is
 * read by `REQUESTS_IN_FLIGHT_ROW`.
 */
export function requestsInFlightOf(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `Invalid ${name}: must be a positive whole number of requests`,
    );
  }
  return value;
}

export function readsInFlight<P>(
  connection: IAbapConnection,
  parallel: P,
): P | 1 {
  return isRfcConnection(connection) ? 1 : parallel;
}
