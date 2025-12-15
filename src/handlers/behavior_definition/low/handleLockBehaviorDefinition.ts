/**
 * LockBehaviorDefinition Handler - Lock ABAP Behavior Definition
 *
 * Uses CrudClient.lockBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "LockBehaviorDefinitionLow",
  description: "[low-level] Lock an ABAP behavior definition for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "BehaviorDefinition name (e.g., ZI_MY_BDEF)."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["name"]
  }
} as const;

interface LockBehaviorDefinitionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockBehaviorDefinition MCP tool
 *
 * Uses CrudClient.lockBehaviorDefinition - low-level single method call
 */
export async function handleLockBehaviorDefinition(context: HandlerContext, args: LockBehaviorDefinitionArgs) {
  const { connection, logger } = context;
  try {
    const {
      name,
      session_id,
      session_state
    } = args as LockBehaviorDefinitionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const bdefName = name.toUpperCase();

    logger.info(`Starting behavior definition lock: ${bdefName}`);

    try {
      // Lock behavior definition - using types from adt-clients
      const lockConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = {
        name: bdefName
      };
      await client.lockBehaviorDefinition(lockConfig);
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for behavior definition ${bdefName}`);
      }

      // Get updated session state after lock


      logger.info(`✅ LockBehaviorDefinition completed: ${bdefName}`);
      logger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          name: bdefName,
          session_id: session_id || null,
          lock_handle: lockHandle,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `BehaviorDefinition ${bdefName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error locking behavior definition ${bdefName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to lock behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${bdefName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `BehaviorDefinition ${bdefName} is already locked by another user.`;
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
