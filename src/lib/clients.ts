import { CrudClient, ManagementClient, ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import { getManagedConnection } from './utils';
import { registerConnectionResetHook } from './connectionEvents';

let readOnlyClient: ReadOnlyClient | undefined;
let readOnlyClientConnection: AbapConnection | undefined;

let crudClient: CrudClient | undefined;
let crudClientConnection: AbapConnection | undefined;

let managementClient: ManagementClient | undefined;
let managementClientConnection: AbapConnection | undefined;

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

export function getManagementClient(): ManagementClient {
  const connection = getManagedConnection();

  if (!managementClient || managementClientConnection !== connection) {
    managementClient = new ManagementClient(connection);
    managementClientConnection = connection;
  }

  return managementClient;
}

export function resetClientCache() {
  readOnlyClient = undefined;
  readOnlyClientConnection = undefined;
  crudClient = undefined;
  crudClientConnection = undefined;
  managementClient = undefined;
  managementClientConnection = undefined;
}

registerConnectionResetHook(resetClientCache);


