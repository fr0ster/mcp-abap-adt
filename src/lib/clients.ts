import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import { registerConnectionResetHook } from './connectionEvents';
import { getManagedConnection } from './utils';

let adtClient: AdtClient | undefined;
let adtClientConnection: AbapConnection | undefined;

export function getAdtClient(): AdtClient {
  const connection = getManagedConnection();

  if (!adtClient || adtClientConnection !== connection) {
    adtClient = new AdtClient(connection);
    adtClientConnection = connection;
  }

  return adtClient;
}

export function resetClientCache() {
  adtClient = undefined;
  adtClientConnection = undefined;
}

registerConnectionResetHook(resetClientCache);
