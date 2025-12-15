/**
 * CreateBehaviorDefinition Handler - Create ABAP Behavior Definition
 *
 * Uses CrudClient.createBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig, BehaviorDefinitionImplementationType } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: "CreateBehaviorDefinitionLow",
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
  transport_request?: string; // Optional for local packages ($TMP)
  root_entity: string;
  implementation_type: BehaviorDefinitionImplementationType;
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
export async function handleCreateBehaviorDefinition(context: HandlerContext, args: CreateBehaviorDefinitionArgs) {
  const { connection, logger } = context;
  try {
    const {
      name,
      description,
      package_name,
      transport_request,
      root_entity,
      implementation_type,
      session_id,
      session_state
    } = args as CreateBehaviorDefinitionArgs;

    // Validation
    // Note: transport_request is optional (can be empty for local objects)
    if (!name || !description || !package_name || !root_entity || !implementation_type) {
      return return_error(new Error('name, description, package_name, root_entity, and implementation_type are required'));
    }

        const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const bdefName = name.toUpperCase();

    logger.info(`Starting behavior definition creation: ${bdefName}`);

    try {
      // Create behavior definition - using types from adt-clients
      const createConfig: Pick<BehaviorDefinitionBuilderConfig, 'name' | 'description' | 'packageName' | 'transportRequest' | 'rootEntity' | 'implementationType'> = {
        name: bdefName,
        description,
        packageName: package_name,
        transportRequest: transport_request,
        rootEntity: root_entity,
        implementationType: implementation_type
      };
      await client.createBehaviorDefinition(createConfig);
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for behavior definition ${bdefName}`);
      }

      // Get updated session state after create


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
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Behavior Definition ${bdefName} created successfully. Use LockBehaviorDefinition and UpdateBehaviorDefinition to add source code, then UnlockBehaviorDefinition and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating behavior definition ${bdefName}: ${error?.message || error}`);

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
