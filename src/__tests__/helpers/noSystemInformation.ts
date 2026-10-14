/**
 * A stand-in connection for an on-premise system without the
 * `systeminformation` function: its lookup fails with a `404`, so the
 * server runs with the configuration. For tests whose subject is not the
 * system lookup.
 */

const SYSTEM_INFORMATION = '/sap/bc/adt/core/http/systeminformation';

/** The `404` a connection throws for a path the system does not have. */
export function notFound(): Error {
  return Object.assign(new Error('Request failed with status code 404'), {
    response: { status: 404 },
  });
}

/**
 * `connection` (a plain object when none is given) whose
 * `makeAdtRequest` answers `systeminformation` with a `404`; any other
 * request goes to its own `makeAdtRequest`, if it has one.
 */
export function withoutSystemInformation<T extends object>(
  connection: T = {} as T,
): T {
  const own = (connection as { makeAdtRequest?: (o: unknown) => unknown })
    .makeAdtRequest;
  return Object.assign(connection, {
    makeAdtRequest: async (options: { url?: string }) => {
      if (String(options?.url ?? '').startsWith(SYSTEM_INFORMATION)) {
        throw notFound();
      }
      if (own) return own.call(connection, options);
      throw notFound();
    },
  });
}
