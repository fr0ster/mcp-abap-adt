/**
 * ValidateClass Handler - Validate ABAP class name via ADT API
 *
 * Uses validateClassName from @mcp-abap-adt/adt-clients/core/class for class-specific validation.
 * Supports package, description, and superclass validation.
 */

import { return_error, return_response, logger, parseValidationResponse, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ValidateClassLow",
  description: "[low-level] Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name to validate (e.g., ZCL_MY_CLASS)"
      },
      package_name: {
        type: "string",
        description: "Package name for validation (required)."
      },
      description: {
        type: "string",
        description: "Description for validation (required)."
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
    required: ["class_name", "package_name", "description"]
  }
} as const;

interface ValidateClassArgs {
  class_name: string;
  package_name: string;
  description: string;
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
export async function handleValidateClass(connection: AbapConnection, args: ValidateClassArgs) {
  try {
    const {
      class_name,
      package_name,
      description,
      superclass,
      session_id,
      session_state
    } = args as ValidateClassArgs;

    if (!class_name || !package_name || !description) {
      return return_error(new Error('class_name, package_name, and description are required'));
    }

        // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const className = class_name.toUpperCase();

    const handlerLogger = getHandlerLogger('handleValidateClass', logger);
    handlerLogger.info(`Starting class validation: ${className}`);

    try {
      const builder = new CrudClient(connection);

      // validateClass may throw for non-400 errors, but returns response for 400
      let validationResponse: AxiosResponse | undefined;
      try {
        await builder.validateClass({
          className,
          packageName: package_name.toUpperCase(),
          description: description,
          superclass: superclass
        });
        validationResponse = builder.getValidationResponse();
      } catch (error: any) {
        // For 400 errors, ClassBuilder.validate() returns error.response instead of throwing
        // But if it still throws, try to get response from builder state
        if (error.response && error.response.status === 400) {
          validationResponse = error.response;
        } else {
          // For non-400 errors, re-throw to be handled below
          throw error;
        }
      }

      // If no response, try to get it from builder (should not happen, but safety check)
      if (!validationResponse) {
        validationResponse = builder.getValidationResponse();
      }

      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }

      // Parse validation response (works for both 200 and 400 responses)
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation


      handlerLogger.info(`✅ ValidateClass completed: ${className}`);
      handlerLogger.debug(`Result: valid=${result.valid}, message=${result.message || 'N/A'}`);

      // Always return structured response, even if validation failed
      // This allows tests to check validation_result.valid and skip if needed
      return return_response({
        data: JSON.stringify({
          success: result.valid,
          class_name: className,
          package_name: package_name || null,
          description: description || null,
          superclass: superclass || null,
          validation_result: result,
          session_id: session_id,
          session_state: null, // Session state management is now handled by auth-broker,
          message: result.valid
            ? `Class name ${className} is valid and available`
            : `Class name ${className} validation failed: ${result.message || 'Unknown error'}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      // For validation, 400 errors are expected (object exists or validation failed)
      // Only log as error if it's not a 400, or if debug is enabled
      const isValidationError = error.response?.status === 400;
      const debugEnabled = process.env.DEBUG_HANDLERS === 'true';

      if (!isValidationError || debugEnabled) {
        if (isValidationError) {
          handlerLogger.debug(`Validation returned 400 for class ${className} (expected behavior): ${error.message || String(error)}`);
        } else {
          handlerLogger.error(`Error validating class ${className}: ${error.message || String(error)}`);
        }
      }

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
