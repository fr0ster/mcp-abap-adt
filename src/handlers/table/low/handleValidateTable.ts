/**
 * ValidateTable Handler - Validate ABAP table name via ADT API
 *
 * Uses validateTableName from @mcp-abap-adt/adt-clients/core/table for table-specific validation.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, parseValidationResponse } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { TableBuilderConfig } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "ValidateTableLow",
  description: "[low-level] Validate an ABAP table name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: {
        type: "string",
        description: "Table name to validate (e.g., Z_MY_TABLE)"
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation."
      },
      description: {
        type: "string",
        description: "Table description. Required for validation."
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
    required: ["table_name", "package_name", "description"]
  }
} as const;

interface ValidateTableArgs extends Pick<TableBuilderConfig, 'tableName' | 'packageName' | 'description'> {
  table_name: string;
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
 * Main handler for ValidateTable MCP tool
 */
export async function handleValidateTable(args: ValidateTableArgs) {
  try {
    const {
      table_name,
      package_name,
      description,
      session_id,
      session_state
    } = args as ValidateTableArgs;

    if (!table_name || !package_name || !description) {
      return return_error(new Error('table_name, package_name, and description are required'));
    }

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

    const tableName = table_name.toUpperCase();

    logger.info(`Starting table validation: ${tableName}`);

    try {
      const client = new CrudClient(connection);

      await client.validateTable({
        tableName: tableName,
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

      logger.info(`✅ ValidateTable completed: ${tableName}`);
      logger.info(`   Valid: ${result.valid}, Message: ${result.message || 'N/A'}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          table_name: tableName,
          description: description || null,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `Table name ${tableName} is valid and available`
            : `Table name ${tableName} validation failed: ${result.message || 'Unknown error'}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error validating table ${tableName}:`, error);

      let errorMessage = `Failed to validate table: ${error.message || String(error)}`;

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

