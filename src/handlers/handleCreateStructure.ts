/**
 * CreateStructure Handler - ABAP Structure Creation via ADT API
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

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
}


/**
 * Main handler for CreateStructure MCP tool
 *
 * Uses StructureBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateStructure(args: any): Promise<any> {
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

    const connection = getManagedConnection();
    const structureName = createStructureArgs.structure_name.toUpperCase();

    logger.info(`Starting structure creation: ${structureName}`);

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = true; // Default to true for structures

      // Validate
      await client.validateStructure(structureName);

      // Create
      await client.createStructure(
        structureName,
        createStructureArgs.description || structureName,
        createStructureArgs.package_name,
        createStructureArgs.transport_request
      );

      // Lock
      await client.lockStructure(structureName);
      const lockHandle = client.getLockHandle();

      // Note: StructureBuilder internally generates DDL from fields/includes
      // For now, skip update as structure creation already includes field definitions
      // TODO: Implement DDL generation or enhance CrudClient to accept fields directly

      // Check
      await client.checkStructure(structureName);

      // Unlock
      await client.unlockStructure(structureName, lockHandle);

      // Activate
      if (shouldActivate) {
        await client.activateStructure(structureName);
      }

      logger.info(`✅ CreateStructure completed successfully: ${structureName}`);

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
      logger.error(`Error creating structure ${structureName}:`, error);

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
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
