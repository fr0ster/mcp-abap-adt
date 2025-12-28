/**
 * UpdateTable Handler - Update ABAP Table DDL Source
 *
 * Uses AdtClient.updateTable from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateTableLow',
  description:
    '[low-level] Update DDL source code of an existing ABAP table. Requires lock handle from LockObject. - use CreateTable for full workflow with lock/unlock.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description:
          'Table name (e.g., ZOK_T_TEST_0001). Table must already exist.',
      },
      ddl_code: {
        type: 'string',
        description: 'Complete DDL source code for the table definition.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
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
    required: ['table_name', 'ddl_code', 'lock_handle'],
  },
} as const;

interface UpdateTableArgs {
  table_name: string;
  ddl_code: string;
  lock_handle: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateTable MCP tool
 *
 * Uses AdtClient.updateTable - low-level single method call
 */
export async function handleUpdateTable(
  context: HandlerContext,
  args: UpdateTableArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      table_name,
      ddl_code,
      lock_handle,
      transport_request,
      session_id,
      session_state,
    } = args as UpdateTableArgs;

    // Validation
    if (!table_name || !ddl_code || !lock_handle) {
      return return_error(
        new Error('table_name, ddl_code, and lock_handle are required'),
      );
    }

    const client = new AdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    const tableName = table_name.toUpperCase();

    logger?.info(`Starting table update: ${tableName}`);

    try {
      // Update table with DDL code
      const updateState = await client.getTable().update(
        {
          tableName: tableName,
          ddlCode: ddl_code,
          transportRequest: transport_request,
        },
        { lockHandle: lock_handle },
      );
      const updateResult = updateState.updateResult;

      if (!updateResult) {
        throw new Error(
          `Update did not return a response for table ${tableName}`,
        );
      }

      // Get updated session state after update

      logger?.info(`✅ UpdateTable completed: ${tableName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            table_name: tableName,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Table ${tableName} updated successfully. Remember to unlock using UnlockObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(`Error updating table ${tableName}:`, error);

      // Parse error message
      let errorMessage = `Failed to update table: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Table ${tableName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Table ${tableName} is locked by another user or lock handle is invalid.`;
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
