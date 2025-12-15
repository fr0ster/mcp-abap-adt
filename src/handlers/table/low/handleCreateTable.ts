/**
 * CreateTable Handler - Create ABAP Table
 *
 * Uses CrudClient.createTable from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { TableBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "CreateTableLow",
  description: "[low-level] Create a new ABAP table. - use CreateTable (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., ZT_TEST_001). Must follow SAP naming conventions."
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
    required: ["table_name", "package_name"]
  }
} as const;

interface CreateTableArgs extends Pick<TableBuilderConfig, 'tableName' | 'packageName' | 'transportRequest' | 'description'> {
  table_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  table_type?: string;
  application?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateTable MCP tool
 *
 * Uses CrudClient.createTable - low-level single method call
 */
export async function handleCreateTable(context: HandlerContext, args: CreateTableArgs) {
  const { connection, logger } = context;
  try {
    const {
      table_name,
      package_name,
      transport_request,
      session_id,
      session_state
    } = args as CreateTableArgs;

    // Validation
    if (!table_name || !package_name) {
      return return_error(new Error('table_name and package_name are required'));
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const tableName = table_name.toUpperCase();

    logger.info(`Starting table creation: ${tableName}`);

    try {
      // Create table
      await client.createTable({
        tableName,
        packageName: package_name,
        description: '',
        ddlCode: '',
        transportRequest: transport_request
      });
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for table ${tableName}`);
      }

      // Get updated session state after create


      logger.info(`✅ CreateTable completed: ${tableName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          table_name: tableName,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Table ${tableName} created successfully. Use LockTable and UpdateTable to add source code, then UnlockTable and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating table ${tableName}:`, error);

      // Parse error message
      let errorMessage = `Failed to create table: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Table ${tableName} already exists.`;
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
