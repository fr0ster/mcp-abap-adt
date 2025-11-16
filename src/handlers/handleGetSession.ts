/**
 * GetSession Handler - Get session ID and session state for reuse across multiple requests
 *
 * Returns session ID and session state (cookies, CSRF token) that can be passed
 * to other handlers to maintain the same session and lock handle across operations.
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { generateSessionId } from '../lib/sessionUtils';

export const TOOL_DEFINITION = {
  name: "GetSession",
  description: "Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.",
  inputSchema: {
    type: "object",
    properties: {
      force_new: {
        type: "boolean",
        description: "Force creation of a new session even if one exists. Default: false"
      }
    },
    required: []
  }
} as const;

interface GetSessionArgs {
  force_new?: boolean;
}

/**
 * Main handler for GetSession MCP tool
 *
 * Returns session ID and session state that can be reused in other handlers
 */
export async function handleGetSession(args: any) {
  try {
    const { force_new = false } = args as GetSessionArgs;

    const connection = getManagedConnection();

    // Ensure connection is established (get cookies and CSRF token)
    await connection.connect();

    // Generate new session ID
    const sessionId = generateSessionId();

    // Get current session state (cookies, CSRF token)
    const sessionState = connection.getSessionState();

    if (!sessionState) {
      return return_error(new Error('Failed to get session state. Connection may not be properly initialized.'));
    }

    logger.info(`✅ GetSession completed: session ID ${sessionId.substring(0, 8)}...`);

    return return_response({
      data: JSON.stringify({
        success: true,
        session_id: sessionId,
        session_state: {
          cookies: sessionState.cookies,
          csrf_token: sessionState.csrfToken,
          cookie_store: sessionState.cookieStore
        },
        message: `Session ID generated. Use this session_id in subsequent requests to maintain the same session.`
      }, null, 2)
    } as AxiosResponse);

  } catch (error: any) {
    logger.error('Error getting session:', error);
    return return_error(error);
  }
}

