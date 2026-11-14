/**
 * Whether a connection goes over RFC.
 *
 * Over RFC `RfcTransport` keeps one ABAP session for every call, so what an
 * ABAP program leaves in its session — a static buffer, say — is still there
 * on the next call. Over HTTP a stateless request ends its session.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { hasMethod } from './capability';
import { child } from './thrownValue';

export function isRfcConnection(connection: IAbapConnection): boolean {
  if (!hasMethod(connection, 'getConfig')) return false;
  return child(connection.getConfig(), 'connectionType') === 'rfc';
}
