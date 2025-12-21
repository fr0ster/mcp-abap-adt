/**
 * UpdateStructure Handler - Update Existing ABAP Structure DDL Source
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
 */

import { return_error, return_response, encodeSapObjectName, safeCheckOperation, isAlreadyExistsError, AxiosResponse } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UpdateStructure",
  description: "Update DDL source code of an existing ABAP structure. Locks the structure, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing structures without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name (e.g., ZZ_S_TEST_001). Structure must already exist."
      },
      ddl_code: {
        type: "string",
        description: "Complete DDL source code for structure. Example: '@EndUserText.label : \\'My Structure\\' @AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : abap.clnt not null; id : abap.char(10); name : abap.char(255); }'"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport."
      },
      activate: {
        type: "boolean",
        description: "Activate structure after source update. Default: true."
      }
    },
    required: ["structure_name", "ddl_code"]
  }
} as const;

interface UpdateStructureArgs {
  structure_name: string;
  ddl_code: string;
  transport_request?: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateStructure MCP tool
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateStructure(context: HandlerContext, args: UpdateStructureArgs) {
  const { connection, logger } = context;
  try {
    const {
      structure_name,
      ddl_code,
      transport_request,
      activate = true
    } = args as UpdateStructureArgs;

    // Validation
    if (!structure_name || !ddl_code) {
      return return_error(new Error('structure_name and ddl_code are required'));
    }

    const structureName = structure_name.toUpperCase();

    logger?.info(`Starting structure source update: ${structureName}`);

            try {
      // Get configuration from environment variables
            // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
            // Create connection directly for this handler call
      // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
      logger?.debug(`[UpdateStructure] Created separate connection for handler call: ${structureName}`);
    } catch (connectionError: any) {
      const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
      logger?.error(`[UpdateStructure] Failed to create connection: ${errorMessage}`);
      return return_error(new Error(`Failed to create connection: ${errorMessage}`));
    }

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
      // Note: No validation needed for update - structure must already exist
      const shouldActivate = activate !== false; // Default to true if not specified

      // Lock
      await client.lockStructure({ structureName });
      const lockHandle = client.getLockHandle();

      try {
        // Step 1: Check new code BEFORE update (with ddlCode and version='inactive')
        logger?.info(`[UpdateStructure] Checking new DDL code before update: ${structureName}`);
        let checkNewCodePassed = false;
        try {
          await safeCheckOperation(
            () => client.checkStructure({ structureName }, ddl_code, 'inactive'),
            structureName,
            {
              debug: (message: string) => logger?.debug(`[UpdateStructure] ${message}`)
            }
          );
          checkNewCodePassed = true;
          logger?.info(`[UpdateStructure] New code check passed: ${structureName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(`[UpdateStructure] Structure ${structureName} was already checked - this is OK, continuing`);
            checkNewCodePassed = true;
          } else {
            // Real check error - don't update if check failed
            logger?.error(`[UpdateStructure] New code check failed: ${structureName}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
            throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Step 2: Update (only if check passed)
        if (checkNewCodePassed) {
          logger?.info(`[UpdateStructure] Updating structure with DDL code: ${structureName}`);
          await client.updateStructure({ structureName, ddlCode: ddl_code }, lockHandle);
          logger?.info(`[UpdateStructure] Structure source code updated: ${structureName}`);
        } else {
          logger?.info(`[UpdateStructure] Skipping update - new code check failed: ${structureName}`);
        }

        // Step 3: Unlock (MANDATORY after lock)
        await client.unlockStructure({ structureName }, lockHandle);
        logger?.info(`[UpdateStructure] Structure unlocked: ${structureName}`);

        // Step 4: Check inactive version (after unlock)
        logger?.info(`[UpdateStructure] Checking inactive version: ${structureName}`);
        try {
          await safeCheckOperation(
            () => client.checkStructure({ structureName }, undefined, 'inactive'),
            structureName,
            {
              debug: (message: string) => logger?.debug(`[UpdateStructure] ${message}`)
            }
          );
          logger?.info(`[UpdateStructure] Inactive version check completed: ${structureName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(`[UpdateStructure] Structure ${structureName} was already checked - this is OK, continuing`);
          } else {
            // Log warning but don't fail - inactive check is informational
            logger?.warn(`[UpdateStructure] Inactive version check had issues: ${structureName}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
          }
        }

        // Activate if requested
        if (shouldActivate) {
          await client.activateStructure({ structureName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockStructure({ structureName: structureName }, lockHandle);
        } catch (unlockError) {
          logger?.error('Failed to unlock structure after error:', unlockError);
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

      logger?.info(`✅ UpdateStructure completed successfully: ${structureName}`);

      // Return success result
      const stepsCompleted = ['lock', 'check_new_code', 'update', 'unlock', 'check_inactive'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        structure_name: structureName,
        transport_request: transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Structure ${structureName} source updated and activated successfully`
          : `Structure ${structureName} source updated successfully (not activated)`,
        uri: `/sap/bc/adt/ddic/structures/${encodeSapObjectName(structureName)}`,
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
      logger?.error(`Error updating structure source ${structureName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update structure: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
