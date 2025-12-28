/**
 * ValidateDomain Handler - Validate ABAP Domain Name
 *
 * Uses AdtClient.validateDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseValidationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateDomainLow',
  description:
    '[low-level] Validate an ABAP domain name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name to validate (e.g., Z_MY_PROGRAM).',
      },
      description: {
        type: 'string',
        description: 'Domain description (required for validation).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (required for validation).',
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
    required: ['domain_name', 'package_name', 'description'],
  },
} as const;

interface ValidateDomainArgs {
  domain_name: string;
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
 * Main handler for ValidateDomain MCP tool
 *
 * Uses AdtClient.validateDomain - low-level single method call
 */
export async function handleValidateDomain(
  context: HandlerContext,
  args: ValidateDomainArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      domain_name,
      description,
      package_name,
      session_id,
      session_state,
    } = args as ValidateDomainArgs;

    // Validation
    if (!domain_name || !package_name || !description) {
      return return_error(
        new Error('domain_name, package_name, and description are required'),
      );
    }

    const client = new AdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    }

    const domainName = domain_name.toUpperCase();

    logger?.info(`Starting domain validation: ${domainName}`);

    try {
      // Validate domain using AdtClient
      const validationState = await client.getDomain().validate({
        domainName,
        description: description,
        packageName: package_name.toUpperCase(),
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
        `✅ ValidateDomain completed: ${domainName} (valid=${result.valid})`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: result.valid,
            domain_name: domainName,
            validation_result: result,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: result.valid
              ? `Domain name ${domainName} is valid and available`
              : `Domain name ${domainName} validation failed: ${result.message}`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error validating domain ${domainName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to validate domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
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
