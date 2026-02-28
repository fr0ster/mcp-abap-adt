/**
 * GetDomain Handler - Read ABAP Domain via AdtClient
 *
 * Uses AdtClient.getDomain().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetDomain',
  description:
    'Retrieve ABAP domain definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name (e.g., Z_MY_DOMAIN).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['domain_name'],
  },
} as const;

interface GetDomainArgs {
  domain_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetDomain MCP tool
 *
 * Uses AdtClient.getDomain().read() - high-level read operation
 */
export async function handleGetDomain(
  context: HandlerContext,
  args: GetDomainArgs,
) {
  const { connection, logger } = context;
  try {
    const { domain_name, version = 'active' } = args as GetDomainArgs;

    // Validation
    if (!domain_name) {
      return return_error(new Error('domain_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const domainName = domain_name.toUpperCase();

    logger?.info(`Reading domain ${domainName}, version: ${version}`);

    try {
      // Read domain using AdtClient
      const domainObject = client.getDomain();
      const readResult = await domainObject.read(
        { domainName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Domain ${domainName} not found`);
      }

      // Extract data from read result
      const domainData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetDomain completed successfully: ${domainName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            domain_name: domainName,
            version,
            domain_data: domainData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading domain ${domainName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Domain ${domainName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
