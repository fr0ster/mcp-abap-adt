/**
 * CreateDdlLow Handler - Create ABAP DDL Source
 *
 * Uses AdtClient.getDdl().create from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Create a new ABAP DDL source. - use CreateDdl (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description:
          'DDL source name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'DDL source description.',
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
    required: ['ddl_name', 'description', 'package_name'],
  },
} as const;

interface CreateDdlArgs {
  ddl_name: string;
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
 * Main handler for CreateDdl MCP tool
 *
 * Uses AdtClient.getDdl().create - low-level single method call
 */
export async function handleCreateDdl(
  context: HandlerContext,
  args: CreateDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      ddl_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state,
    } = args as CreateDdlArgs;

    // Validation
    if (!ddl_name || !description || !package_name) {
      return return_error(
        new Error('ddl_name, description, and package_name are required'),
      );
    }

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Starting DDL source creation: ${ddlName}`);

    try {
      // Create DDL source
      const createState = await client.getDdl().create({
        ddlName: ddlName,
        description,
        packageName: package_name,
        ddlSource: '',
        transportRequest: transport_request,
      });
      const createResult = createState.createResult;

      if (!createResult) {
        throw new Error(
          `Create did not return a response for DDL source ${ddlName}`,
        );
      }

      // Get updated session state after create

      logger?.info(`✅ CreateDdlLow completed: ${ddlName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            description,
            package_name: package_name,
            transport_request: transport_request || null,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `DDL source ${ddlName} created successfully. Use LockDdlLow and UpdateDdlLow to add source code, then UnlockDdlLow and ActivateDdlLow.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating DDL source ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to create DDL source: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `DDL source ${ddlName} already exists.`;
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
