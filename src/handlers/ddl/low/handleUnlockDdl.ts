/**
 * UnlockDdlLow Handler - Unlock ABAP DDL Source
 *
 * Uses AdtClient.unlockView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Unlock an ABAP DDL source after modification. Must use the same session_id and lock_handle from LockDdlLow operation.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockDdlLow operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockDdlLow operation. Must be the same as used in LockDdlLow.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockDdlLow (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['ddl_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockDdlArgs {
  ddl_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockDdl MCP tool
 *
 * Uses AdtClient.unlockView - low-level single method call
 */
export async function handleUnlockDdl(
  context: HandlerContext,
  args: UnlockDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, lock_handle, session_id, session_state } =
      args as UnlockDdlArgs;

    // Validation
    if (!ddl_name || !lock_handle || !session_id) {
      return return_error(
        new Error('ddl_name, lock_handle, and session_id are required'),
      );
    }

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlName = ddl_name.toUpperCase();

    logger?.info(
      `Starting view unlock: ${ddlName} (session: ${session_id.substring(0, 8)}...)`,
    );

    try {
      // Unlock view
      const unlockState = await client
        .getDdl()
        .unlock({ ddlName: ddlName }, lock_handle);
      const unlockResult = unlockState.unlockResult;

      if (!unlockResult) {
        throw new Error(
          `Unlock did not return a response for DDL source ${ddlName}`,
        );
      }

      // Get updated session state after unlock

      logger?.info(`✅ UnlockDdlLow completed: ${ddlName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            session_id: session_id,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `DDL source ${ddlName} unlocked successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error unlocking view ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to unlock DDL source: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DDL source ${ddlName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockDdlLow.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
