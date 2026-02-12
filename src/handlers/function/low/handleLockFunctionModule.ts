/**
 * LockFunctionModule Handler - Lock ABAP Function Module
 *
 * Uses AdtClient.lockFunctionModule from @mcp-abap-adt/adt-clients.
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
  name: 'LockFunctionModuleLow',
  description:
    '[low-level] Lock an ABAP function module for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FUNCTION).',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., ZFG_MY_GROUP).',
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
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

interface LockFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockFunctionModule MCP tool
 *
 * Uses AdtClient.lockFunctionModule - low-level single method call
 */
export async function handleLockFunctionModule(
  context: HandlerContext,
  args: LockFunctionModuleArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      function_module_name,
      function_group_name,
      session_id,
      session_state,
    } = args as LockFunctionModuleArgs;

    // Validation
    if (!function_module_name || !function_group_name) {
      return return_error(
        new Error('function_module_name and function_group_name are required'),
      );
    }

    const client = new AdtClient(connection);
    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const functionModuleName = function_module_name.toUpperCase();
    const functionGroupName = function_group_name.toUpperCase();

    logger?.info(
      `Starting function module lock: ${functionModuleName} in ${functionGroupName}`,
    );

    try {
      // Lock function module
      const lockHandle = await client.getFunctionModule().lock({
        functionModuleName: functionModuleName,
        functionGroupName: functionGroupName,
      });

      if (!lockHandle) {
        throw new Error(
          `Lock did not return a lock handle for function module ${functionModuleName}`,
        );
      }

      // Get updated session state after lock
      const actualSessionId = connection.getSessionId() || session_id || null;
      const actualSessionState = session_state || null;

      logger?.info(`✅ LockFunctionModule completed: ${functionModuleName}`);
      logger?.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            function_module_name: functionModuleName,
            function_group_name: functionGroupName,
            session_id: actualSessionId,
            lock_handle: lockHandle,
            session_state: actualSessionState,
            message: `Function module ${functionModuleName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error locking function module ${functionModuleName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to lock function module: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function module ${functionModuleName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Function module ${functionModuleName} is already locked by another user.`;
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
