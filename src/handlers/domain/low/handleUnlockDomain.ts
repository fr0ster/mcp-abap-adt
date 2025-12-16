/**
 * UnlockDomain Handler - Unlock ABAP Domain
 *
 * Uses CrudClient.unlockDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UnlockDomainLow",
  description: "[low-level] Unlock an ABAP domain after modification. Must use the same session_id and lock_handle from LockDomain operation.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., Z_MY_PROGRAM)."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockDomain operation."
      },
      session_id: {
        type: "string",
        description: "Session ID from LockDomain operation. Must be the same as used in LockDomain."
      },
      session_state: {
        type: "object",
        description: "Session state from LockDomain (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["domain_name", "lock_handle", "session_id"]
  }
} as const;

interface UnlockDomainArgs {
  domain_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockDomain MCP tool
 *
 * Uses CrudClient.unlockDomain - low-level single method call
 */
export async function handleUnlockDomain(context: HandlerContext, args: UnlockDomainArgs) {
  const { connection, logger } = context;
  try {
    const {
      domain_name,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockDomainArgs;

    // Validation
    if (!domain_name || !lock_handle || !session_id) {
      return return_error(new Error('domain_name, lock_handle, and session_id are required'));
    }

    const client = new CrudClient(connection);

    const domainName = domain_name.toUpperCase();

    logger?.info(
      `Starting unlock for ${domainName}; lock_handle=${lock_handle}; session=${session_id.substring(0, 8)}...; session_state=${session_state ? 'provided' : 'none'}`
    );

    // Restore session state if provided
    if (session_state) {
      logger?.info(
        `Restoring session state from lock: cookies=${session_state.cookies?.length || 0}, csrf=${session_state.csrf_token?.length || 0}, store_keys=${session_state.cookie_store ? Object.keys(session_state.cookie_store).length : 0}`
      );

      // CRITICAL: Use restoreSessionInConnection to properly restore session
      // This will set sessionId in connection and enable stateful session mode
      await restoreSessionInConnection(connection, session_id, session_state);

      // Verify session was restored
      logger?.info(
        `Session state restored (conn session ${connection.getSessionId()})`
      );
    } else {
      logger?.warn('No session state provided (may fail if domain is locked)');
      // Ensure connection is established
    }

    logger?.info(`Starting domain unlock: ${domainName} (session: ${session_id.substring(0, 8)}...)`);

    try {
      // Unlock domain
      logger?.debug(`Calling client.unlockDomain({ domainName: ${domainName} }, ${lock_handle})`);
      await client.unlockDomain({ domainName }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(`Unlock did not return a response for domain ${domainName}`);
      }

      // Session state management is now handled by auth-broker

      logger?.info(`✅ UnlockDomain completed: ${domainName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          session_id: session_id,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Domain ${domainName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger?.error(`Error unlocking domain ${domainName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to unlock domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockDomain.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
