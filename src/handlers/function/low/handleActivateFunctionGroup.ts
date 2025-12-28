/**
 * ActivateFunctionGroup Handler - Activate ABAP Function Group
 *
 * Uses AdtClient.activateFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseActivationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateFunctionGroupLow',
  description:
    '[low-level] Activate an ABAP function group. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_FG_TEST).',
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
    required: ['function_group_name'],
  },
} as const;

interface ActivateFunctionGroupArgs {
  function_group_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateFunctionGroup MCP tool
 *
 * Uses AdtClient.activateFunctionGroup - low-level single method call
 */
export async function handleActivateFunctionGroup(
  context: HandlerContext,
  args: ActivateFunctionGroupArgs,
) {
  const { connection, logger } = context;
  try {
    const { function_group_name, session_id, session_state } =
      args as ActivateFunctionGroupArgs;

    // Validation
    if (!function_group_name) {
      return return_error(new Error('function_group_name is required'));
    }

    const client = new AdtClient(connection);
    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const functionGroupName = function_group_name.toUpperCase();

    logger?.info(`Starting function group activation: ${functionGroupName}`);

    try {
      // Activate function group
      const activateState = await client.getFunctionGroup().activate({
        functionGroupName: functionGroupName,
      });
      const response = activateState.activateResult;

      if (!response) {
        throw new Error(
          `Activation did not return a response for function group ${functionGroupName}`,
        );
      }

      // Parse activation response
      const activationResult = parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation

      logger?.info(`✅ ActivateFunctionGroup completed: ${functionGroupName}`);
      logger?.debug(
        `Activated: ${activationResult.activated}, Checked: ${activationResult.checked}, Messages: ${activationResult.messages.length}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success,
            function_group_name: functionGroupName,
            activation: {
              activated: activationResult.activated,
              checked: activationResult.checked,
              generated: activationResult.generated,
            },
            messages: activationResult.messages,
            warnings: activationResult.messages.filter(
              (m) => m.type === 'warning' || m.type === 'W',
            ),
            errors: activationResult.messages.filter(
              (m) => m.type === 'error' || m.type === 'E',
            ),
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: success
              ? `Function group ${functionGroupName} activated successfully`
              : `Function group ${functionGroupName} activation completed with ${activationResult.messages.length} message(s)`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error activating function group ${functionGroupName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to activate function group: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Function group ${functionGroupName} not found.`;
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
