/**
 * LockMetadataExtension Handler - Lock ABAP MetadataExtension
 *
 * Uses AdtClient.lockMetadataExtension from @mcp-abap-adt/adt-clients.
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
  name: 'LockMetadataExtensionLow',
  description:
    '[low-level] Lock an ABAP metadata extension for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      objName: {
        type: 'string',
        description: 'MetadataExtension name (e.g., Z_MY_PROGRAM).',
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
    required: ['name'],
  },
} as const;

interface LockMetadataExtensionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockMetadataExtension MCP tool
 *
 * Uses AdtClient.lockMetadataExtension - low-level single method call
 */
export async function handleLockMetadataExtension(
  context: HandlerContext,
  args: LockMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  try {
    const { name, session_id, session_state } =
      args as LockMetadataExtensionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlxName = name.toUpperCase();

    logger?.info(`Starting metadata extension lock: ${ddlxName}`);

    try {
      // Lock metadata extension
      const lockHandle = await client
        .getMetadataExtension()
        .lock({ name: ddlxName });

      if (!lockHandle) {
        throw new Error(
          `Lock did not return a lock handle for metadata extension ${ddlxName}`,
        );
      }

      // Get updated session state after lock

      logger?.info(`✅ LockMetadataExtension completed: ${ddlxName}`);
      logger?.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            name: ddlxName,
            session_id: session_id || null,
            lock_handle: lockHandle,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `MetadataExtension ${ddlxName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error locking metadata extension ${ddlxName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to lock metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `MetadataExtension ${ddlxName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `MetadataExtension ${ddlxName} is already locked by another user.`;
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
