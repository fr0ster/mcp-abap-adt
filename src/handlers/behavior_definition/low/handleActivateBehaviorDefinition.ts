/**
 * ActivateBehaviorDefinition Handler - Activate ABAP Behavior Definition
 *
 * Uses CrudClient.activateBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ActivateBehaviorDefinitionLow",
  description: "[low-level] Activate an ABAP behavior definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Behavior definition name (root entity, e.g., ZI_MY_ENTITY)."
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["name"]
  }
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
 * Uses CrudClient.activateBehaviorDefinition - low-level single method call
 */
export async function handleActivateBehaviorDefinition(args: ActivateBehaviorDefinitionArgs) {
  try {
    const {
      name,
      session_id,
      session_state
    } = args as ActivateBehaviorDefinitionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleActivateBehaviorDefinition',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const behaviorDefinitionName = name.toUpperCase();

    handlerLogger.info(`Starting behavior definition activation: ${behaviorDefinitionName}`);

    try {
      // Activate behavior definition - using types from adt-clients
      const activateConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = {
        name: behaviorDefinitionName
      };
      await client.activateBehaviorDefinition(activateConfig);
      const response = client.getActivateResult();

      if (!response) {
        throw new Error(`Activation did not return a response for behavior definition ${behaviorDefinitionName}`);
      }

      // Parse activation response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation


      handlerLogger.info(`✅ ActivateBehaviorDefinition completed: ${behaviorDefinitionName}`);
      handlerLogger.info(`   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`);
      handlerLogger.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify({
          success,
          name: behaviorDefinitionName,
          activation: {
            activated: activationResult.activated,
            checked: activationResult.checked,
            generated: activationResult.generated
          },
          messages: activationResult.messages,
          warnings: activationResult.messages.filter(m => m.type === 'warning' || m.type === 'W'),
          errors: activationResult.messages.filter(m => m.type === 'error' || m.type === 'E'),
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: success
            ? `Behavior definition ${behaviorDefinitionName} activated successfully`
            : `Behavior definition ${behaviorDefinitionName} activation completed with ${activationResult.messages.length} message(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error activating behavior definition ${behaviorDefinitionName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to activate behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Behavior definition ${behaviorDefinitionName} not found.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
