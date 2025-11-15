/**
 * CreateDomain Handler - ABAP Domain Creation via ADT API
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: create -> check -> unlock -> (activate)
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation';
import { DomainBuilder } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateDomain",
  description: "Create a new ABAP domain in SAP system with all required steps: lock, create, check, unlock, activate, and verify.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Domain description. If not provided, domain_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      datatype: {
        type: "string",
        description: "Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.",
        default: "CHAR"
      },
      length: {
        type: "number",
        description: "Field length (max depends on datatype)",
        default: 100
      },
      decimals: {
        type: "number",
        description: "Decimal places (for DEC, CURR, QUAN types)",
        default: 0
      },
      conversion_exit: {
        type: "string",
        description: "Conversion exit routine name (without CONVERSION_EXIT_ prefix)"
      },
      lowercase: {
        type: "boolean",
        description: "Allow lowercase input",
        default: false
      },
      sign_exists: {
        type: "boolean",
        description: "Field has sign (+/-)",
        default: false
      },
      value_table: {
        type: "string",
        description: "Value table name for foreign key relationship"
      },
      activate: {
        type: "boolean",
        description: "Activate domain after creation (default: true)",
        default: true
      },
      fixed_values: {
        type: "array",
        description: "Array of fixed values for domain value range",
        items: {
          type: "object",
          properties: {
            low: {
              type: "string",
              description: "Fixed value (e.g., '001', 'A')"
            },
            text: {
              type: "string",
              description: "Description text for the fixed value"
            }
          },
          required: ["low", "text"]
        }
      }
    },
    required: ["domain_name", "package_name"]
  }
} as const;

interface DomainArgs {
  domain_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  datatype?: string;
  length?: number;
  decimals?: number;
  conversion_exit?: string;
  lowercase?: boolean;
  sign_exists?: boolean;
  value_table?: string;
  activate?: boolean;
  fixed_values?: Array<{ low: string; text: string }>;
  super_package?: string;
}

/**
 * Main handler for CreateDomain MCP tool
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateDomain(args: any) {
  try {
    // Validate required parameters
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP, non-ZLOCAL packages
    validateTransportRequest(args.package_name, args.transport_request, args.super_package);

    const typedArgs = args as DomainArgs;
    const connection = getManagedConnection();
    const domainName = typedArgs.domain_name.toUpperCase();

    logger.info(`Starting domain creation: ${domainName}`);

    try {
      // Create builder with configuration
      const builder = new DomainBuilder(connection, logger, {
        domainName: domainName,
        packageName: typedArgs.package_name,
        transportRequest: typedArgs.transport_request,
        description: typedArgs.description || domainName,
        datatype: typedArgs.datatype || 'CHAR',
        length: typedArgs.length || 100,
        decimals: typedArgs.decimals || 0,
        conversion_exit: typedArgs.conversion_exit,
        lowercase: typedArgs.lowercase || false,
        sign_exists: typedArgs.sign_exists || false,
        value_table: typedArgs.value_table,
        fixed_values: typedArgs.fixed_values
      });

      // Build operation chain: create -> check -> unlock -> (activate)
      // Note: create() already does: create empty -> lock -> create with data -> check -> unlock
      // But we need to activate separately if needed
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      await builder
        .create() // This already does create -> lock -> update -> check -> unlock
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Domain creation chain failed:', error);
          throw error;
        });

      // Get domain details from create result (createDomain already does verification)
      const createResult = builder.getCreateResult();
      let domainDetails = null;
      if (createResult?.data && typeof createResult.data === 'object' && 'domain_details' in createResult.data) {
        domainDetails = (createResult.data as any).domain_details;
      }

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          status: shouldActivate ? 'active' : 'inactive',
          message: `Domain ${domainName} created${shouldActivate ? ' and activated' : ''} successfully`,
          domain_details: domainDetails
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating domain ${domainName}:`, error);

      // Check if domain already exists
      if (error.message?.includes('already exists') || error.response?.data?.includes('ExceptionResourceAlreadyExists')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Domain ${domainName} already exists. Please delete it first or use a different name.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create domain ${domainName}: ${errorMessage}`
      );
    }

  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
