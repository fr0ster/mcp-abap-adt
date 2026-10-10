/**
 * The SAP user a request's own credentials log on as, as SAP answers it.
 *
 * A host that keeps state under an owner must not take the owner from an
 * unverified token claim: it asks SAP (`systeminformation`) on a connection
 * built from the request's own headers, so the token is verified by the
 * system that issued the answer. Nothing is cached here, and the lookup's
 * own SAP session is closed whatever it answered: left open, it would count
 * against the user until the system's idle timeout.
 */
import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import { credentialFromHeaders, errorClassOf } from '@mcp-abap-adt/lib/auth';
import { createAbapConnection, logger } from '@mcp-abap-adt/lib/utils';

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
  try {
    await connection.connect();
    const info = await getSystemInformation(connection);
    return info?.userName || undefined;
  } finally {
    await closeSession(connection);
  }
}

/** Closes the lookup's session; a failure is logged by its class, never thrown over the answer. */
async function closeSession(connection: object): Promise<void> {
  const closable = connection as { disconnect?: () => Promise<void> };
  if (typeof closable.disconnect !== 'function') return;
  try {
    await closable.disconnect();
  } catch (error) {
    // The class only: a message may quote what the system answered.
    logger.warn(
      `owner lookup: could not close its session: ${errorClassOf(error)}`,
    );
  }
}
