/**
 * ActivateClassTestClasses Handler - Activate ABAP Unit test include for a class
 *
 * Uses CrudClient.activateTestClasses from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ActivateClassTestClassesLow",
  description: "[low-level] Activate ABAP Unit test classes include for an existing class. Should be executed after updating and unlocking test classes.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_MY_CLASS)."
      },
      test_class_name: {
        type: "string",
        description: "Optional ABAP Unit test class name (e.g., LTCL_MY_CLASS). Defaults to auto-detected value."
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

interface ActivateClassTestClassesArgs {
  class_name: string;
  test_class_name?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleActivateClassTestClasses(args: ActivateClassTestClassesArgs) {
  try {
    const {
      class_name,
      test_class_name,
      session_id,
      session_state
    } = args as ActivateClassTestClassesArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleActivateClassTestClasses',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      await connection.connect();
    }

    const className = class_name.toUpperCase();
    const testClassName = test_class_name ? test_class_name.toUpperCase() : undefined;

    handlerLogger.info(`Starting test classes activation for: ${className}`);

    try {
      await client.activateTestClasses({
        className,
        testClassName: testClassName ?? className
      });
      const activationResult = client.getTestClassActivateResult();
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ ActivateClassTestClasses completed: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          session_id: session_id || null,
          status: activationResult?.status,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Test classes for ${className} activated successfully.`
        }, null, 2)
      } as AxiosResponse);
    } catch (error: any) {
      handlerLogger.error(`Error activating test classes for ${className}: ${error?.message || error}`);
      const reason = error?.response?.status === 404
        ? `Class ${className} not found or test classes are missing.`
        : error?.message || String(error);
      return return_error(new Error(reason));
    }
  } catch (error: any) {
    return return_error(error);
  }
}

