/**
 * GetNodeStructure Handler - Low-level handler for node structure
 *
 * Uses fetchNodeStructure from @mcp-abap-adt/adt-clients AdtUtils.
 * Fetches node structure from ADT repository for object tree navigation.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetNodeStructureLow',
  description:
    '[low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_type: {
        type: 'string',
        description: 'Parent object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K")',
      },
      parent_name: {
        type: 'string',
        description: 'Parent object name',
      },
      node_id: {
        type: 'string',
        description:
          'Optional node ID (default: "0000" for root). Use to fetch child nodes.',
        default: '0000',
      },
      with_short_descriptions: {
        type: 'boolean',
        description: 'Include short descriptions in response',
        default: true,
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
    required: ['parent_type', 'parent_name'],
  },
} as const;

interface GetNodeStructureArgs {
  parent_type: string;
  parent_name: string;
  node_id?: string;
  with_short_descriptions?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for GetNodeStructureLow MCP tool
 *
 * Uses fetchNodeStructure from AdtUtils
 */
export async function handleGetNodeStructure(
  context: HandlerContext,
  args: GetNodeStructureArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.parent_type) {
      return return_error(new Error('parent_type is required'));
    }
    if (!args?.parent_name) {
      return return_error(new Error('parent_name is required'));
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
    const client = new AdtClient(connection, logger);
    const utils = client.getUtils();

    logger?.info(
      `Fetching node structure for ${args.parent_type}/${args.parent_name}`,
    );

    const result = await utils.fetchNodeStructure(
      args.parent_type,
      args.parent_name,
      args.node_id || '0000',
      args.with_short_descriptions !== false,
    );

    logger?.debug(
      `Node structure fetched successfully for ${args.parent_type}/${args.parent_name}`,
    );

    return return_response(result);
  } catch (error: any) {
    logger?.error('Failed to fetch node structure', error);
    return return_error(error);
  }
}
