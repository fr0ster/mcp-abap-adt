/**
 * UpdateTable Handler - Update Existing ABAP Table DDL Source
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
 */

import { return_error, return_response, encodeSapObjectName, safeCheckOperation, isAlreadyExistsError, AxiosResponse } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UpdateTable",
  description: "Update DDL source code of an existing ABAP table. Locks the table, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing tables without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist."
      },
      ddl_code: {
        type: "string",
        description: "Complete DDL source code for table. Example: '@EndUserText.label : \\'My Table\\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport."
      },
      activate: {
        type: "boolean",
        description: "Activate table after source update. Default: true."
      }
    },
    required: ["table_name", "ddl_code"]
  }
} as const;

interface UpdateTableArgs {
  table_name: string;
  ddl_code: string;
  transport_request?: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateTable MCP tool
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateTable(context: HandlerContext, args: UpdateTableArgs) {
  const { connection, logger } = context;
  try {
    const {
      table_name,
      ddl_code,
      transport_request,
      activate = true
    } = args as UpdateTableArgs;

    // Validation
    if (!table_name || !ddl_code) {
      return return_error(new Error('table_name and ddl_code are required'));
    }

    const tableName = table_name.toUpperCase();

    logger?.info(`Starting table source update: ${tableName}`);

            try {
      // Get configuration from environment variables
            // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
            // Create connection directly for this handler call
      // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
      logger?.debug(`[UpdateTable] Created separate connection for handler call: ${tableName}`);
    } catch (connectionError: any) {
      const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
      logger?.error(`[UpdateTable] Failed to create connection: ${errorMessage}`);
      return return_error(new Error(`Failed to create connection: ${errorMessage}`));
    }

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
      // Note: No validation needed for update - table must already exist
      const shouldActivate = activate !== false; // Default to true if not specified

      // Lock
      await client.lockTable({ tableName });
      const lockHandle = client.getLockHandle();

      try {
        // Step 1: Check new code BEFORE update (with ddlCode and version='inactive')
        logger?.info(`[UpdateTable] Checking new DDL code before update: ${tableName}`);
        let checkNewCodePassed = false;
        try {
          await safeCheckOperation(
            () => client.checkTable({ tableName }, ddl_code, 'inactive'),
            tableName,
            {
              debug: (message: string) => logger?.debug(`[UpdateTable] ${message}`)
            }
          );
          checkNewCodePassed = true;
          logger?.info(`[UpdateTable] New code check passed: ${tableName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(`[UpdateTable] Table ${tableName} was already checked - this is OK, continuing`);
            checkNewCodePassed = true;
          } else {
            // Real check error - don't update if check failed
            logger?.error(`[UpdateTable] New code check failed: ${tableName}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
            throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Step 2: Update (only if check passed)
        if (checkNewCodePassed) {
          logger?.info(`[UpdateTable] Updating table with DDL code: ${tableName}`);
          await client.updateTable({ tableName, ddlCode: ddl_code, transportRequest: transport_request }, lockHandle);
          logger?.info(`[UpdateTable] Table source code updated: ${tableName}`);
        } else {
          logger?.info(`[UpdateTable] Skipping update - new code check failed: ${tableName}`);
        }

        // Step 3: Unlock (MANDATORY after lock)
        await client.unlockTable({ tableName }, lockHandle);
        logger?.info(`[UpdateTable] Table unlocked: ${tableName}`);

        // Step 4: Check inactive version (after unlock)
        logger?.info(`[UpdateTable] Checking inactive version: ${tableName}`);
        try {
          await safeCheckOperation(
            () => client.checkTable({ tableName }, undefined, 'inactive'),
            tableName,
            {
              debug: (message: string) => logger?.debug(`[UpdateTable] ${message}`)
            }
          );
          logger?.info(`[UpdateTable] Inactive version check completed: ${tableName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(`[UpdateTable] Table ${tableName} was already checked - this is OK, continuing`);
          } else {
            // Log warning but don't fail - inactive check is informational
            logger?.warn(`[UpdateTable] Inactive version check had issues: ${tableName}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
          }
        }

        // Activate if requested
        if (shouldActivate) {
          await client.activateTable({ tableName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockTable({ tableName: tableName }, lockHandle);
        } catch (unlockError) {
          logger?.error('Failed to unlock table after error:', unlockError);
        }
        throw error;
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && client.getActivateResult()) {
        const activateResponse = client.getActivateResult()!;
        if (typeof activateResponse.data === 'string' && activateResponse.data.includes('<chkl:messages')) {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const result = parser.parse(activateResponse.data);
          const messages = result?.['chkl:messages']?.['msg'];
          if (messages) {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            activationWarnings = msgArray.map((msg: any) =>
              `${msg['@_type']}: ${msg['shortText']?.['txt'] || 'Unknown'}`
            );
          }
        }
      }

      logger?.info(`✅ UpdateTable completed successfully: ${tableName}`);

      // Return success result
      const stepsCompleted = ['lock', 'check_new_code', 'update', 'unlock', 'check_inactive'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        table_name: tableName,
        transport_request: transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Table ${tableName} source updated and activated successfully`
          : `Table ${tableName} source updated successfully (not activated)`,
        uri: `/sap/bc/adt/ddic/tables/${encodeSapObjectName(tableName)}`,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        source_size_bytes: ddl_code.length
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      logger?.error(`Error updating table source ${tableName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update table: ${errorMessage}`));
    } finally {
      // Cleanup: Reset connection created for this handler call
      if (connection) {
        try {
          connection.reset();
          logger?.debug(`[UpdateTable] Reset test connection`);
        } catch (resetError: any) {
          logger?.error(`[UpdateTable] Failed to reset connection: ${resetError.message || resetError}`);
        }
      }
    }

  } catch (error: any) {
    return return_error(error);
  }
}
