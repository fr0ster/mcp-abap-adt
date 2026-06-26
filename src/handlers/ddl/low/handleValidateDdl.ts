/**
 * ValidateDdlLow Handler - Validate ABAP DDL Source Name
 *
 * Uses AdtClient.getDdl().validate from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseValidationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Validate an ABAP DDL source name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name to validate (e.g., Z_MY_PROGRAM).',
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.',
      },
      description: {
        type: 'string',
        description: 'DDL source description. Required for validation.',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['ddl_name', 'package_name', 'description'],
  },
} as const;

interface ValidateDdlArgs {
  ddl_name: string;
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
 * Main handler for ValidateDdl MCP tool
 *
 * Uses AdtClient.getDdl().validate - low-level single method call
 */
export async function handleValidateDdl(
  context: HandlerContext,
  args: ValidateDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, description, package_name, session_id, session_state } =
      args as ValidateDdlArgs;

    // Validation
    if (!ddl_name || !package_name || !description) {
      return return_error(
        new Error('ddl_name, package_name, and description are required'),
      );
    }

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Starting DDL source validation: ${ddlName}`);

    try {
      // Validate DDL source
      const validationState = await client.getDdl().validate({
        ddlName: ddlName,
        packageName: package_name.toUpperCase(),
        description: description,
      });
      const validationResponse = validationState.validationResponse;
      if (!validationResponse) {
        throw new Error('Validation did not return a result');
      }
      const result = parseValidationResponse(
        validationResponse as AxiosResponse,
      );

      // Get updated session state after validation

      logger?.info(`✅ ValidateDdlLow completed: ${ddlName}`);
      logger?.info(`   Valid: ${result.valid}, Message: ${result.message}`);

      return return_response({
        data: JSON.stringify(
          {
            success: result.valid,
            ddl_name: ddlName,
            validation_result: result,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: result.valid
              ? `DDL source ${ddlName} is valid and available`
              : `DDL source ${ddlName} validation failed: ${result.message}`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error validating DDL source ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to validate DDL source: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `DDL source ${ddlName} not found.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
