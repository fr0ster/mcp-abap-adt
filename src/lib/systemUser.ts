/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case; `undefined` only when the
 * system has no such endpoint (`getSystemInformation` answers `null`). An
 * answer that names no user is not a valid ABAP system for this server:
 * `SystemWithoutUserError`. Any other failure (authentication, network) goes
 * to the caller.
 *
 * The one place this is asked: the debugger's request user
 * (`requestUserOf`) and a background run's caller of a token credential,
 * whose request states no user.
 */

import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { SystemWithoutUserError } from './requestSystemResolution';

export async function systemUserOf(
  connection: IAbapConnection,
): Promise<string | undefined> {
  const info = await getSystemInformation(connection);
  if (info === null || info === undefined) return undefined;
  const named: unknown = info.userName;
  const user = typeof named === 'string' ? named.trim() : '';
  if (user === '') throw new SystemWithoutUserError();
  return user.toUpperCase();
}
