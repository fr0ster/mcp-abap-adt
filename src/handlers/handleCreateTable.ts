/**
 * CreateTable Handler - ABAP Table Creation via ADT API
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { TableBuilder } from '@mcp-abap-adt/adt-clients';


export const TOOL_DEFINITION = {
  name: "CreateTable",
  description: "Create a new ABAP table via the ADT API using provided DDL. Mirrors Eclipse ADT behaviour with status/check runs, lock handling, activation and verification.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions."
      },
      ddl_code: {
        type: "string",
        description: "Complete DDL code for table creation. Example: '@EndUserText.label : \\'My Table\\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'"
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      }
    },
    required: ["table_name", "ddl_code", "package_name"]
  }
} as const;

interface CreateTableArgs {
  table_name: string;
  ddl_code: string;
  package_name: string;
  transport_request?: string;
}


/**
 * Main handler for CreateTable MCP tool
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateTable(args: any): Promise<any> {
  try {
    const createTableArgs = args as CreateTableArgs;

    // Validate required parameters
    if (!createTableArgs?.table_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
    }
    if (!createTableArgs?.ddl_code) {
      throw new McpError(ErrorCode.InvalidParams, 'DDL code is required');
    }
    if (!createTableArgs?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(createTableArgs.package_name, createTableArgs.transport_request);

    const connection = getManagedConnection();
    const tableName = createTableArgs.table_name.toUpperCase();

    logger.info(`Starting table creation: ${tableName}`);

    try {
      // Create builder with configuration
      const builder = new TableBuilder(connection, logger, {
        tableName: tableName,
        packageName: createTableArgs.package_name,
        transportRequest: createTableArgs.transport_request,
        ddlCode: createTableArgs.ddl_code
      });

      // Build operation chain: validate -> create -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = true; // Default to true for tables

      await builder
        .validate()
        .then(b => b.create())
        .then(b => b.lock())
        .then(b => b.update())
        .then(b => b.check())
        .then(b => b.unlock())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Table creation chain failed:', error);
          throw error;
        });

      logger.info(`✅ CreateTable completed successfully: ${tableName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          table_name: tableName,
          package_name: createTableArgs.package_name,
          transport_request: createTableArgs.transport_request || 'local',
          activated: shouldActivate,
          message: `Table ${tableName} created successfully${shouldActivate ? ' and activated' : ''}`
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating table ${tableName}:`, error);

      // Check if table already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Table ${tableName} already exists. Please delete it first or use a different name.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create table ${tableName}: ${errorMessage}`
      );
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
