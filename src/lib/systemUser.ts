/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case — asked of every system,
 * ABAP Cloud and on-premise alike, through the shipped resolver
 * (`systemContextResolverFor`): an answer naming the user is that user;
 * anything else is no information — on ABAP Cloud a `404`
 * `CloudWithoutSystemInformationError` (the caller's
 * `cloud_without_systeminformation`) and any other
 * `NoSystemInformationError` (`system_lookup_failed`); on-premise
 * `undefined` (the configured login applies). A chain failure is
 * thrown as it came. The kind is the one the connection was built for
 * (`systemKindOf`: the factory's recorded settings, else the server's stated
 * `systemType`, else `SAP_SYSTEM_TYPE`).
 *
 * Asked for the debugger's request user (`requestUserOf`) and a background
 * run's caller.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { systemContextResolverFor } from './requestSystemResolution';

export async function systemUserOf(
  connection: IAbapConnection,
  systemType?: string,
): Promise<string | undefined> {
  const system = await systemContextResolverFor(systemType)(connection);
  return system?.responsible?.trim().toUpperCase();
}
