/**
 * LockBehaviorImplementation Handler - Lock ABAP Behavior Implementation Class
 *
 * Uses CrudClient.lockClass from @mcp-abap-adt/adt-clients (BehaviorImplementation extends ClassBuilder).
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, getManagedConnection, restoreSessionInConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { ClassBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "LockBehaviorImplementationLow",
  description: "[low-level] Lock an ABAP behavior implementation class for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Behavior Implementation class name (e.g., ZBP_MY_ENTITY)."
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
    required: ["class_name"]
  }
} as const;

interface LockBehaviorImplementationArgs {
  class_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockBehaviorImplementation MCP tool
 *
 * Uses CrudClient.lockClass - BehaviorImplementation extends ClassBuilder
 */
export async function handleLockBehaviorImplementation(args: LockBehaviorImplementationArgs) {
  try {
    const {
      class_name,
      session_id,
      session_state
    } = args as LockBehaviorImplementationArgs;

    // Validation
    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const className = class_name.toUpperCase();
    const handlerLogger = getHandlerLogger(
      'handleLockBehaviorImplementation',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting behavior implementation lock: ${className}`);

    try {
      // Lock class (BehaviorImplementation extends ClassBuilder)
      const lockConfig: Pick<ClassBuilderConfig, 'className'> = { className };
      await client.lockClass(lockConfig);
      const lockHandle = client.getLockHandle();

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for behavior implementation ${className}`);
      }

      // Get updated session state after lock


      handlerLogger.info(`✅ LockBehaviorImplementation completed: ${className}`);
      handlerLogger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          lock_handle: lockHandle,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Behavior Implementation ${className} locked successfully. Use lock_handle in subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error locking behavior implementation ${className}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to lock behavior implementation: ${error.message || String(error)}`;

      if (error.response?.data && typeof error.response.data === 'string') {
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
