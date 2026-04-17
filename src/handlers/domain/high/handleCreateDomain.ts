/**
 * CreateDomain Handler - ABAP Domain Creation via ADT API
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: create -> check -> unlock -> (activate)
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  ErrorCode,
  McpError,
  return_error,
  return_response,
  safeCheckOperation,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation';

export const TOOL_DEFINITION = {
  name: 'CreateDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: Domain. Will be useful for creating domain. Create a new ABAP domain in SAP system. Creates the domain object in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description:
          'Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description:
          '(optional) Domain description. If not provided, domain_name will be used.',
      },
      package_name: {
        type: 'string',
        description:
          '(optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      datatype: {
        type: 'string',
        description:
          '(optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
        default: 'CHAR',
      },
      length: {
        type: 'number',
        description: '(optional) Field length (max depends on datatype)',
        default: 100,
      },
      decimals: {
        type: 'number',
        description: '(optional) Decimal places (for DEC, CURR, QUAN types)',
        default: 0,
      },
      conversion_exit: {
        type: 'string',
        description:
          '(optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)',
      },
      lowercase: {
        type: 'boolean',
        description: '(optional) Allow lowercase input',
        default: false,
      },
      sign_exists: {
        type: 'boolean',
        description: '(optional) Field has sign (+/-)',
        default: false,
      },
      value_table: {
        type: 'string',
        description: '(optional) Value table name for foreign key relationship',
      },
      activate: {
        type: 'boolean',
        description:
          '(optional) Activate domain after creation (default: true)',
        default: true,
      },
      fixed_values: {
        type: 'array',
        description: '(optional) Array of fixed values for domain value range',
        items: {
          type: 'object',
          properties: {
            low: {
              type: 'string',
              description: "Fixed value (e.g., '001', 'A')",
            },
            text: {
              type: 'string',
              description: 'Description text for the fixed value',
            },
          },
          required: ['low', 'text'],
        },
      },
    },
    required: ['domain_name'],
  },
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
export async function handleCreateDomain(
  context: HandlerContext,
  args: DomainArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP, non-ZLOCAL packages
    validateTransportRequest(
      args.package_name,
      args.transport_request,
      args.super_package,
    );

    const typedArgs = args as DomainArgs;
    const domainName = typedArgs.domain_name.toUpperCase();

    logger?.info(`Starting domain creation: ${domainName}`);

    const client = createAdtClient(connection, logger);
    const shouldActivate = typedArgs.activate !== false;
    let lockHandle: string | undefined;
    try {
      // Validate
      await client.getDomain().validate({
        domainName,
        packageName: typedArgs.package_name,
        description: typedArgs.description || domainName,
      });

      // Create (registers bare object in SAP)
      await client.getDomain().create({
        domainName,
        description: typedArgs.description || domainName,
        packageName: typedArgs.package_name,
        transportRequest: typedArgs.transport_request,
      });

      // Lock
      lockHandle = await client.getDomain().lock({ domainName });

      // Update with read-modify-write: reads current XML from SAP, patches with properties, PUTs back
      await client.getDomain().update(
        {
          domainName,
          packageName: typedArgs.package_name,
          description: typedArgs.description || domainName,
          datatype: typedArgs.datatype || 'CHAR',
          length: typedArgs.length || 100,
          decimals: typedArgs.decimals || 0,
          conversion_exit: typedArgs.conversion_exit,
          lowercase: typedArgs.lowercase || false,
          sign_exists: typedArgs.sign_exists || false,
          value_table: typedArgs.value_table,
          fixed_values: typedArgs.fixed_values,
          transportRequest: typedArgs.transport_request,
        },
        { lockHandle },
      );

      // Unlock
      await client.getDomain().unlock({ domainName }, lockHandle);
      lockHandle = undefined;

      // Wait for object to be ready after update (long polling)
      try {
        await client
          .getDomain()
          .read({ domainName }, 'inactive', { withLongPolling: true });
      } catch {
        // Continue anyway — activation will fail explicitly if object isn't ready
      }

      // Check
      try {
        await safeCheckOperation(
          () => client.getDomain().check({ domainName }),
          domainName,
          {
            debug: (message: string) => logger?.debug(message),
          },
        );
      } catch (checkError: any) {
        if (!(checkError as any).isAlreadyChecked) {
          throw checkError;
        }
      }

      // Activate if requested
      if (shouldActivate) {
        await client.getDomain().activate({ domainName });
      }

      logger?.info(`✅ CreateDomain completed: ${domainName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          status: shouldActivate ? 'active' : 'inactive',
          message: `Domain ${domainName} created${shouldActivate ? ' and activated' : ''} successfully`,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      if (lockHandle) {
        try {
          await client.getDomain().unlock({ domainName }, lockHandle);
        } catch (_unlockError) {
          // Ignore unlock errors during cleanup
        }
      }

      logger?.error(
        `Error creating domain ${domainName}: ${error?.message || error}`,
      );

      if (
        error.message?.includes('already exists') ||
        error.response?.data?.includes('ExceptionResourceAlreadyExists')
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Domain ${domainName} already exists. Please delete it first or use a different name.`,
        );
      }

      let errorMessage: string;
      if (error.response?.data) {
        errorMessage =
          typeof error.response.data === 'string'
            ? error.response.data
            : String(error.response.data).substring(0, 500);
      } else {
        errorMessage = error.message || String(error);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create domain ${domainName}: ${errorMessage}`,
      );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
