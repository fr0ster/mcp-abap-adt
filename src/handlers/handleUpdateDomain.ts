/**
 * UpdateDomain Handler - Update Existing ABAP Domain
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { DomainBuilder } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateDomain",
  description: `Update an existing ABAP domain in SAP system.

Workflow:
1. Acquires lock on the domain
2. Updates domain with provided parameters (complete replacement)
3. Performs syntax check
4. Unlocks domain
5. Optionally activates domain (default: true)
6. Returns updated domain details

Note: All provided parameters completely replace existing values. Use GetDomain first to see current values if needed.`,
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name to update (e.g., ZZ_TEST_0001)"
      },
      description: {
        type: "string",
        description: "New domain description (optional)"
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
        description: "Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc."
      },
      length: {
        type: "number",
        description: "Field length (max depends on datatype)"
      },
      decimals: {
        type: "number",
        description: "Decimal places (for DEC, CURR, QUAN types)"
      },
      conversion_exit: {
        type: "string",
        description: "Conversion exit routine name (without CONVERSION_EXIT_ prefix)"
      },
      lowercase: {
        type: "boolean",
        description: "Allow lowercase input"
      },
      sign_exists: {
        type: "boolean",
        description: "Field has sign (+/-)"
      },
      value_table: {
        type: "string",
        description: "Value table name for foreign key relationship"
      },
      activate: {
        type: "boolean",
        description: "Activate domain after update (default: true)",
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
}

/**
 * Main handler for UpdateDomain tool
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateDomain(args: any) {
  try {
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    const typedArgs = args as DomainArgs;
    const connection = getManagedConnection();
    const domainName = typedArgs.domain_name.toUpperCase();

    logger.info(`Starting domain update: ${domainName}`);

    try {
      // Create builder with configuration
      const builder = new DomainBuilder(connection, logger, {
        domainName: domainName,
        packageName: typedArgs.package_name,
        transportRequest: typedArgs.transport_request,
        description: typedArgs.description,
        datatype: typedArgs.datatype,
        length: typedArgs.length,
        decimals: typedArgs.decimals,
        conversion_exit: typedArgs.conversion_exit,
        lowercase: typedArgs.lowercase,
        sign_exists: typedArgs.sign_exists,
        value_table: typedArgs.value_table,
        fixed_values: typedArgs.fixed_values
      });

      // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      await builder
        .validate()
        .then(b => b.lock())
        .then(b => b.update())
        .then(b => b.check())
        .then(b => b.unlock())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Domain update chain failed:', error);
          throw error;
        });

      // Get domain details from update result
      const updateResult = builder.getUpdateResult();
      let domainDetails = null;
      if (updateResult?.data && typeof updateResult.data === 'object' && 'domain_details' in updateResult.data) {
        domainDetails = (updateResult.data as any).domain_details;
      }

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          status: shouldActivate ? 'active' : 'inactive',
          message: `Domain ${domainName} updated${shouldActivate ? ' and activated' : ''} successfully`,
          domain_details: domainDetails
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating domain ${domainName}:`, error);

      // Handle specific error cases
      if (error.message?.includes('not found') || error.response?.status === 404) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Domain ${domainName} not found.`
        );
      }

      if (error.message?.includes('locked') || error.response?.status === 403) {
        throw new McpError(
          ErrorCode.InternalError,
          `Domain ${domainName} is locked by another user or session. Please try again later.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update domain ${domainName}: ${errorMessage}`
      );
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
