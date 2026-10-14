/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case — asked only of ABAP Cloud,
 * the one kind of system that has the endpoint. On-premise nothing is asked
 * and the answer is `undefined`: the configured login applies. The kind is
 * the one the connection was built for (`systemKindOf`: the factory's
 * recorded settings, else the server's stated `systemType`, else
 * `SAP_SYSTEM_TYPE`, else on-premise) — the same the system-context resolver
 * reads.
 *
 * On ABAP Cloud an answer that names no user — the field missing, blank or no
 * string, a body that is no JSON or JSON that is no object — is not a valid
 * ABAP system for this server: `SystemWithoutUserError`. Any other failure
 * (`404`, `405`, `501`, a `5xx`, authentication, network) goes to the caller
 * as it came; the login never stands in.
 *
 * The one place this is asked: the debugger's request user
 * (`requestUserOf`) and a background run's caller of a token credential,
 * whose request states no user.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { systemKindOf } from './connectionFactory';
import { SystemWithoutUserError } from './requestSystemResolution';
import { readSystemInformation } from './systemInformation';

export async function systemUserOf(
  connection: IAbapConnection,
  systemType?: string,
): Promise<string | undefined> {
  if (systemKindOf(connection, process.env, systemType) !== 'cloud') {
    return undefined;
  }
  const info = await readSystemInformation(connection);
  if (info.user === undefined) throw new SystemWithoutUserError();
  return info.user.trim().toUpperCase();
}
