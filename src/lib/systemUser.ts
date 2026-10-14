/**
 * The SAP user a connection's session belongs to, as the system answers it
 * (`systeminformation`'s `userName`), upper case — asked of every system,
 * ABAP Cloud and on-premise alike: with passwordless logon or a provisioned
 * user, the user exists only inside the system, so its answer wins over any
 * configured login.
 *
 * An answer that names no user — the field missing, blank or no string, a
 * body that is no JSON or JSON that is no object — is not a valid ABAP
 * system for this server: `SystemWithoutUserError`. A `404` is the function
 * unavailable: on-premise the answer is `undefined` (the configured login
 * applies); on ABAP Cloud, which always has it, the destination is not a
 * valid ABAP Cloud system (`CloudWithoutSystemInformationError`) — the login
 * never stands in there. Any other failure (`405`, `501`, a `5xx`,
 * authentication, network) is thrown as it came. The kind is the one the connection was built for
 * (`systemKindOf`: the factory's recorded settings, else the server's stated
 * `systemType`, else `SAP_SYSTEM_TYPE`; none is `system_type_required`) —
 * the same the system-context resolver reads.
 *
 * Asked for the debugger's request user (`requestUserOf`) and a background
 * run's caller.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { systemKindOf } from './connectionFactory';
import {
  CloudWithoutSystemInformationError,
  SystemWithoutUserError,
} from './requestSystemResolution';
import {
  isSystemInformationUnavailable,
  readSystemInformation,
  type SystemInformation,
} from './systemInformation';

export async function systemUserOf(
  connection: IAbapConnection,
  systemType?: string,
): Promise<string | undefined> {
  let info: SystemInformation;
  try {
    info = await readSystemInformation(connection);
  } catch (error) {
    if (isSystemInformationUnavailable(error)) {
      if (systemKindOf(connection, process.env, systemType) !== 'cloud') {
        return undefined;
      }
      throw new CloudWithoutSystemInformationError();
    }
    throw error;
  }
  if (info.user === undefined) throw new SystemWithoutUserError();
  return info.user.trim().toUpperCase();
}
