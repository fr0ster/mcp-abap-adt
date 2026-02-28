import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection, ILogger } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';
import { getSystemContext } from './systemContext';
import { getManagedConnection } from './utils';

let adtClient: AdtClient | undefined;
let adtClientConnection: AbapConnection | undefined;

export function createAdtClient(
  connection: IAbapConnection,
  logger?: ILogger,
): AdtClient {
  return new AdtClient(connection, logger, getSystemContext());
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
