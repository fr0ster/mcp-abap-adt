/**
 * ValidateView Handler - Validate ABAP View Name
 *
 * Uses CrudClient.validateView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection, parseValidationResponse } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ValidateViewLow",
  description: "[low-level] Validate an ABAP view name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name to validate (e.g., Z_MY_PROGRAM)."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation."
      },
      description: {
        type: "string",
        description: "View description. Required for validation."
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
    required: ["view_name", "package_name", "description"]
  }
} as const;

interface ValidateViewArgs {
  view_name: string;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateView MCP tool
 *
 * Uses CrudClient.validateView - low-level single method call
 */
export async function handleValidateView(args: ValidateViewArgs) {
  const handlerLogger = getHandlerLogger(
    'handleValidateView',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    const {
      view_name,
      description,
      package_name,
      session_id,
      session_state
    } = args as ValidateViewArgs;

    // Validation
    if (!view_name || !package_name || !description) {
      return return_error(new Error('view_name, package_name, and description are required'));
    }

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

    handlerLogger.info(`Starting view validation: ${viewName}`);

    try {
      // Validate view
      await client.validateView({
        viewName: viewName,
        packageName: package_name.toUpperCase(),
        description: description
      });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ ValidateView completed: ${viewName}`);
      handlerLogger.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          view_name: viewName,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `View name ${viewName} is valid and available`
            : `View name ${viewName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error validating view ${viewName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to validate view: ${error.message || String(error)}`;

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
