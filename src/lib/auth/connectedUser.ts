/**
 * The SAP user a request's own credentials log on as, as SAP answers it.
 *
 * A host that keeps state under an owner must not take the owner from an
 * unverified token claim: it asks SAP (`systeminformation`) on a connection
 * built from the request's own headers, so the token is verified by the
 * system that issued the answer. Nothing is cached or logged here.
 */
import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '../connectionFactory.js';
import { credentialFromHeaders } from '../credentialSources.js';

/**
 * Connects with the `x-sap-*` headers' credential and answers the user SAP
 * names; undefined when the system answers no user (no such endpoint). A
 * credential SAP refuses rejects.
 */
export async function connectedUserOf(
  headers: Record<string, string | string[] | undefined>,
): Promise<string | undefined> {
  const { settings, credential } = credentialFromHeaders(headers);
  const connection = createAbapConnection(settings, credential);
  await connection.connect();
  const info = await getSystemInformation(connection);
  return info?.userName || undefined;
}
