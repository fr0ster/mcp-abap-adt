/**
 * ValidateClass Handler - Validate ABAP class name via ADT API
 *
 * Uses validateClassName from @mcp-abap-adt/adt-clients/core/class for class-specific validation.
 * Supports package, description, and superclass validation.
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateClassName } from '@mcp-abap-adt/adt-clients/dist/core/class';

export const TOOL_DEFINITION = {
  name: "ValidateClass",
  description: "Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name to validate (e.g., ZCL_MY_CLASS)"
      },
      package_name: {
        type: "string",
        description: "Optional package name for validation"
      },
      description: {
        type: "string",
        description: "Optional description for validation"
      },
      superclass: {
        type: "string",
        description: "Optional superclass name for validation (e.g., CL_OBJECT)"
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

interface ValidateClassArgs {
  class_name: string;
  package_name?: string;
  description?: string;
  superclass?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateClass MCP tool
 */
export async function handleValidateClass(args: any) {
  try {
    const {
      class_name,
      package_name,
      description,
      superclass,
      session_id,
      session_state
    } = args as ValidateClassArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const connection = getManagedConnection();

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

    const className = class_name.toUpperCase();

    logger.info(`Starting class validation: ${className}`);

    try {
      // Validate class using class-specific function
      const result = await validateClassName(
        connection,
        className,
        package_name,
        description,
        superclass
      );

      // Get updated session state after validation
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ ValidateClass completed: ${className}`);
      logger.info(`   Valid: ${result.valid}, Message: ${result.message || 'N/A'}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          class_name: className,
          package_name: package_name || null,
          description: description || null,
          superclass: superclass || null,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `Class name ${className} is valid and available`
            : `Class name ${className} validation failed: ${result.message || 'Unknown error'}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error validating class ${className}:`, error);

      let errorMessage = `Failed to validate class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Class ${className} not found.`;
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

