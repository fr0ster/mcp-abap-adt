/**
 * Uninterruptible critical section wrapper for mutating handlers.
 *
 * A mutating operation (Create/Update/Delete) runs a stateful
 * lock → modify → unlock chain. If a short per-request timeout aborts one of
 * those requests mid-flight, tearing down the socket drops the stateful ADT
 * session and orphans the lock handle — the object is left locked and inactive.
 * (A normal error keeps the session alive, so the finally-unlock works; only a
 * timeout leaves it locked — see @mcp-abap-adt/connection 1.10.0.)
 *
 * `@mcp-abap-adt/connection` exposes reference-counted
 * `beginCriticalSection()` / `endCriticalSection()`: while active, a request
 * carries no deadline at all — not even one its caller passed (connection 17;
 * before, the timeout was raised to a ceiling) — so slow write requests run to
 * completion instead of being aborted. We bracket the whole mutating handler
 * with it — begin before it runs, end in a `finally`.
 *
 * The methods are optional members of `IAbapConnection`, called with `?.`,
 * so this is a no-op against a connection that lacks them.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

/**
 * Wrap a handler so the connection is held in an uninterruptible critical
 * section for the whole call. `getConnection` is a thunk because the connection
 * lives on the per-request handler context, resolved when the handler runs.
 *
 * Generic over the handler's own parameters so the wrapped function keeps the
 * exact arity/return type (and stays assignable to an entry's `call`), and
 * hands the handler exactly the arguments it is called with.
 */
export function withCriticalSection<P extends unknown[], R>(
  handler: (...args: P) => Promise<R>,
  getConnection: () => IAbapConnection,
): (...args: P) => Promise<R> {
  return async (...args: P) => {
    const conn = getConnection();
    conn.beginCriticalSection?.();
    try {
      return await handler(...args);
    } finally {
      conn.endCriticalSection?.();
    }
  };
}

/**
 * Tool names that run a lock → modify → unlock chain and must not be
 * interrupted.
 *
 * `Add`/`Remove` cover `AddTransportObject`/`RemoveTransportObject` (#221,
 * PR227) specifically — they are the only two tools in this codebase with
 * either prefix. Measured live (2026-09-22/23) against an on-premise system:
 * SAP's own backend for `useraction=addobject`/`removeobject` takes an
 * ENQUEUE lock on the ABAP object being attached/detached before it validates
 * the request, the same as any Create/Update/Delete's lock → modify → unlock
 * chain — but neither tool's name started with Create/Update/Delete, so
 * neither ever got the critical section below, and a slow call left the
 * object's lock orphaned exactly the way this file's own header describes for
 * an unprotected mutating call. `CreateTransportTask` already matched
 * (`Create`); these two did not.
 *
 * `MoveTransportObjects` and `SortAndCompressTransportTask` (adt-clients 30)
 * write the same object list, so they get the same protection — named one by
 * one rather than by a new prefix, which would quietly cover whatever tool
 * next starts with `Move` or `Sort`. Whether their backends take the ENQUEUE
 * lock `addobject`/`removeobject` do is not measured; the critical section
 * costs nothing when they do not.
 */
const MUTATING_TRANSPORT_TOOLS: ReadonlySet<string> = new Set([
  'MoveTransportObjects',
  'SortAndCompressTransportTask',
]);

/** The name prefixes of the tools that write, compared as they are spelled. */
const MUTATING_PREFIXES: readonly string[] = [
  'Create',
  'Update',
  'Delete',
  'Add',
  'Remove',
];

export function isMutatingToolName(name: string): boolean {
  return (
    MUTATING_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    MUTATING_TRANSPORT_TOOLS.has(name)
  );
}
