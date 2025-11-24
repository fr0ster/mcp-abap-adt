/**
 * CreateBehaviorDefinition Handler - Create ABAP Behavior Definition
 *
 * Uses CrudClient.createBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateBehaviorDefinition",
  description: "[low-level] Create a new ABAP Behavior Definition. - use CreateBehaviorDefinition (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Behavior Definition name (e.g., ZI_MY_BDEF)."
      },
      description: {
        type: "string",
        description: "Behavior Definition description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required."
      },
      root_entity: {
        type: "string",
        description: "Root entity name (e.g., ZI_MY_ENTITY)."
      },
      implementation_type: {
        type: "string",
        description: "Implementation type: 'Managed', 'Unmanaged', 'Abstract', or 'Projection'.",
        enum: ["Managed", "Unmanaged", "Abstract", "Projection"]
      },
      master_system: {
        type: "string",
        description: "Master system (optional)."
      },
      responsible: {
        type: "string",
        description: "User responsible for the behavior definition (optional)."
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
    required: ["name", "description", "package_name", "transport_request", "root_entity", "implementation_type"]
  }
} as const;

interface CreateBehaviorDefinitionArgs {
  name: string;
  description: string;
  package_name: string;
  transport_request: string;
  root_entity: string;
  implementation_type: 'Managed' | 'Unmanaged' | 'Abstract' | 'Projection';
  master_system?: string;
  responsible?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateBehaviorDefinition MCP tool
 *
 * Uses CrudClient.createBehaviorDefinition - low-level single method call
 */
export async function handleCreateBehaviorDefinition(args: any) {
  try {
    const {
      name,
      description,
      package_name,
      transport_request,
      root_entity,
      implementation_type,
      master_system,
      responsible,
      session_id,
      session_state
    } = args as CreateBehaviorDefinitionArgs;

    // Validation
    if (!name || !description || !package_name || !transport_request || !root_entity || !implementation_type) {
      return return_error(new Error('name, description, package_name, transport_request, root_entity, and implementation_type are required'));
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

    const bdefName = name.toUpperCase();

    logger.info(`Starting behavior definition creation: ${bdefName}`);

    try {
      // Create behavior definition
      await client.createBehaviorDefinition(
        bdefName,
        description,
        package_name,
        transport_request,
        root_entity,
        implementation_type,
        {
          masterSystem: master_system,
          responsible
        }
      );
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for behavior definition ${bdefName}`);
      }

      // Get updated session state after create
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CreateBehaviorDefinition completed: ${bdefName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          name: bdefName,
          description,
          package_name: package_name,
          transport_request: transport_request,
          root_entity: root_entity,
          implementation_type: implementation_type,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Behavior Definition ${bdefName} created successfully. Use LockBehaviorDefinition and UpdateBehaviorDefinition to add source code, then UnlockBehaviorDefinition and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating behavior definition ${bdefName}:`, error);

      // Parse error message
      let errorMessage = `Failed to create behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Behavior Definition ${bdefName} already exists.`;
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
