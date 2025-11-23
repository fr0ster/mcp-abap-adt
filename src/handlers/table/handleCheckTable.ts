/**
 * CheckTable Handler - Syntax check for ABAP table via ADT API
 *
 * Uses runTableCheckRun from @mcp-abap-adt/adt-clients/core/table for table-specific checking.
 * Requires session_id for stateful operations.
 */

import { AxiosResponse } from '../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../lib/utils';
import { generateSessionId } from '../../lib/sessionUtils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../../lib/checkRunParser';

export const TOOL_DEFINITION = {
  name: "CheckTable",
  description: "Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Requires session_id for stateful operations. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., Z_MY_TABLE)"
      },
      reporter: {
        type: "string",
        description: "Check reporter: 'tableStatusCheck' or 'abapCheckRun'. Default: abapCheckRun",
        enum: ["tableStatusCheck", "abapCheckRun"]
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
    required: ["table_name"]
  }
} as const;

interface CheckTableArgs {
  table_name: string;
  reporter?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckTable MCP tool
 */
export async function handleCheckTable(args: any) {
  try {
    const {
      table_name,
      reporter = 'abapCheckRun',
      session_id,
      session_state
    } = args as CheckTableArgs;

    if (!table_name) {
      return return_error(new Error('table_name is required'));
    }

    const validReporters = ['tableStatusCheck', 'abapCheckRun'];
    const checkReporter = (reporter && validReporters.includes(reporter))
      ? reporter as 'tableStatusCheck' | 'abapCheckRun'
      : 'abapCheckRun';

    const connection = getManagedConnection();

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

    // Use provided session_id or generate new one (required for table check)
    const sessionId = session_id || generateSessionId();
    const tableName = table_name.toUpperCase();

    logger.info(`Starting table check: ${tableName} (reporter: ${checkReporter}, session: ${sessionId.substring(0, 8)}...)`);

    try {
      const builder = new CrudClient(connection);

      await builder.checkTable(checkReporter as 'tableStatusCheck' | 'abapCheckRun');
      const response = builder.getCheckResult();
      if (!response) {
        throw new Error('Table check did not return a response');
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CheckTable completed: ${tableName}`);
      logger.info(`   Status: ${checkResult.status}`);
      logger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          table_name: tableName,
          reporter: checkReporter,
          check_result: checkResult,
          session_id: sessionId,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: checkResult.success
            ? `Table ${tableName} has no syntax errors`
            : `Table ${tableName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error checking table ${tableName}:`, error);

      let errorMessage = `Failed to check table: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Table ${tableName} not found.`;
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

