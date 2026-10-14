/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case; `undefined` only when the
 * system has no such endpoint (`404`: `readSystemInformation` answers
 * absent). An answer that names no user — the field missing, blank or no
 * string, a body that is no JSON or JSON that is no object — is not a valid
 * ABAP system for this server: `SystemWithoutUserError`. Any other failure
 * (`405`, `501`, a `5xx`, authentication, network) goes to the caller.
 *
 * The one place this is asked: the debugger's request user
 * (`requestUserOf`) and a background run's caller of a token credential,
 * whose request states no user.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { SystemWithoutUserError } from './requestSystemResolution';
import { readSystemInformation } from './systemInformation';

export async function systemUserOf(
  connection: IAbapConnection,
): Promise<string | undefined> {
  const info = await readSystemInformation(connection);
  if (info.kind === 'absent') return undefined;
  if (info.user === undefined) throw new SystemWithoutUserError();
  return info.user.trim().toUpperCase();
}
