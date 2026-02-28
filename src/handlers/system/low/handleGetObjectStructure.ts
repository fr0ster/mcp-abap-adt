/**
 * GetObjectStructure Handler - Low-level handler for object structure
 *
 * Uses getObjectStructure from @mcp-abap-adt/adt-clients AdtUtils.
 * Retrieves ADT object structure as compact JSON tree.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetObjectStructureLow',
  description:
    '[low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description:
          'Object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K", "DDLS/DF")',
      },
      object_name: {
        type: 'string',
        description: 'Object name (e.g., "ZMY_CLASS", "ZMY_PROGRAM")',
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
    required: ['object_type', 'object_name'],
  },
} as const;

interface GetObjectStructureArgs {
  object_type: string;
  object_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for GetObjectStructureLow MCP tool
 *
 * Uses getObjectStructure from AdtUtils
 */
export async function handleGetObjectStructure(
  context: HandlerContext,
  args: GetObjectStructureArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.object_type) {
      return return_error(new Error('object_type is required'));
    }
    if (!args?.object_name) {
      return return_error(new Error('object_name is required'));
    }

    // Restore session state if provided
    if (args.session_id && args.session_state) {
      const { restoreSessionInConnection } = await import(
        '../../../lib/utils.js'
      );
      await restoreSessionInConnection(
        connection,
        args.session_id,
        args.session_state,
      );
    }

    // Create AdtClient and get utilities
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    logger?.info(
      `Fetching object structure for ${args.object_type}/${args.object_name}`,
    );

    const result = await utils.getObjectStructure(
      args.object_type,
      args.object_name,
    );

    logger?.debug(
      `Object structure fetched successfully for ${args.object_type}/${args.object_name}`,
    );

    return return_response(result);
  } catch (error: any) {
    logger?.error('Failed to fetch object structure', error);
    return return_error(error);
  }
}
