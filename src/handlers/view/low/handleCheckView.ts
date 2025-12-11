/**
 * CheckView Handler - Syntax check for ABAP View
 *
 * Uses CrudClient.checkView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CheckViewLow",
  description: "[low-level] Perform syntax check on an ABAP view. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_source is provided, validates new/unsaved code (will be base64 encoded in request).",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., Z_MY_PROGRAM)."
      },
      ddl_source: {
        type: "string",
        description: "Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body."
      },
      version: {
        type: "string",
        description: "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: inactive",
        enum: ["active", "inactive"]
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

interface CheckViewArgs {
  view_name: string;
  ddl_source?: string;
  version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckView MCP tool
 *
 * Uses CrudClient.checkView - low-level single method call
 */
export async function handleCheckView(args: CheckViewArgs) {
  try {
    const {
      view_name,
      ddl_source,
      version = 'inactive',
      session_id,
      session_state
    } = args as CheckViewArgs;

    // Validation
    if (!view_name) {
      return return_error(new Error('view_name is required'));
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

    const validVersions = ['active', 'inactive'];
    const checkVersion = (version && validVersions.includes(version.toLowerCase()))
      ? version.toLowerCase() as 'active' | 'inactive'
      : 'inactive';

    const handlerLogger = getHandlerLogger(
      'handleCheckView',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting view check: ${viewName} (version: ${checkVersion}) ${ddl_source ? '(with new code)' : '(saved version)'}`);

    try {
      // Check view with optional source code (for validating new/unsaved code)
      // If ddl_source is provided, it will be base64 encoded in the request body
      await client.checkView({ viewName: viewName }, ddl_source, checkVersion);
      const response = client.getCheckResult();

      if (!response) {
        throw new Error(`Check did not return a response for view ${viewName}`);
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ CheckView completed: ${viewName}`);
      handlerLogger.info(`   Status: ${checkResult.status}`);
      handlerLogger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          view_name: viewName,
          version: checkVersion,
          check_result: checkResult,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: checkResult.success
            ? `View ${viewName} has no syntax errors`
            : `View ${viewName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error checking view ${viewName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to check view: ${error.message || String(error)}`;

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
