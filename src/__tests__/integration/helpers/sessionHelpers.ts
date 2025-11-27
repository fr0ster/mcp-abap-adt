/**
 * Session management helpers for low-level handler integration tests
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { parseHandlerResponse, extractSessionState } from './testHelpers';

export interface SessionInfo {
  session_id: string;
  session_state: {
    cookies: string;
    csrf_token: string;
    cookie_store: Record<string, string>;
  };
}

/**
 * Get a new session for testing
 */
export async function getTestSession(): Promise<SessionInfo> {
  const response = await handleGetSession({ force_new: false });
  const data = parseHandlerResponse(response);

  if (!data.session_id || !data.session_state) {
    throw new Error('GetSession did not return session_id and session_state');
  }

  return {
    session_id: data.session_id,
    session_state: data.session_state
  };
}

/**
 * Update session state from handler response
 */
export function updateSessionFromResponse(
  currentSession: SessionInfo | null,
  handlerResponse: any
): SessionInfo {
  const { session_id, session_state } = extractSessionState(handlerResponse);

  if (!session_id || !session_state) {
    // If response doesn't have session info, return current session
    if (currentSession) {
      return currentSession;
    }
    throw new Error('Handler response does not contain session information and no current session available');
  }

  return {
    session_id,
    session_state
  };
}

/**
 * Extract session from Lock response (CRITICAL: must be used for Update/Unlock)
 */
export function extractLockSession(lockResponse: any): SessionInfo {
  const { session_id, session_state } = extractSessionState(lockResponse);

  if (!session_id || !session_state) {
    throw new Error('Lock response does not contain session_id and session_state');
  }

  return {
    session_id,
    session_state
  };
}

