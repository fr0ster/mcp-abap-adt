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
 * `@mcp-abap-adt/connection` (>= 1.10.0) exposes reference-counted
 * `beginCriticalSection()` / `endCriticalSection()`: while active, the request
 * timeout is raised to a large ceiling (SAP_TIMEOUT_CRITICAL) so slow
 * write requests run to completion instead of being aborted. We bracket the
 * whole mutating handler with it — begin before it runs, end in a `finally`.
 *
 * The methods are feature-detected via a structural cast, so this degrades to a
 * no-op against an older connection that lacks them (no hard dependency on the
 * IAbapConnection interface shape).
 */

interface CriticalSectionCapable {
  beginCriticalSection?: () => void;
  endCriticalSection?: () => void;
}

/**
 * Wrap a handler so the connection is held in an uninterruptible critical
 * section for the whole call. `getConnection` is a thunk because the connection
 * lives on the per-request handler context, resolved when the handler runs.
 *
 * Generic over the handler's own signature so the wrapped function keeps the
 * exact arity/return type (and stays assignable to `ToolHandler`).
 */
export function withCriticalSection<H extends (...args: any[]) => any>(
  handler: H,
  getConnection: () => unknown,
): (...args: Parameters<H>) => Promise<Awaited<ReturnType<H>>> {
  return async (...args: Parameters<H>) => {
    const conn = getConnection() as CriticalSectionCapable | null | undefined;
    conn?.beginCriticalSection?.();
    try {
      return await handler(...args);
    } finally {
      conn?.endCriticalSection?.();
    }
  };
}

/** Tool names that run a lock → modify → unlock chain and must not be interrupted. */
export function isMutatingToolName(name: string): boolean {
  return /^(Create|Update|Delete)/.test(name);
}
