/**
 * ActivateBehaviorDefinition Handler - Activate ABAP Behavior Definition
 *
 * Uses AdtClient.activateBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import type { IBehaviorDefinitionConfig } from '@mcp-abap-adt/adt-clients';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseActivationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateBehaviorDefinitionLow',
  description:
    '[low-level] Activate an ABAP behavior definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Behavior definition name (root entity, e.g., ZI_MY_ENTITY).',
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
    required: ['name'],
  },
} as const;

interface ActivateBehaviorDefinitionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateBehaviorDefinition MCP tool
 *
 * Uses AdtClient.activateBehaviorDefinition - low-level single method call
 */
export async function handleActivateBehaviorDefinition(
  context: HandlerContext,
  args: ActivateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  try {
    const { name, session_id, session_state } =
      args as ActivateBehaviorDefinitionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const behaviorDefinitionName = name.toUpperCase();

    logger?.info(
      `Starting behavior definition activation: ${behaviorDefinitionName}`,
    );

    try {
      // Activate behavior definition - using types from adt-clients
      const activateConfig: Pick<IBehaviorDefinitionConfig, 'name'> = {
        name: behaviorDefinitionName,
      };
      const activateState = await client
        .getBehaviorDefinition()
        .activate(activateConfig);
      const response = activateState.activateResult;

      if (!response) {
        throw new Error(
          `Activation did not return a response for behavior definition ${behaviorDefinitionName}`,
        );
      }

      // Parse activation response
      const activationResult = parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation

      logger?.info(
        `✅ ActivateBehaviorDefinition completed: ${behaviorDefinitionName}`,
      );
      logger?.info(
        `   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`,
      );
      logger?.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify(
          {
            success,
            name: behaviorDefinitionName,
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
              ? `Behavior definition ${behaviorDefinitionName} activated successfully`
              : `Behavior definition ${behaviorDefinitionName} activation completed with ${activationResult.messages.length} message(s)`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error activating behavior definition ${behaviorDefinitionName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to activate behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Behavior definition ${behaviorDefinitionName} not found.`;
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
