/**
 * CreateClass Handler - Create ABAP Class
 *
 * Uses CrudClient.createClass from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateClassLow",
  description: "[low-level] Create a new ABAP class. - use CreateClass (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Class description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      superclass: {
        type: "string",
        description: "Superclass name (optional)."
      },
      final: {
        type: "boolean",
        description: "Mark class as final (optional, default: false)."
      },
      abstract: {
        type: "boolean",
        description: "Mark class as abstract (optional, default: false)."
      },
      create_protected: {
        type: "boolean",
        description: "Create protected section (optional, default: false)."
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
    required: ["class_name", "description", "package_name"]
  }
} as const;

interface CreateClassArgs {
  class_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateClass MCP tool
 *
 * Uses CrudClient.createClass - low-level single method call
 */
export async function handleCreateClass(args: CreateClassArgs) {
  try {
    const {
      class_name,
      description,
      package_name,
      transport_request,
      superclass,
      final,
      abstract,
      create_protected,
      session_id,
      session_state
    } = args;

    // Validation
    if (!class_name || !description || !package_name) {
      return return_error(new Error('class_name, description, and package_name are required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleCreateClass',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
    const connection = getManagedConnection();

    // Check if connection can refresh token (for debugging)
    const connectionWithRefresh = connection as any;
    if (process.env.DEBUG_HANDLERS === 'true' && connectionWithRefresh.canRefreshToken) {
      const canRefresh = connectionWithRefresh.canRefreshToken();
      handlerLogger.debug(`Connection can refresh token: ${canRefresh}`);
    }

    const client = new CrudClient(connection);

    // NOTE: Do NOT call connection.connect() here
    // getManagedConnection() already calls connect() when creating connection
    // Calling connect() again can trigger unnecessary token refresh attempts
    // Connection will be established automatically on first request if needed

    const className = class_name.toUpperCase();

    handlerLogger.info(`Starting class creation: ${className}`);

    try {
      // Create class
      await client.createClass({
        className,
        description,
        packageName: package_name,
        transportRequest: transport_request,
        superclass,
        final,
        abstract,
        createProtected: create_protected
      });
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for class ${className}`);
      }

      // Get updated session state after create
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ CreateClass completed: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Class ${className} created successfully. Use LockObject and UpdateClass to add source code, then UnlockObject and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error creating class ${className}: ${error.message || String(error)}`);

      // Parse error message
      let errorMessage = `Failed to create class: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Class ${className} already exists.`;
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
