/**
 * UpdateDomain Handler - Update Existing ABAP Domain
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 * Note: No validation step - lock will fail if domain doesn't exist
 *
 * **The patched document goes in `config.document`, not `options.xmlContent`.**
 * `AdtDomain.updateMetadata()`'s shipped body reads `config.document` only and
 * passes it straight to the PUT body; `options.xmlContent` is declared on the
 * options type but never read by this member. With the patched document in
 * `options.xmlContent`, this issued a PUT with an empty body against a
 * replace-semantics endpoint and answered success. Verified against the
 * compiled `AdtDomain.js` and `core/domain/update.js`, not the declaration
 * file. See `handleUpdateDomain.ts` (low) for the same fix.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { patchDomainXml } from '../../../lib/strategies/domainPatch';
import { sequence } from '../../../lib/strategies/sequence';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import {
  type AxiosResponse,
  return_error,
  return_response,
  safeCheckOperation,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'UpdateDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: Domain. Will be useful for updating or creating domain. Update an existing ABAP domain. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name to update (e.g., ZZ_TEST_0001)',
      },
      description: {
        type: 'string',
        description: 'New domain description (optional)',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      datatype: {
        type: 'string',
        description:
          'Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
      },
      length: {
        type: 'number',
        description: 'Field length (max depends on datatype)',
      },
      decimals: {
        type: 'number',
        description: 'Decimal places (for DEC, CURR, QUAN types)',
      },
      conversion_exit: {
        type: 'string',
        description:
          'Conversion exit routine name (without CONVERSION_EXIT_ prefix)',
      },
      lowercase: {
        type: 'boolean',
        description: 'Allow lowercase input',
      },
      sign_exists: {
        type: 'boolean',
        description: 'Field has sign (+/-)',
      },
      value_table: {
        type: 'string',
        description: 'Value table name for foreign key relationship',
      },
      activate: {
        type: 'boolean',
        description: 'Activate domain after update (default: true)',
        default: true,
      },
      fixed_values: {
        type: 'array',
        description: 'Array of fixed values for domain value range',
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
    required: ['domain_name', 'package_name'],
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
}

/**
 * Main handler for UpdateDomain tool
 *
 * Uses DomainBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateDomain(
  context: HandlerContext,
  args: DomainArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.domain_name) {
      return return_error('Domain name is required');
    }
    if (!args?.package_name) {
      return return_error('Package name is required');
    }

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    const typedArgs = args as DomainArgs;
    const domainName = typedArgs.domain_name.toUpperCase();

    logger?.info(`Starting domain update: ${domainName}`);

    try {
      // Create client
      const client = createAdtClient(connection, logger);
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      // Lock domain (will fail if domain doesn't exist)
      // Pass packageName to lockDomain so builder is created with correct config from the start
      let lockHandle: string | undefined;
      let updateState: any;

      try {
        // `lock` answers an IAdtResponse on 18+, not a bare handle.
        const locked = await client.getDomain().lock({
          domainName,
          packageName: typedArgs.package_name,
        } as any);
        if (!locked.ok) {
          return return_error(new Error(locked.getError().message));
        }
        lockHandle = locked.getResult().value;

        // Read, patch, write — the merge adt-clients 19 stopped doing. Only
        // the fields the caller named are touched; everything else in the
        // document travels through unread.
        const written = await sequence(
          () =>
            client
              .getDomain()
              .readMetadata({ domainName }, { analyse: analyseException }),
          (current) =>
            client.getDomain().updateMetadata(
              {
                domainName,
                document: patchDomainXml(
                  extractXmlString(current, `domain ${domainName}`),
                  {
                    description: typedArgs.description,
                    datatype: typedArgs.datatype,
                    length: typedArgs.length,
                    decimals: typedArgs.decimals,
                    conversion_exit: typedArgs.conversion_exit,
                    lowercase: typedArgs.lowercase,
                    sign_exists: typedArgs.sign_exists,
                    value_table: typedArgs.value_table,
                    fixed_values: typedArgs.fixed_values,
                  },
                ),
              },
              {
                lockHandle,
                analyse: analyseException,
              },
            ),
        );
        if (!written.ok) {
          return return_error(new Error(written.getError().message));
        }
        updateState = written;

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
          // If error was marked as "already checked", continue silently
          if (!(checkError as any).isAlreadyChecked) {
            // Real check error - rethrow
            throw checkError;
          }
        }
      } finally {
        if (lockHandle) {
          try {
            await client.getDomain().unlock({ domainName }, lockHandle);
            logger?.info(`Domain unlocked: ${domainName}`);
          } catch (unlockError: any) {
            logger?.warn(
              `Failed to unlock domain ${domainName}: ${unlockError?.message || unlockError}`,
            );
          }
        }
      }

      // Wait for object to be ready after update (long polling)
      try {
        await client
          .getDomain()
          .readMetadata({ domainName }, { withLongPolling: true } as never);
      } catch {
        // Continue anyway — activation will fail explicitly if object isn't ready
      }

      // Activate if requested
      if (shouldActivate) {
        await client.getDomain().activate({ domainName });
      }

      // Get domain details from update result
      const updateResult = updateState.updateResult;
      let domainDetails = null;
      if (
        updateResult?.data &&
        typeof updateResult.data === 'object' &&
        'domain_details' in updateResult.data
      ) {
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
          domain_details: domainDetails,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating domain ${domainName}: ${error?.message || error}`,
      );

      // Handle specific error cases
      if (
        error.message?.includes('not found') ||
        error.response?.status === 404
      ) {
        return return_error(`Domain ${domainName} not found.`);
      }

      if (error.message?.includes('locked') || error.response?.status === 403) {
        return return_error(
          `Domain ${domainName} is locked by another user or session. Please try again later.`,
        );
      }

      const errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message || String(error);

      return return_error(
        `Failed to update domain ${domainName}: ${errorMessage}`,
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
