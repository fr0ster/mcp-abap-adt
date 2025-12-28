/**
 * UpdateDomain Handler - Update ABAP Domain Properties
 *
 * Uses AdtClient.updateDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateDomainLow',
  description:
    '[low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description:
          'Domain name (e.g., ZOK_D_TEST_0001). Domain must already exist.',
      },
      properties: {
        type: 'object',
        description:
          'Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['domain_name', 'properties', 'lock_handle'],
  },
} as const;

interface UpdateDomainArgs {
  domain_name: string;
  properties: Record<string, any>;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateDomain MCP tool
 *
 * Uses AdtClient.updateDomain - low-level single method call
 */
export async function handleUpdateDomain(
  context: HandlerContext,
  args: UpdateDomainArgs,
) {
  const { connection, logger } = context;
  try {
    const { domain_name, properties, lock_handle, session_id, session_state } =
      args as UpdateDomainArgs;

    // Validation
    if (!domain_name || !properties || !lock_handle) {
      return return_error(
        new Error('domain_name, properties, and lock_handle are required'),
      );
    }

    const client = new AdtClient(connection);

    const domainName = domain_name.toUpperCase();

    logger?.info(`Starting domain update: ${domainName}`);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    try {
      // Update domain with properties
      const updateState = await client.getDomain().update(
        {
          domainName,
          packageName: properties.package_name || properties.packageName,
          description: properties.description || '',
        },
        { lockHandle: lock_handle },
      );
      const updateResult = updateState.updateResult;

      if (!updateResult) {
        throw new Error(
          `Update did not return a response for domain ${domainName}`,
        );
      }

      // Get updated session state after update

      logger?.info(`✅ UpdateDomain completed: ${domainName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            domain_name: domainName,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Domain ${domainName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating domain ${domainName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to update domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Domain ${domainName} is locked by another user or lock handle is invalid.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
