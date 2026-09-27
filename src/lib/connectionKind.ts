/**
 * Whether a connection goes over RFC.
 *
 * Over RFC `RfcTransport` keeps one ABAP session for every call, so what an
 * ABAP program leaves in its session — a static buffer, say — is still there
 * on the next call. Over HTTP a stateless request ends its session.
 */
export function isRfcConnection(connection: unknown): boolean {
  const config = (
    connection as
      | { getConfig?: () => { connectionType?: string } | undefined }
      | undefined
  )?.getConfig?.();
  return config?.connectionType === 'rfc';
}
