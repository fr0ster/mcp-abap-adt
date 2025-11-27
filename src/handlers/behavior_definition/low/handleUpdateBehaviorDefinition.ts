/**
 * UpdateBehaviorDefinition Handler - Update ABAP Behavior Definition Source Code
 *
 * Uses CrudClient.updateBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateBehaviorDefinitionLow",
  description: "[low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Behavior definition name (e.g., ZOK_C_TEST_0001). Behavior definition must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete behavior definition source code."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockObject. Required for update operation."
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
    required: ["name", "source_code", "lock_handle"]
  }
} as const;

interface UpdateBehaviorDefinitionArgs {
  name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateBehaviorDefinition MCP tool
 *
 * Uses CrudClient.updateBehaviorDefinition - low-level single method call
 */
export async function handleUpdateBehaviorDefinition(args: UpdateBehaviorDefinitionArgs) {
  try {
    const {
      name,
      source_code,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateBehaviorDefinitionArgs;

    // Validation
    if (!name || !source_code || !lock_handle) {
      return return_error(new Error('name, source_code, and lock_handle are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const behaviorDefinitionName = name.toUpperCase();

    logger.info(`Starting behavior definition update: ${behaviorDefinitionName}`);

    try {
      // Update behavior definition with source code - using types from adt-clients
      const updateConfig: Pick<BehaviorDefinitionBuilderConfig, 'name' | 'sourceCode'> = {
        name: behaviorDefinitionName,
        sourceCode: source_code
      };
      await client.updateBehaviorDefinition(updateConfig, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for behavior definition ${behaviorDefinitionName}`);
      }

      // Get updated session state after update
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UpdateBehaviorDefinition completed: ${behaviorDefinitionName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          name: behaviorDefinitionName,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Behavior definition ${behaviorDefinitionName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating behavior definition ${behaviorDefinitionName}:`, error);

      // Parse error message
      let errorMessage = `Failed to update behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Behavior definition ${behaviorDefinitionName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Behavior definition ${behaviorDefinitionName} is locked by another user or lock handle is invalid.`;
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

