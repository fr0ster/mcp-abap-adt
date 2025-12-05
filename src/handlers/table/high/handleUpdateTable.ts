/**
 * UpdateTable Handler - Update Existing ABAP Table DDL Source
 *
 * Uses TableBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection, safeCheckOperation, isAlreadyExistsError } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

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
export async function handleUpdateTable(args: UpdateTableArgs) {
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

    const connection = getManagedConnection();
    const tableName = table_name.toUpperCase();

    logger.info(`Starting table source update: ${tableName}`);

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = activate !== false; // Default to true if not specified

      // Validate (for update, "already exists" is expected - object must exist)
      try {
        await client.validateTable({
          tableName,
          packageName: undefined,
          description: undefined
        });
      } catch (validateError: any) {
        // For update operations, "already exists" is expected - object must exist
        if (!isAlreadyExistsError(validateError)) {
          // Real validation error - rethrow
          throw validateError;
        }
        // "Already exists" is OK for update - continue
        logger.info(`Table ${tableName} already exists - this is expected for update operation`);
      }

      // Lock
      await client.lockTable({ tableName });
      const lockHandle = client.getLockHandle();

      try {
        // Update with DDL source
        await client.updateTable({ tableName, ddlCode: ddl_code }, lockHandle);

        // Check
        try {
          await safeCheckOperation(
            () => client.checkTable({ tableName }),
            tableName,
            {
              debug: (message: string) => logger.info(`[UpdateTable] ${message}`)
            }
          );
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if (!(checkError as any).isAlreadyChecked) {
            // Real check error - rethrow
            throw checkError;
          }
        }

        // Unlock
        await client.unlockTable({ tableName }, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateTable({ tableName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockTable({ tableName: tableName }, lockHandle);
        } catch (unlockError) {
          logger.error('Failed to unlock table after error:', unlockError);
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

      logger.info(`✅ UpdateTable completed successfully: ${tableName}`);

      // Return success result
      const stepsCompleted = ['validate', 'lock', 'update', 'check', 'unlock'];
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
      logger.error(`Error updating table source ${tableName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update table: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}

