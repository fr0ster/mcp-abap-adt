/**
 * CheckTable Handler - Syntax check for ABAP table via ADT API
 *
 * Uses runTableCheckRun from @mcp-abap-adt/adt-clients/core/table for table-specific checking.
 * Requires session_id for stateful operations.
 */

import { generateSessionId } from '../../../lib/sessionUtils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CheckTableLow",
  description: "[low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Requires session_id for stateful operations. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., Z_MY_TABLE)"
      },
      ddl_code: {
        type: "string",
        description: "Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body."
      },
      version: {
        type: "string",
        description: "Version to check: 'active' (last activated), 'inactive' (current unsaved), or 'new' (for new code validation). Default: new",
        enum: ["active", "inactive", "new"]
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
  ddl_code?: string;
  version?: string;
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
export async function handleCheckTable(connection: AbapConnection, args: CheckTableArgs) {
  try {
    const {
      table_name,
      ddl_code,
      version = 'new',
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

    const validVersions = ['active', 'inactive', 'new'];
    const checkVersion = (version && validVersions.includes(version.toLowerCase()))
      ? version.toLowerCase() as 'active' | 'inactive' | 'new'
      : 'new';

        const handlerLogger = getHandlerLogger(
      'handleCheckTable',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    // Use provided session_id or generate new one (required for table check)
    const sessionId = session_id || generateSessionId();
    const tableName = table_name.toUpperCase();

    handlerLogger.info(`Starting table check: ${tableName} (reporter: ${checkReporter}, version: ${checkVersion}, session: ${sessionId.substring(0, 8)}..., ${ddl_code ? 'with new code' : 'saved version'})`);

    try {
      const builder = new CrudClient(connection);

      // Check table with optional source code (for validating new/unsaved code)
      // If ddl_code is provided, it will be base64 encoded in the request body
      await builder.checkTable({ tableName }, ddl_code, checkVersion);
      const response = builder.getCheckResult();
      if (!response) {
        throw new Error('Table check did not return a response');
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check


      handlerLogger.info(`✅ CheckTable completed: ${tableName}`);
      handlerLogger.info(`   Status: ${checkResult.status}`);
      handlerLogger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          table_name: tableName,
          version: checkVersion,
          reporter: checkReporter,
          check_result: checkResult,
          session_id: sessionId,
          session_state: null, // Session state management is now handled by auth-broker,
          message: checkResult.success
            ? `Table ${tableName} has no syntax errors`
            : `Table ${tableName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error checking table ${tableName}:`, error);

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
