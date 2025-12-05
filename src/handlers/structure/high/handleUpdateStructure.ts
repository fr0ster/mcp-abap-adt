/**
 * UpdateStructure Handler - Update Existing ABAP Structure DDL Source
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection, safeCheckOperation, isAlreadyExistsError } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

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
export async function handleUpdateStructure(args: UpdateStructureArgs) {
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

    const connection = getManagedConnection();
    const structureName = structure_name.toUpperCase();

    logger.info(`Starting structure source update: ${structureName}`);

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = activate !== false; // Default to true if not specified

      // Validate (for update, "already exists" is expected - object must exist)
      try {
        await client.validateStructure({
          structureName,
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
        logger.info(`Structure ${structureName} already exists - this is expected for update operation`);
      }

      // Lock
      await client.lockStructure({ structureName });
      const lockHandle = client.getLockHandle();

      try {
        // Update with DDL source
        await client.updateStructure({ structureName, ddlCode: ddl_code }, lockHandle);

        // Check
        try {
          await safeCheckOperation(
            () => client.checkStructure({ structureName }),
            structureName,
            {
              debug: (message: string) => logger.info(`[UpdateStructure] ${message}`)
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
        await client.unlockStructure({ structureName }, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateStructure({ structureName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockStructure({ structureName: structureName }, lockHandle);
        } catch (unlockError) {
          logger.error('Failed to unlock structure after error:', unlockError);
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

      logger.info(`✅ UpdateStructure completed successfully: ${structureName}`);

      // Return success result
      const stepsCompleted = ['validate', 'lock', 'update', 'check', 'unlock'];
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
      logger.error(`Error updating structure source ${structureName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update structure: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}

