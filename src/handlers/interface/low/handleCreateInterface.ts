/**
 * CreateInterface Handler - Create ABAP Interface
 *
 * Uses CrudClient.createInterface from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateInterfaceLow",
  description: "[low-level] Create a new ABAP interface. - use CreateInterface (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: {
        type: "string",
        description: "Interface name (e.g., ZIF_TEST_INTERFACE). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Interface description."
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
    required: ["interface_name", "description", "package_name"]
  }
} as const;

interface CreateInterfaceArgs {
  interface_name: string;
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
 * Main handler for CreateInterface MCP tool
 *
 * Uses CrudClient.createInterface - low-level single method call
 */
export async function handleCreateInterface(args: CreateInterfaceArgs) {
  try {
    const {
      interface_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state
    } = args as CreateInterfaceArgs;

    // Validation
    if (!interface_name || !description || !package_name) {
      return return_error(new Error('interface_name, description, and package_name are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleCreateInterfaceLow',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const interfaceName = interface_name.toUpperCase();

    handlerLogger.info(`Starting interface creation: ${interfaceName}`);

    try {
      // Create interface
      await client.createInterface({
        interfaceName,
        description,
        packageName: package_name,
        transportRequest: transport_request
      });
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for interface ${interfaceName}`);
      }

      // Get updated session state after create


      handlerLogger.info(`✅ CreateInterface completed: ${interfaceName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          interface_name: interfaceName,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Interface ${interfaceName} created successfully. Use LockInterface and UpdateInterface to add source code, then UnlockInterface and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error creating interface ${interfaceName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to create interface: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Interface ${interfaceName} already exists.`;
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
