/**
 * ValidateProgram Handler - Validate ABAP Program Name
 *
 * Uses AdtClient.validateProgram from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  isCloudConnection,
  parseValidationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateProgramLow',
  description:
    '[low-level] Validate an ABAP program name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name to validate (e.g., Z_MY_PROGRAM).',
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.',
      },
      description: {
        type: 'string',
        description: 'Program description. Required for validation.',
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
    required: ['program_name', 'package_name', 'description'],
  },
} as const;

interface ValidateProgramArgs {
  program_name: string;
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
 * Main handler for ValidateProgram MCP tool
 *
 * Uses AdtClient.validateProgram - low-level single method call
 */
export async function handleValidateProgram(
  context: HandlerContext,
  args: ValidateProgramArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      program_name,
      package_name,
      description,
      session_id,
      session_state,
    } = args as ValidateProgramArgs;

    // Validation
    if (!program_name || !package_name || !description) {
      return return_error(
        new Error('program_name, package_name, and description are required'),
      );
    }

    // Check if cloud - programs are not available on cloud systems
    if (isCloudConnection()) {
      return return_error(
        new Error(
          'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
        ),
      );
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    const programName = program_name.toUpperCase();

    logger?.info(`Starting program validation: ${programName}`);

    try {
      // Validate program
      const validationState = await client.getProgram().validate({
        programName: programName,
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

      logger?.info(
        `✅ ValidateProgram completed: ${programName} (valid=${result.valid})`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: result.valid,
            program_name: programName,
            validation_result: result,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: result.valid
              ? `Program name ${programName} is valid and available`
              : `Program name ${programName} validation failed: ${result.message}`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error validating program ${programName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to validate program: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Program ${programName} not found.`;
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
