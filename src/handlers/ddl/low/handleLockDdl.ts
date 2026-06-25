/**
 * LockView Handler - Lock ABAP View
 *
 * Uses AdtClient.lockView from @mcp-abap-adt/adt-clients.
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
  name: 'LockDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Lock an ABAP view for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'View name (e.g., Z_MY_PROGRAM).',
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
    required: ['ddl_name'],
  },
} as const;

interface LockDdlArgs {
  ddl_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockDdl MCP tool
 *
 * Uses AdtClient.lockView - low-level single method call
 */
export async function handleLockDdl(
  context: HandlerContext,
  args: LockDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, session_id, session_state } = args as LockDdlArgs;

    // Validation
    if (!ddl_name) {
      return return_error(new Error('ddl_name is required'));
    }

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Starting view lock: ${ddlName}`);

    try {
      // Lock view
      const lockHandle = await client.getDdl().lock({ ddlName: ddlName });

      if (!lockHandle) {
        throw new Error(
          `Lock did not return a lock handle for view ${ddlName}`,
        );
      }

      // Get updated session state after lock

      logger?.info(`✅ LockView completed: ${ddlName}`);
      logger?.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            ddl_name: ddlName,
            session_id: session_id || null,
            lock_handle: lockHandle,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `View ${ddlName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error locking view ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to lock view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${ddlName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `View ${ddlName} is already locked by another user.`;
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
