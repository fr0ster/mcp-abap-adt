/**
 * Whether a failed answer says its connection is spent: the SAP session it
 * was sent in is gone, and SAP's logoff of that session freed what it held
 * (its locks, a debuggee attached in it). Read from the typed verdict alone
 * (`@mcp-abap-adt/interfaces-adt` 27.3): the connection's own session error,
 * `ADT_NOT_CONNECTED` or `ADT_SESSION_REPLACED`, or SAP's answer marked
 * `sessionLost` — never from the message. `ADT_RELEASE_PENDING` and every
 * other failure are no spent connection.
 */
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';

export function spentBy(error: IAdtError): boolean {
  return (
    error.sessionLost !== undefined ||
    error.sessionError === ADT_SESSION_ERROR.NOT_CONNECTED ||
    error.sessionError === ADT_SESSION_ERROR.SESSION_REPLACED
  );
}
