/**
 * Stand-ins for the `systeminformation` lookup, for tests whose subject is
 * not the system lookup.
 */

const SYSTEM_INFORMATION = '/sap/bc/adt/core/http/systeminformation';

/** The `404` a connection throws for a path the system does not have. */
export function notFound(): Error {
  return Object.assign(new Error('Request failed with status code 404'), {
    response: { status: 404 },
  });
}

/** The user and system id `withSystemInformation`'s system names. */
export const STAND_IN_SYSTEM = { user: 'STAND_IN_USER', systemId: 'SIN' };

/**
 * `connection` (a plain object when none is given) whose
 * `makeAdtRequest` answers `systeminformation` as a valid system does —
 * naming its user (`STAND_IN_SYSTEM`); any other request goes to its own
 * `makeAdtRequest`, if it has one, else is a `404`.
 */
export function withSystemInformation<T extends object>(
  connection: T = {} as T,
): T {
  const own = (connection as { makeAdtRequest?: (o: unknown) => unknown })
    .makeAdtRequest;
  return Object.assign(connection, {
    makeAdtRequest: async (options: { url?: string }) => {
      if (String(options?.url ?? '').startsWith(SYSTEM_INFORMATION)) {
        return {
          status: 200,
          data: {
            userName: STAND_IN_SYSTEM.user,
            systemID: STAND_IN_SYSTEM.systemId,
          },
        };
      }
      if (own) return own.call(connection, options);
      throw notFound();
    },
  });
}
