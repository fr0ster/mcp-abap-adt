/**
 * ValidateMetadataExtension Handler - Validate ABAP MetadataExtension Name
 *
 * Uses CrudClient.validateMetadataExtension from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, parseValidationResponse, restoreSessionInConnection } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ValidateMetadataExtensionLow",
  description: "[low-level] Validate an ABAP metadata extension name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      objName: {
        type: "string",
        description: "MetadataExtension name to validate (e.g., Z_MY_PROGRAM)."
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
    required: ["name", "description", "package_name"]
  }
} as const;

interface ValidateMetadataExtensionArgs {
  name: string;
  description: string;
  package_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidateMetadataExtension MCP tool
 *
 * Uses CrudClient.validateMetadataExtension - low-level single method call
 */
export async function handleValidateMetadataExtension(connection: AbapConnection, args: ValidateMetadataExtensionArgs) {
  try {
    const {
      name,
      description,
      package_name,
      session_id,
      session_state
    } = args as ValidateMetadataExtensionArgs;

    // Validation
    if (!name || !description || !package_name) {
      return return_error(new Error('name, description, and package_name are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleValidateMetadataExtension',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const ddlxName = name.toUpperCase();

    handlerLogger.info(`Starting metadata extension validation: ${ddlxName}`);

    try {
      // Validate metadata extension
      await client.validateMetadataExtension({
        name: ddlxName,
        description: description || '',
        packageName: package_name || ''
      });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation


      handlerLogger.info(`✅ ValidateMetadataExtension completed: ${ddlxName} (valid=${result.valid})`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          name: ddlxName,
          validation_result: result,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: result.valid
            ? `MetadataExtension ${ddlxName} is valid and available`
            : `MetadataExtension ${ddlxName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error validating metadata extension ${ddlxName}:`, error);

      // Parse error message
      let errorMessage = `Failed to validate metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `MetadataExtension ${ddlxName} not found.`;
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
