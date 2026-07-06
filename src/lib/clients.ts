import { AdtClient, AdtClientLegacy } from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection, ILogger } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';
import { getRequestContext } from './requestContext';
import { getSystemContext } from './systemContext';
import { getManagedConnection } from './utils';

let adtClient: AdtClient | undefined;
let adtClientConnection: AbapConnection | undefined;

export function createAdtClient(
  connection: IAbapConnection,
  logger?: ILogger,
): AdtClient {
  const ctx = getSystemContext();
  // masterLanguage is per-request/per-session (x-sap-language). Inside an
  // HTTP/SSE request scope, read it ONLY from the request context — never fall
  // back to the process-global cache, which would leak a value from a previous
  // request/session/mode. stdio has no request scope → use the process context.
  const reqCtx = getRequestContext();
  const masterLanguage = reqCtx ? reqCtx.masterLanguage : ctx.masterLanguage;
  const options =
    ctx.masterSystem || ctx.responsible || masterLanguage
      ? {
          masterSystem: ctx.masterSystem,
          responsible: ctx.responsible,
          masterLanguage,
        }
      : undefined;
  if (ctx.isLegacy) {
    return new AdtClientLegacy(connection, logger, options);
  }
  return new AdtClient(connection, logger, options);
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
