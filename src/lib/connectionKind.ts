/**
 * Whether a connection goes over RFC.
 *
 * Over RFC `RfcTransport` keeps one ABAP session for every call, so what an
 * ABAP program leaves in its session — a static buffer, say — is still there
 * on the next call. Over HTTP a stateless request ends its session.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

export function isRfcConnection(connection: IAbapConnection): boolean {
  return connection.getConfig?.().connectionType === 'rfc';
}
