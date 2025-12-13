/**
 * UpdateProgram Handler - Update ABAP Program Source Code
 *
 * Uses CrudClient.updateProgram from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, getManagedConnection, isCloudConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UpdateProgramLow",
  description: "[low-level] Update source code of an existing ABAP program. Requires lock handle from LockObject. - use UpdateProgram (high-level) for full workflow with lock/unlock/activate.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_TEST_PROGRAM). Program must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP program source code."
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockObject. Required for update operation."
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
    required: ["program_name", "source_code", "lock_handle"]
  }
} as const;

interface UpdateProgramArgs {
  program_name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UpdateProgram MCP tool
 *
 * Uses CrudClient.updateProgram - low-level single method call
 */
export async function handleUpdateProgram(args: UpdateProgramArgs) {
  try {
    const {
      program_name,
      source_code,
      lock_handle,
      session_id,
      session_state
    } = args as UpdateProgramArgs;

    // Validation
    if (!program_name || !source_code || !lock_handle) {
      return return_error(new Error('program_name, source_code, and lock_handle are required'));
    }

    // Check if cloud - programs are not available on cloud systems
    if (isCloudConnection()) {
      return return_error(new Error('Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleUpdateProgram',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const programName = program_name.toUpperCase();

    handlerLogger.info(`Starting program update: ${programName}`);

    try {
      // Update program with source code
      await client.updateProgram({ programName: programName, sourceCode: source_code }, lock_handle);
      const updateResult = client.getUpdateResult();

      if (!updateResult) {
        throw new Error(`Update did not return a response for program ${programName}`);
      }

      // Get updated session state after update


      handlerLogger.info(`✅ UpdateProgram completed: ${programName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          program_name: programName,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Program ${programName} updated successfully. Remember to unlock using UnlockObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error updating program ${programName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to update program: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Program ${programName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Program ${programName} is locked by another user or lock handle is invalid.`;
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
