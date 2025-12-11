/**
 * LockProgram Handler - Lock ABAP Program
 *
 * Uses CrudClient.lockProgram from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection, isCloudConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "LockProgramLow",
  description: "[low-level] Lock an ABAP program for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_MY_PROGRAM)."
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
    required: ["program_name"]
  }
} as const;

interface LockProgramArgs {
  program_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockProgram MCP tool
 *
 * Uses CrudClient.lockProgram - low-level single method call
 */
export async function handleLockProgram(args: LockProgramArgs) {
  try {
    const {
      program_name,
      session_id,
      session_state
    } = args as LockProgramArgs;

    // Validation
    if (!program_name) {
      return return_error(new Error('program_name is required'));
    }

    // Check if cloud - programs are not available on cloud systems
    if (isCloudConnection()) {
      return return_error(new Error('Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleLockProgram',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

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

    const programName = program_name.toUpperCase();

    handlerLogger.info(`Starting program lock: ${programName}`);

    try {
      // Lock program
      await client.lockProgram({ programName: programName });
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for program ${programName}`);
      }

      // Get updated session state after lock
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ LockProgram completed: ${programName}`);
      handlerLogger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          program_name: programName,
          session_id: session_id || null,
          lock_handle: lockHandle,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Program ${programName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error locking program ${programName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to lock program: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Program ${programName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Program ${programName} is already locked by another user.`;
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
