/**
 * CreateFunctionGroup Handler - Create ABAP Function Group
 *
 * Uses CrudClient.createFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateFunctionGroupLow",
  description: "[low-level] Create a new ABAP function group. - use CreateFunctionGroup (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., ZFG_MY_GROUP). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Function group description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
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
    required: ["function_group_name", "description", "package_name"]
  }
} as const;

interface CreateFunctionGroupArgs {
  function_group_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateFunctionGroup MCP tool
 *
 * Uses CrudClient.createFunctionGroup - low-level single method call
 */
export async function handleCreateFunctionGroup(args: any) {
  try {
    const {
      function_group_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state
    } = args as CreateFunctionGroupArgs;

    // Validation
    if (!function_group_name || !description || !package_name) {
      return return_error(new Error('function_group_name, description, and package_name are required'));
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

    const functionGroupName = function_group_name.toUpperCase();

    logger.info(`Starting function group creation: ${functionGroupName}`);

    try {
      // Create function group
      await client.createFunctionGroup(
        functionGroupName,
        description,
        package_name,
        transport_request
      );
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for function group ${functionGroupName}`);
      }

      // Get updated session state after create
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CreateFunctionGroup completed: ${functionGroupName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          function_group_name: functionGroupName,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Function group ${functionGroupName} created successfully. Use LockFunctionGroup and UpdateFunctionGroup to add source code, then UnlockFunctionGroup and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating function group ${functionGroupName}:`, error);

      // Parse error message
      let errorMessage = `Failed to create function group: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Function group ${functionGroupName} already exists.`;
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
