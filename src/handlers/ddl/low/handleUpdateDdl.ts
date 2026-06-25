/**
 * UpdateDdlLow Handler - Update ABAP DDL Source
 *
 * Uses AdtClient.updateView from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockDdlLow. - use UpdateDdl (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description:
          'DDL source name (e.g., ZOK_R_TEST_0002). DDL source must already exist.',
      },
      ddl_source: {
        type: 'string',
        description:
          "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement.",
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockDdlLow. Required for update operation.',
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
    required: ['ddl_name', 'ddl_source', 'lock_handle'],
  },
} as const;

interface UpdateDdlArgs {
  ddl_name: string;
  ddl_source: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateDdl MCP tool
 *
 * Uses AdtClient.updateView - low-level single method call
 */
export async function handleUpdateDdl(
  context: HandlerContext,
  args: UpdateDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, ddl_source, lock_handle, session_id, session_state } =
      args as UpdateDdlArgs;

    // Validation
    if (!ddl_name || !ddl_source || !lock_handle) {
      return return_error(
        new Error('ddl_name, ddl_source, and lock_handle are required'),
      );
    }

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Starting view update: ${ddlName}`);

    try {
      // Update view with DDL source
      const updateState = await client
        .getDdl()
        .update(
          { ddlName: ddlName, ddlSource: ddl_source },
          { lockHandle: lock_handle },
        );
      const updateResult = updateState.updateResult;

      if (!updateResult) {
        throw new Error(
          `Update did not return a response for DDL source ${ddlName}`,
        );
      }

      // Get updated session state after update

      logger?.info(`✅ UpdateDdlLow completed: ${ddlName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `DDL source ${ddlName} updated successfully. Remember to unlock using UnlockDdlLow.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating DDL source ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to update DDL source: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DDL source ${ddlName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `DDL source ${ddlName} is locked by another user or lock handle is invalid.`;
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
