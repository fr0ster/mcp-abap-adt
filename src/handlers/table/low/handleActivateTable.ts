/**
 * ActivateTable Handler - Activate ABAP Table
 *
 * Uses CrudClient.activateTable from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ActivateTableLow",
  description: "[low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name (e.g., ZTB_MY_TABLE)."
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

interface ActivateTableArgs {
  table_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateTable MCP tool
 *
 * Uses CrudClient.activateTable - low-level single method call
 */
export async function handleActivateTable(connection: AbapConnection, args: ActivateTableArgs) {
  try {
    const {
      table_name,
      session_id,
      session_state
    } = args as ActivateTableArgs;

    // Validation
    if (!table_name) {
      return return_error(new Error('table_name is required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleActivateTable',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const tableName = table_name.toUpperCase();

    handlerLogger.info(`Starting table activation: ${tableName}`);

    try {
      // Activate table
      await client.activateTable({ tableName: tableName });
      const response = client.getActivateResult();

      if (!response) {
        throw new Error(`Activation did not return a response for table ${tableName}`);
      }

      // Parse activation response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation


      handlerLogger.info(`✅ ActivateTable completed: ${tableName}`);
      handlerLogger.info(`   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`);
      handlerLogger.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify({
          success,
          table_name: tableName,
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
            ? `Table ${tableName} activated successfully`
            : `Table ${tableName} activation completed with ${activationResult.messages.length} message(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error activating table ${tableName}:`, error);

      // Parse error message
      let errorMessage = `Failed to activate table: ${error.message || String(error)}`;

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
