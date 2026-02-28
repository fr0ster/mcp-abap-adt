/**
 * ActivateDataElement Handler - Activate ABAP Data Element
 *
 * Uses AdtClient.activateDataElement from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  parseActivationResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateDataElementLow',
  description:
    '[low-level] Activate an ABAP data element. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., ZDT_MY_ELEMENT).',
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
    required: ['data_element_name'],
  },
} as const;

interface ActivateDataElementArgs {
  data_element_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateDataElement MCP tool
 *
 * Uses AdtClient.activateDataElement - low-level single method call
 */
export async function handleActivateDataElement(
  context: HandlerContext,
  args: ActivateDataElementArgs,
) {
  const { connection, logger } = context;
  try {
    const { data_element_name, session_id, session_state } =
      args as ActivateDataElementArgs;

    // Validation
    if (!data_element_name) {
      return return_error(new Error('data_element_name is required'));
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const dataElementName = data_element_name.toUpperCase();

    logger?.info(`Starting data element activation: ${dataElementName}`);

    try {
      // Activate data element
      const activateState = await client
        .getDataElement()
        .activate({ dataElementName: dataElementName });
      const response = activateState.activateResult;

      if (!response) {
        logger?.error(
          `Activation did not return a response for data element ${dataElementName}`,
        );
        throw new Error(
          `Activation did not return a response for data element ${dataElementName}`,
        );
      }

      // Parse activation response
      const activationResult = parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation

      logger?.info(`✅ ActivateDataElement completed: ${dataElementName}`);

      return return_response({
        data: JSON.stringify(
          {
            success,
            data_element_name: dataElementName,
            activation: {
              activated: activationResult.activated,
              checked: activationResult.checked,
              generated: activationResult.generated,
            },
            messages: activationResult.messages,
            warnings: activationResult.messages.filter(
              (m) => m.type === 'warning' || m.type === 'W',
            ),
            errors: activationResult.messages.filter(
              (m) => m.type === 'error' || m.type === 'E',
            ),
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: success
              ? `Data element ${dataElementName} activated successfully`
              : `Data element ${dataElementName} activation completed with ${activationResult.messages.length} message(s)`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error activating data element ${dataElementName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to activate data element: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Data element ${dataElementName} not found.`;
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
