/**
 * ValidatePackage Handler - Validate ABAP Package Name
 *
 * Uses CrudClient.validatePackage from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, parseValidationResponse, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ValidatePackageLow",
  description: "[low-level] Validate an ABAP package name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name to validate (e.g., Z_MY_PROGRAM)."
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
    required: ["package_name", "super_package"]
  }
} as const;

interface ValidatePackageArgs {
  package_name: string;
  super_package: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ValidatePackage MCP tool
 *
 * Uses CrudClient.validatePackage - low-level single method call
 */
export async function handleValidatePackage(connection: AbapConnection, args: ValidatePackageArgs) {
  try {
    const {
      package_name,
      super_package,
      session_id,
      session_state
    } = args as ValidatePackageArgs;

    // Validation
    if (!package_name || !super_package) {
      return return_error(new Error('package_name and super_package are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleValidatePackage',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const packageName = package_name.toUpperCase();
    const superPackage = super_package.toUpperCase();

    handlerLogger.info(`Starting package validation: ${packageName} in ${superPackage}`);

    try {
      // Validate package
      await client.validatePackage({ packageName: packageName, superPackage: superPackage, description: undefined });
      const validationResponse = client.getValidationResponse();
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(validationResponse);

      // Get updated session state after validation


      handlerLogger.info(`✅ ValidatePackage completed: ${packageName} (valid=${result.valid})`);

      return return_response({
        data: JSON.stringify({
          success: result.valid,
          package_name: packageName,
          super_package: superPackage,
          validation_result: result,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: result.valid
            ? `Package name ${packageName} is valid and available`
            : `Package name ${packageName} validation failed: ${result.message}`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error validating package ${packageName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to validate package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found.`;
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
