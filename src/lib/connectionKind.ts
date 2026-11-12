/**
 * Whether a connection goes over RFC.
 *
 * Over RFC `RfcTransport` keeps one ABAP session for every call, so what an
 * ABAP program leaves in its session — a static buffer, say — is still there
 * on the next call. Over HTTP a stateless request ends its session.
 */
import { hasMethod } from './capability';
import { child } from './xml/tree';

export function isRfcConnection(connection: unknown): boolean {
  if (!hasMethod(connection, 'getConfig')) return false;
  return child(connection.getConfig(), 'connectionType') === 'rfc';
}
