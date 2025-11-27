/**
 * ValidateStructure Handler - Validate ABAP Structure Name
 *
 * Uses CrudClient.validateStructure from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, parseValidationResponse } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "ValidateStructureLow",
  description: "[low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name to validate (e.g., Z_MY_PROGRAM)."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation."
      },
      description: {
        type: "string",
        description: "Structure description. Required for validation."
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
    required: ["structure_name", "package_name", "description"]
  }
} as const;

interface ValidateStructureArgs {
  structure_name: string;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateStructure MCP tool
 *
 * Uses CrudClient.validateStructure - low-level single method call
 */
export async function handleValidateStructure(args: ValidateStructureArgs) {
  try {
    const {
      structure_name,
      package_name,
      description,
      session_id,
      session_state
    } = args as ValidateStructureArgs;

    // Validation
    if (!structure_name || !package_name || !description) {
      return return_error(new Error('structure_name, package_name, and description are required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

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

    const structureName = structure_name.toUpperCase();

    logger.info(`Starting structure validation: ${structureName}`);

    try {
      // Validate structure
      await client.validateStructure({
        structureName: structureName,
        packageName: package_name.toUpperCase(),
        description: description
      });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ ValidateStructure completed: ${structureName}`);
      logger.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          structure_name: structureName,
          validation_result: result,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: result.valid
            ? `Structure name ${structureName} is valid and available`
            : `Structure name ${structureName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error validating structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to validate structure: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Structure ${structureName} not found.`;
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

