/**
 * GetSession Handler - Get session ID and session state for reuse across multiple requests
 *
 * Returns session ID and session state (cookies, CSRF token) that can be passed
 * to other handlers to maintain the same session and lock handle across operations.
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { generateSessionId } from '../../../lib/sessionUtils';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetSession',
  description:
    '[read-only] Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.',
  inputSchema: {
    type: 'object',
    properties: {
      force_new: {
        type: 'boolean',
        description:
          'Force creation of a new session even if one exists. Default: false',
      },
    },
    required: [],
  },
} as const;

interface GetSessionArgs {
  force_new?: boolean;
}

/**
 * Main handler for GetSession MCP tool
 *
 * Returns session ID and session state that can be reused in other handlers
 */
export async function handleGetSession(
  context: HandlerContext,
  args: GetSessionArgs,
) {
  const { connection, logger } = context;
  try {
    const { force_new = false } = args as GetSessionArgs;

    logger?.debug(
      `Connecting managed session${force_new ? ' (force new)' : ''}...`,
    );

    // Ensure connection is established (get cookies and CSRF token)
    // Generate new session ID
    const sessionId = generateSessionId();

    // Session state management is now handled by auth-broker
    logger?.info(
      `✅ GetSession completed: session ID ${sessionId.substring(0, 8)}...`,
    );

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          session_id: sessionId,
          session_state: null, // Session state management is now handled by auth-broker
          message: `Session ID generated. Use this session_id in subsequent requests to maintain the same session.`,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    logger?.error('Error getting session:', error);
    return return_error(error);
  }
}
