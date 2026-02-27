/**
 * CreateTable Handler - ABAP Table Creation via ADT API
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  ErrorCode,
  McpError,
  return_error,
  return_response,
  safeCheckOperation,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateTable',
  description:
    'Create a new ABAP table via the ADT API using provided DDL. Mirrors Eclipse ADT behaviour with status/check runs, lock handling, activation and verification.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description:
          'Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.',
      },
      ddl_code: {
        type: 'string',
        description:
          "Complete DDL code for table creation. Example: '@EndUserText.label : \\'My Table\\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'",
      },
      description: {
        type: 'string',
        description: 'Table description for validation and creation.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate table after creation. Default: true. Set to false for batch operations (activate multiple objects later).',
      },
    },
    required: ['table_name', 'ddl_code', 'package_name'],
  },
} as const;

interface CreateTableArgs {
  table_name: string;
  ddl_code: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Main handler for CreateTable MCP tool
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateTable(
  context: HandlerContext,
  args: CreateTableArgs,
): Promise<any> {
  const { connection, logger } = context;
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
    validateTransportRequest(
      createTableArgs.package_name,
      createTableArgs.transport_request,
    );

    const tableName = createTableArgs.table_name.toUpperCase();

    logger?.info(`Starting table creation: ${tableName}`);

    try {
      // Create client
      const client = new AdtClient(connection);
      const shouldActivate = createTableArgs.activate !== false; // Default to true if not specified

      // Validate
      await client.getTable().validate({
        tableName,
        packageName: createTableArgs.package_name,
        description: createTableArgs.description || tableName,
      });

      // Create
      await client.getTable().create({
        tableName,
        packageName: createTableArgs.package_name,
        description: createTableArgs.description || tableName,
        ddlCode: createTableArgs.ddl_code || '',
        transportRequest: createTableArgs.transport_request,
      });

      // Lock
      const lockHandle = await client.getTable().lock({ tableName });

      try {
        // Step 1: Check new code BEFORE update (with ddlCode and version='inactive')
        logger?.info(
          `[CreateTable] Checking new DDL code before update: ${tableName}`,
        );
        let checkNewCodePassed = false;
        try {
          await safeCheckOperation(
            () =>
              client
                .getTable()
                .check(
                  { tableName, ddlCode: createTableArgs.ddl_code },
                  'inactive',
                ),
            tableName,
            {
              debug: (message: string) =>
                logger?.debug(`[CreateTable] ${message}`),
            },
          );
          checkNewCodePassed = true;
          logger?.info(`[CreateTable] New code check passed: ${tableName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(
              `[CreateTable] Table ${tableName} was already checked - this is OK, continuing`,
            );
            checkNewCodePassed = true;
          } else {
            // Real check error - don't update if check failed
            logger?.error(`[CreateTable] New code check failed: ${tableName}`, {
              error:
                checkError instanceof Error
                  ? checkError.message
                  : String(checkError),
            });
            throw new Error(
              `New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`,
            );
          }
        }

        // Step 2: Update (only if check passed)
        if (checkNewCodePassed) {
          logger?.info(
            `[CreateTable] Updating table with DDL code: ${tableName}`,
          );
          await client
            .getTable()
            .update(
              { tableName, ddlCode: createTableArgs.ddl_code, transportRequest: createTableArgs.transport_request },
              { lockHandle },
            );
          logger?.info(`[CreateTable] Table source code updated: ${tableName}`);
        } else {
          logger?.info(
            `[CreateTable] Skipping update - new code check failed: ${tableName}`,
          );
        }

        // Step 3: Unlock (MANDATORY after lock)
        await client.getTable().unlock({ tableName }, lockHandle);
        logger?.info(`[CreateTable] Table unlocked: ${tableName}`);

        // Step 4: Check inactive version (after unlock)
        logger?.info(`[CreateTable] Checking inactive version: ${tableName}`);
        try {
          await safeCheckOperation(
            () => client.getTable().check({ tableName }, 'inactive'),
            tableName,
            {
              debug: (message: string) =>
                logger?.debug(`[CreateTable] ${message}`),
            },
          );
          logger?.info(
            `[CreateTable] Inactive version check completed: ${tableName}`,
          );
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(
              `[CreateTable] Table ${tableName} was already checked - continuing`,
            );
          } else {
            // Log warning but don't fail - inactive check is informational
            logger?.warn(
              `[CreateTable] Inactive version check had issues: ${tableName} | ${checkError instanceof Error ? checkError.message : String(checkError)}`,
            );
          }
        }

        // Activate
        if (shouldActivate) {
          await client.getTable().activate({ tableName });
        }
      } catch (error) {
        // Unlock on error (principle 1: if lock was done, unlock is mandatory)
        try {
          await client.getTable().unlock({ tableName }, lockHandle);
        } catch (unlockError) {
          logger?.error(
            `Failed to unlock table after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`,
          );
        }
        // Principle 2: first error and exit
        throw error;
      }

      logger?.info(`✅ CreateTable completed successfully: ${tableName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          table_name: tableName,
          package_name: createTableArgs.package_name,
          transport_request: createTableArgs.transport_request || 'local',
          activated: shouldActivate,
          message: `Table ${tableName} created successfully${shouldActivate ? ' and activated' : ''}`,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating table ${tableName}: ${error?.message || error}`,
      );

      // Check if table already exists
      if (
        error.message?.includes('already exists') ||
        error.response?.status === 409
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Table ${tableName} already exists. Please delete it first or use a different name.`,
        );
      }

      const errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create table ${tableName}: ${errorMessage}`,
      );
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
