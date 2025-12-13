/**
 * CheckBehaviorDefinition Handler - Syntax check for ABAP BehaviorDefinition
 *
 * Uses CrudClient.checkBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
import type { BehaviorDefinitionBuilderConfig } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CheckBdefLow",
  description: "[low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "BehaviorDefinition name (e.g., Z_MY_PROGRAM)."
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

interface CheckBehaviorDefinitionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckBehaviorDefinition MCP tool
 *
 * Uses CrudClient.checkBehaviorDefinition - low-level single method call
 */
export async function handleCheckBehaviorDefinition(args: CheckBehaviorDefinitionArgs) {
  try {
    const {
      name,
      session_id,
      session_state
    } = args as CheckBehaviorDefinitionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleCheckBehaviorDefinition',
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

    const bdefName = name.toUpperCase();

    handlerLogger.info(`Starting behavior definition check: ${bdefName}`);

    try {
      // Check behavior definition - using types from adt-clients
      const checkConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> = {
        name: bdefName
      };
      await client.checkBehaviorDefinition(checkConfig);
      const response = client.getCheckResult();

      if (!response) {
        throw new Error(`Check did not return a response for behavior definition ${bdefName}`);
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check


      handlerLogger.info(`✅ CheckBehaviorDefinition completed: ${bdefName}`);
      handlerLogger.info(`   Status: ${checkResult.status}`);
      handlerLogger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          name: bdefName,
          check_result: checkResult,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: checkResult.success
            ? `BehaviorDefinition ${bdefName} has no syntax errors`
            : `BehaviorDefinition ${bdefName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error checking behavior definition ${bdefName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to check behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${bdefName} not found.`;
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
