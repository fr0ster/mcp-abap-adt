/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case; `undefined` when the
 * system names none or has no such endpoint (`getSystemInformation` answers
 * `null`). Any other failure (authentication, network) goes to the caller.
 *
 * The one place this is asked: the debugger's request user
 * (`requestUserOf`) and the leftover-session records of a token credential,
 * whose request states no user.
 */

import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

export async function systemUserOf(
  connection: IAbapConnection,
): Promise<string | undefined> {
  const info = await getSystemInformation(connection);
  const user = info?.userName?.trim();
  return user ? user.toUpperCase() : undefined;
}
