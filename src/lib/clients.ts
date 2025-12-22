import { CrudClient, ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import { registerConnectionResetHook } from './connectionEvents';
import { getManagedConnection } from './utils';

let readOnlyClient: ReadOnlyClient | undefined;
let readOnlyClientConnection: AbapConnection | undefined;

let crudClient: CrudClient | undefined;
let crudClientConnection: AbapConnection | undefined;

export function getReadOnlyClient(): ReadOnlyClient {
  const connection = getManagedConnection();

  if (!readOnlyClient || readOnlyClientConnection !== connection) {
    readOnlyClient = new ReadOnlyClient(connection);
    readOnlyClientConnection = connection;
  }

  return readOnlyClient;
}

export function getCrudClient(): CrudClient {
  const connection = getManagedConnection();

  if (!crudClient || crudClientConnection !== connection) {
    crudClient = new CrudClient(connection);
    crudClientConnection = connection;
  }

  return crudClient;
}

export function resetClientCache() {
  readOnlyClient = undefined;
  readOnlyClientConnection = undefined;
  crudClient = undefined;
  crudClientConnection = undefined;
}

registerConnectionResetHook(resetClientCache);
