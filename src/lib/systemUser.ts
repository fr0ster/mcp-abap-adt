/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case — asked of every system,
 * ABAP Cloud and on-premise alike, through the shipped resolver, and read by
 * the server's recipe (`systemOf`): an answer naming the user is that user;
 * no information is, on ABAP Cloud, the caller's error (a `404`
 * `CloudWithoutSystemInformationError`, any other
 * `NoSystemInformationError`), on-premise `undefined` (the configured login
 * applies). On-premise a `404` (an older system without the endpoint) is
 * kept for the connection, so it is not asked again; nothing else is kept.
 * A credential failure is thrown as it came. The kind is the one the
 * connection was built for (`systemKindOf`: the factory's recorded
 * settings, else the server's stated `systemType`, else `SAP_SYSTEM_TYPE`).
 *
 * Asked for the debugger's request user (`requestUserOf`) and a background
 * run's caller.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { systemKindOf } from './connectionFactory';
import {
  defaultSystemContextResolver,
  isKeptLookup,
  lookUpSystem,
  type SystemLookup,
  systemOf,
} from './requestSystemResolution';

/** Connections whose on-premise system has no `systeminformation` (a `404`). */
const withoutEndpoint = new WeakSet<object>();

export async function systemUserOf(
  connection: IAbapConnection,
  systemType?: string,
): Promise<string | undefined> {
  const kind = () => systemKindOf(connection, process.env, systemType);
  let lookup: SystemLookup;
  if (withoutEndpoint.has(connection)) {
    lookup = { system: null, absent: true };
  } else {
    lookup = await lookUpSystem(defaultSystemContextResolver, connection);
    if (lookup.system === null && isKeptLookup(lookup, kind)) {
      withoutEndpoint.add(connection);
    }
  }
  const system = systemOf(lookup, kind);
  return system?.responsible?.trim().toUpperCase();
}
