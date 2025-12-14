/**
 * UpdateDomain Handler - Update Existing ABAP Domain
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 * Note: No validation step - lock will fail if domain doesn't exist
 */

import { McpError, ErrorCode, AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, safeCheckOperation } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

import { getManagedConnection } from '../../../lib/utils.js';
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
export async function handleUpdateDomain(args: DomainArgs) {
  let connection: any = null;
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
            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    connection = getManagedConnection();
    const domainName = typedArgs.domain_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleUpdateDomain',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting domain update: ${domainName}`);

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      // Lock domain (will fail if domain doesn't exist)
      // Pass packageName to lockDomain so builder is created with correct config from the start
      await client.lockDomain({ domainName, packageName: typedArgs.package_name } as any);
      const lockHandle = client.getLockHandle();

      try {
        // Update with properties (packageName and description are required)
        const properties = {
          domainName: domainName,
          packageName: typedArgs.package_name,
          description: typedArgs.description || domainName,
          datatype: typedArgs.datatype,
          length: typedArgs.length,
          decimals: typedArgs.decimals,
          conversionExit: typedArgs.conversion_exit,
          lowercase: typedArgs.lowercase,
          signExists: typedArgs.sign_exists,
          valueTable: typedArgs.value_table,
          fixedValues: typedArgs.fixed_values
        };
        await client.updateDomain(properties, lockHandle);

        // Check
        try {
          await safeCheckOperation(
            () => client.checkDomain({ domainName }),
            domainName,
            {
              debug: (message: string) => handlerLogger.debug(message)
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
        await client.unlockDomain({ domainName }, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateDomain({ domainName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockDomain({ domainName }, lockHandle);
        } catch (unlockError) {
          handlerLogger.error(`Failed to unlock domain after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
        }
        throw error;
      }

      // Get domain details from update result
      const updateResult = client.getUpdateResult();
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
      handlerLogger.error(`Error updating domain ${domainName}: ${error?.message || error}`);

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
  } finally {
    try {
      if (connection) {
        connection.reset();
        const handlerLogger = getHandlerLogger(
          'handleUpdateDomain',
          process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
        );
        handlerLogger.debug('Reset domain connection after use');
      }
    } catch (resetError: any) {
      const handlerLogger = getHandlerLogger(
        'handleUpdateDomain',
        process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
      );
      handlerLogger.error(`Failed to reset domain connection: ${resetError?.message || resetError}`);
    }
  }
}
