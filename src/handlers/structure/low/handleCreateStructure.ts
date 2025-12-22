/**
 * CreateStructure Handler - Create ABAP Structure
 *
 * Uses CrudClient.createStructure from @mcp-abap-adt/adt-clients.
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
  name: 'CreateStructureLow',
  description:
    '[low-level] Create a new ABAP structure. - use CreateStructure (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description:
          'Structure name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'Structure description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      structure_type: {
        type: 'string',
        description:
          "Structure type: 'executable', 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool' (optional).",
      },
      application: {
        type: 'string',
        description: "Application area (optional, default: '*').",
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['structure_name', 'description', 'package_name'],
  },
} as const;

interface CreateStructureArgs {
  structure_name: string;
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
 * Main handler for CreateStructure MCP tool
 *
 * Uses CrudClient.createStructure - low-level single method call
 */
export async function handleCreateStructure(
  context: HandlerContext,
  args: CreateStructureArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      structure_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state,
    } = args as CreateStructureArgs;

    // Validation
    if (!structure_name || !description || !package_name) {
      return return_error(
        new Error('structure_name, description, and package_name are required'),
      );
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const structureName = structure_name.toUpperCase();

    logger?.info(`Starting structure creation: ${structureName}`);

    try {
      // Create structure
      await client.createStructure({
        structureName,
        description,
        packageName: package_name,
        ddlCode: '',
        transportRequest: transport_request,
      });
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(
          `Create did not return a response for structure ${structureName}`,
        );
      }

      // Get updated session state after create

      logger?.info(`✅ CreateStructure completed: ${structureName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            structure_name: structureName,
            description,
            package_name: package_name,
            transport_request: transport_request || null,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Structure ${structureName} created successfully. Use LockStructure and UpdateStructure to add source code, then UnlockStructure and ActivateObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(`Error creating structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to create structure: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Structure ${structureName} already exists.`;
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
