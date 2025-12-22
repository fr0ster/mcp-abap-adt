/**
 * UnlockStructure Handler - Unlock ABAP Structure
 *
 * Uses CrudClient.unlockStructure from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockStructureLow',
  description:
    '[low-level] Unlock an ABAP structure after modification. Must use the same session_id and lock_handle from LockStructure operation.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., Z_MY_PROGRAM).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockStructure operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockStructure operation. Must be the same as used in LockStructure.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockStructure (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['structure_name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockStructureArgs {
  structure_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockStructure MCP tool
 *
 * Uses CrudClient.unlockStructure - low-level single method call
 */
export async function handleUnlockStructure(
  context: HandlerContext,
  args: UnlockStructureArgs,
) {
  const { connection, logger } = context;
  try {
    const { structure_name, lock_handle, session_id, session_state } =
      args as UnlockStructureArgs;

    // Validation
    if (!structure_name || !lock_handle || !session_id) {
      return return_error(
        new Error('structure_name, lock_handle, and session_id are required'),
      );
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const structureName = structure_name.toUpperCase();

    logger?.info(
      `Starting structure unlock: ${structureName} (session: ${session_id.substring(0, 8)}...)`,
    );

    try {
      // Unlock structure
      await client.unlockStructure(
        { structureName: structureName },
        lock_handle,
      );
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(
          `Unlock did not return a response for structure ${structureName}`,
        );
      }

      // Get updated session state after unlock

      logger?.info(`✅ UnlockStructure completed: ${structureName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            structure_name: structureName,
            session_id: session_id,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Structure ${structureName} unlocked successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(`Error unlocking structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to unlock structure: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Structure ${structureName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockStructure.`;
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
