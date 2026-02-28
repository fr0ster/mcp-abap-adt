/**
 * UnlockBehaviorDefinition Handler - Unlock ABAP Behavior Definition
 *
 * Uses AdtClient.unlockBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import type { IBehaviorDefinitionConfig } from '@mcp-abap-adt/adt-clients';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockBehaviorDefinitionLow',
  description:
    '[low-level] Unlock an ABAP behavior definition after modification. Must use the same session_id and lock_handle from LockBehaviorDefinition operation.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., ZI_MY_BDEF).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockBehaviorDefinition operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockBehaviorDefinition operation. Must be the same as used in LockBehaviorDefinition.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockBehaviorDefinition (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['name', 'lock_handle', 'session_id'],
  },
} as const;

interface UnlockBehaviorDefinitionArgs {
  name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockBehaviorDefinition MCP tool
 *
 * Uses AdtClient.unlockBehaviorDefinition - low-level single method call
 */
export async function handleUnlockBehaviorDefinition(
  context: HandlerContext,
  args: UnlockBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  try {
    const { name, lock_handle, session_id, session_state } =
      args as UnlockBehaviorDefinitionArgs;

    // Validation
    if (!name || !lock_handle || !session_id) {
      return return_error(
        new Error('name, lock_handle, and session_id are required'),
      );
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const bdefName = name.toUpperCase();

    logger?.info(
      `Starting behavior definition unlock: ${bdefName} (session: ${session_id.substring(0, 8)}...)`,
    );

    try {
      // Unlock behavior definition - using types from adt-clients
      const unlockConfig: Pick<IBehaviorDefinitionConfig, 'name'> = {
        name: bdefName,
      };
      const unlockState = await client
        .getBehaviorDefinition()
        .unlock(unlockConfig, lock_handle);
      const unlockResult = unlockState.unlockResult;

      if (!unlockResult) {
        throw new Error(
          `Unlock did not return a response for behavior definition ${bdefName}`,
        );
      }

      // Get updated session state after unlock

      logger?.info(`✅ UnlockBehaviorDefinition completed: ${bdefName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            name: bdefName,
            session_id: session_id,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `BehaviorDefinition ${bdefName} unlocked successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error unlocking behavior definition ${bdefName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to unlock behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${bdefName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockBehaviorDefinition.`;
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
