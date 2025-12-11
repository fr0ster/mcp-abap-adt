/**
 * ActivateView Handler - Activate ABAP View (CDS View)
 *
 * Uses CrudClient.activateView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ActivateViewLow",
  description: "[low-level] Activate an ABAP view (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., ZVW_MY_VIEW)."
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
    required: ["view_name"]
  }
} as const;

interface ActivateViewArgs {
  view_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateView MCP tool
 *
 * Uses CrudClient.activateView - low-level single method call
 */
export async function handleActivateView(args: ActivateViewArgs) {
  try {
    const {
      view_name,
      session_id,
      session_state
    } = args as ActivateViewArgs;

    // Validation
    if (!view_name) {
      return return_error(new Error('view_name is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleActivateView',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const viewName = view_name.toUpperCase();

    handlerLogger.info(`Starting view activation: ${viewName}`);

    try {
      // Activate view
      await client.activateView({ viewName: viewName });
      const response = client.getActivateResult();

      if (!response) {
        throw new Error(`Activation did not return a response for view ${viewName}`);
      }

      // Parse activation response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ ActivateView completed: ${viewName}`);
      handlerLogger.info(`   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`);
      handlerLogger.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify({
          success,
          view_name: viewName,
          activation: {
            activated: activationResult.activated,
            checked: activationResult.checked,
            generated: activationResult.generated
          },
          messages: activationResult.messages,
          warnings: activationResult.messages.filter(m => m.type === 'warning' || m.type === 'W'),
          errors: activationResult.messages.filter(m => m.type === 'error' || m.type === 'E'),
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: success
            ? `View ${viewName} activated successfully`
            : `View ${viewName} activation completed with ${activationResult.messages.length} message(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error activating view ${viewName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to activate view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${viewName} not found.`;
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
