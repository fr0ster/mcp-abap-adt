/**
 * CreateView Handler - Create ABAP View
 *
 * Uses CrudClient.createView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';


export const TOOL_DEFINITION = {
  name: "CreateViewLow",
  description: "[low-level] Create a new ABAP view. - use CreateView (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "View description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      view_type: {
        type: "string",
        description: "View type: 'executable', 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool' (optional)."
      },
      application: {
        type: "string",
        description: "Application area (optional, default: '*')."
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
    required: ["view_name", "description", "package_name"]
  }
} as const;

interface CreateViewArgs {
  view_name: string;
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
 * Main handler for CreateView MCP tool
 *
 * Uses CrudClient.createView - low-level single method call
 */
export async function handleCreateView(context: HandlerContext, args: CreateViewArgs) {
  const { connection, logger } = context;
  try {
    const {
      view_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state
    } = args as CreateViewArgs;

    // Validation
    if (!view_name || !description || !package_name) {
      return return_error(new Error('view_name, description, and package_name are required'));
    }

        const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const viewName = view_name.toUpperCase();

    logger?.info(`Starting view creation: ${viewName}`);

    try {
      // Create view
      await client.createView({
        viewName,
        description,
        packageName: package_name,
        ddlSource: '',
        transportRequest: transport_request
      });
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for view ${viewName}`);
      }

      // Get updated session state after create


      logger?.info(`✅ CreateView completed: ${viewName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          view_name: viewName,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `View ${viewName} created successfully. Use LockView and UpdateView to add source code, then UnlockView and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger?.error(`Error creating view ${viewName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to create view: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `View ${viewName} already exists.`;
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
