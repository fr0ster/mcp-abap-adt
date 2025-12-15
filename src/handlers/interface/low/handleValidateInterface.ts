/**
 * ValidateInterface Handler - Validate ABAP Interface Name
 *
 * Uses CrudClient.validateInterface from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, parseValidationResponse, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ValidateInterfaceLow",
  description: "[low-level] Validate an ABAP interface name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: {
        type: "string",
        description: "Interface name to validate (e.g., Z_MY_PROGRAM)."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation."
      },
      description: {
        type: "string",
        description: "Interface description. Required for validation."
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
    required: ["interface_name", "package_name", "description"]
  }
} as const;

interface ValidateInterfaceArgs {
  interface_name: string;
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
 * Main handler for ValidateInterface MCP tool
 *
 * Uses CrudClient.validateInterface - low-level single method call
 */
export async function handleValidateInterface(connection: AbapConnection, args: ValidateInterfaceArgs) {
  try {
    const {
      interface_name,
      package_name,
      description,
      session_id,
      session_state
    } = args as ValidateInterfaceArgs;

    // Validation
    if (!interface_name || !package_name || !description) {
      return return_error(new Error('interface_name, package_name, and description are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleValidateInterface',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const interfaceName = interface_name.toUpperCase();

    handlerLogger.info(`Starting interface validation: ${interfaceName}`);

    try {
      // Validate interface
      await client.validateInterface({
        interfaceName: interfaceName,
        packageName: package_name.toUpperCase(),
        description: description
      });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation


      handlerLogger.info(`✅ ValidateInterface completed: ${interfaceName} (valid=${result.valid})`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          interface_name: interfaceName,
          validation_result: result,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: result.valid
            ? `Interface name ${interfaceName} is valid and available`
            : `Interface name ${interfaceName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error validating interface ${interfaceName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to validate interface: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Interface ${interfaceName} not found.`;
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
