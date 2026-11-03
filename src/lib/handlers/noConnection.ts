import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

/** What a use of the registration-only connection throws. */
export const NO_CONNECTION_WORDS =
  'No connection: this context is built for registration only, and a call is given a context of its own';

function refuse(): never {
  throw new Error(NO_CONNECTION_WORDS);
}

/**
 * The connection of a context built before any connection exists: a group
 * is built against it to register its tools, and every call is given its
 * own context. Every member refuses.
 */
export const noConnection: IAbapConnection = {
  connect: async () => refuse(),
  getBaseUrl: async () => refuse(),
  getSessionId: () => refuse(),
  setSessionType: () => refuse(),
  makeAdtRequest: async () => refuse(),
};
