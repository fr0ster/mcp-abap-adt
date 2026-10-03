import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { registerConnectionResetHook } from './connectionEvents';
import { getEffectiveSystemContext } from './systemContext';
import { guardedSystemContext } from './systemContextGuard';
import { getManagedConnection } from './utils';

let adtClient: AdtClient | undefined;
let adtClientConnection: AbapConnection | undefined;

/**
 * The AdtClient this server builds: its system context refuses an empty
 * responsible where adt-clients is about to send one (`guardedSystemContext`),
 * so a change is never sent without one. An empty master system is left out.
 */
class GuardedAdtClient extends AdtClient {
  constructor(
    connection: IAbapConnection,
    logger: ILogger | undefined,
    options: ConstructorParameters<typeof AdtClient>[2],
  ) {
    super(connection, logger, options);
    this.systemContext = guardedSystemContext({
      masterSystem: options?.masterSystem,
      responsible: options?.responsible,
      masterLanguage: options?.masterLanguage,
    });
  }
}

export function createAdtClient(
  connection: IAbapConnection,
  logger?: ILogger,
): AdtClient {
  // Inside a request scope (HTTP/SSE, or an embedding host's own), the scope
  // decides masterLanguage, and responsible/masterSystem when it carries them —
  // never a value a previous request left in the process cache. stdio has no
  // scope → the process context. See getEffectiveSystemContext.
  const ctx = getEffectiveSystemContext();
  const options =
    ctx.masterSystem || ctx.responsible || ctx.masterLanguage
      ? {
          masterSystem: ctx.masterSystem,
          responsible: ctx.responsible,
          masterLanguage: ctx.masterLanguage,
        }
      : undefined;
  return new GuardedAdtClient(connection, logger, options);
}

export function getAdtClient(): AdtClient {
  const connection = getManagedConnection();

  if (!adtClient || adtClientConnection !== connection) {
    adtClient = createAdtClient(connection);
    adtClientConnection = connection;
  }

  return adtClient;
}

export function resetClientCache() {
  adtClient = undefined;
  adtClientConnection = undefined;
}

registerConnectionResetHook(resetClientCache);
