/**
 * UpdateInterface Handler - Update ABAP Interface Source Code
 *
 * Uses AdtClient.updateInterface from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateInterfaceLow',
  description:
    '[low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description:
          'Interface name (e.g., ZIF_TEST_INTERFACE). Interface must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP interface source code.',
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
    required: ['interface_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateInterfaceArgs {
  interface_name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateInterface MCP tool
 *
 * Uses AdtClient.updateInterface - low-level single method call
 */
export async function handleUpdateInterface(
  context: HandlerContext,
  args: UpdateInterfaceArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      interface_name,
      source_code,
      lock_handle,
      session_id,
      session_state,
    } = args as UpdateInterfaceArgs;

    // Validation
    if (!interface_name || !source_code || !lock_handle) {
      return return_error(
        new Error('interface_name, source_code, and lock_handle are required'),
      );
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const interfaceName = interface_name.toUpperCase();

    logger?.info(`Starting interface update: ${interfaceName}`);

    try {
      // Update interface with source code
      const updateState = await client
        .getInterface()
        .update(
          { interfaceName: interfaceName, sourceCode: source_code },
          { lockHandle: lock_handle },
        );
      const updateResult = updateState.updateResult;

      if (!updateResult) {
        throw new Error(
          `Update did not return a response for interface ${interfaceName}`,
        );
      }

      // Get updated session state after update

      logger?.info(`✅ UpdateInterface completed: ${interfaceName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            interface_name: interfaceName,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Interface ${interfaceName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating interface ${interfaceName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to update interface: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Interface ${interfaceName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Interface ${interfaceName} is locked by another user or lock handle is invalid.`;
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
