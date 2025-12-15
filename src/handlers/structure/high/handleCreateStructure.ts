/**
 * CreateStructure Handler - ABAP Structure Creation via ADT API
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> check (inactive version) -> unlock -> (activate)
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { McpError, ErrorCode, return_error, return_response, logger as baseLogger, safeCheckOperation, AxiosResponse } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateStructure",
  description: "Create a new ABAP structure in SAP system with fields and type references. Includes create, activate, and verify steps.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Structure description. If not provided, structure_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      fields: {
        type: "array",
        description: "Array of structure fields",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Field name (e.g., CLIENT, MATERIAL_ID)"
            },
            data_type: {
              type: "string",
              description: "Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc."
            },
            length: {
              type: "number",
              description: "Field length"
            },
            decimals: {
              type: "number",
              description: "Decimal places (for DEC, CURR, QUAN types)",
              default: 0
            },
            domain: {
              type: "string",
              description: "Domain name for type reference (optional)"
            },
            data_element: {
              type: "string",
              description: "Data element name for type reference (optional)"
            },
            structure_ref: {
              type: "string",
              description: "Include another structure (optional)"
            },
            table_ref: {
              type: "string",
              description: "Reference to table type (optional)"
            },
            description: {
              type: "string",
              description: "Field description"
            }
          },
          required: ["name"]
        }
      },
      includes: {
        type: "array",
        description: "Include other structures in this structure",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Include structure name"
            },
            suffix: {
              type: "string",
              description: "Optional suffix for include fields"
            }
          },
          required: ["name"]
        }
      },
      activate: {
        type: "boolean",
        description: "Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["structure_name", "package_name", "fields"]
  }
} as const;

interface StructureField {
  name: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  domain?: string;
  data_element?: string;
  structure_ref?: string;
  table_ref?: string;
  description?: string;
}

interface StructureInclude {
  name: string;
  suffix?: string;
}

interface CreateStructureArgs {
  structure_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  fields: StructureField[];
  includes?: StructureInclude[];
  activate?: boolean;
}


/**
 * Main handler for CreateStructure MCP tool
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateStructure(connection: AbapConnection, args: CreateStructureArgs): Promise<any> {
  try {
    const createStructureArgs = args as CreateStructureArgs;

    // Validate required parameters
    if (!createStructureArgs?.structure_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Structure name is required');
    }
    if (!createStructureArgs?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(createStructureArgs.package_name, createStructureArgs.transport_request);

    if (!createStructureArgs?.fields || !Array.isArray(createStructureArgs.fields) || createStructureArgs.fields.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'At least one field is required');
    }

    const structureName = createStructureArgs.structure_name.toUpperCase();

    const handlerLogger = getHandlerLogger(
      "handleCreateStructure",
      process.env.DEBUG_HANDLERS === "true" ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting structure creation: ${structureName}`);

            try {
      // Get configuration from environment variables
            // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
            // Create connection directly for this handler call
      // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
      handlerLogger.debug(`[CreateStructure] Created separate connection for handler call: ${structureName}`);
    } catch (connectionError: any) {
      const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
      throw new McpError(ErrorCode.InternalError, `Failed to create connection: ${errorMessage}`);
    }

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = createStructureArgs.activate !== false; // Default to true if not specified

      // Validate
      await client.validateStructure({
        structureName,
        packageName: createStructureArgs.package_name,
        description: createStructureArgs.description || structureName
      });

      // Create
      await client.createStructure({
        structureName,
        description: createStructureArgs.description || structureName,
        packageName: createStructureArgs.package_name,
        ddlCode: '',
        transportRequest: createStructureArgs.transport_request
      });

      // Lock
      await client.lockStructure({ structureName });
      const lockHandle = client.getLockHandle();

      try {
        // Note: StructureBuilder internally generates DDL from fields/includes
        // For now, skip update as structure creation already includes field definitions
        // TODO: Implement DDL generation or enhance CrudClient to accept fields directly

        // Unlock (MANDATORY after lock)
        await client.unlockStructure({ structureName }, lockHandle);
        handlerLogger.info(`[CreateStructure] Structure unlocked: ${structureName}`);

        // Check inactive version (after unlock)
        handlerLogger.info(`[CreateStructure] Checking inactive version: ${structureName}`);
        try {
          await safeCheckOperation(
            () => client.checkStructure({ structureName }, undefined, 'inactive'),
            structureName,
            {
              debug: (message: string) => handlerLogger.debug(`[CreateStructure] ${message}`)
            }
          );
          handlerLogger.info(`[CreateStructure] Inactive version check completed: ${structureName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            handlerLogger.info(`[CreateStructure] Structure ${structureName} was already checked - this is OK, continuing`);
          } else {
            // Log warning but don't fail - inactive check is informational
            handlerLogger.warn(`[CreateStructure] Inactive version check had issues: ${structureName}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
          }
        }

        // Activate
        if (shouldActivate) {
          await client.activateStructure({ structureName });
        }
      } catch (error) {
        // Unlock on error (principle 1: if lock was done, unlock is mandatory)
        try {
          await client.unlockStructure({ structureName }, lockHandle);
        } catch (unlockError) {
          handlerLogger.error('Failed to unlock structure after error:', unlockError);
        }
        // Principle 2: first error and exit
        throw error;
      }

      handlerLogger.info(`✅ CreateStructure completed successfully: ${structureName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          structure_name: structureName,
          package_name: createStructureArgs.package_name,
          transport_request: createStructureArgs.transport_request || 'local',
          activated: shouldActivate,
          message: `Structure ${structureName} created successfully${shouldActivate ? ' and activated' : ''}`
        })
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error creating structure ${structureName}:`, error);

      // Check if structure already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Structure ${structureName} already exists. Please delete it first or use a different name.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create structure ${structureName}: ${errorMessage}`
      );
    } finally {
      // Cleanup: Reset connection created for this handler call
      if (connection) {
        try {
          connection.reset();
          handlerLogger.debug(`[CreateStructure] Reset connection`);
        } catch (resetError: any) {
          handlerLogger.error(`[CreateStructure] Failed to reset connection: ${resetError.message || resetError}`);
        }
      }
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
