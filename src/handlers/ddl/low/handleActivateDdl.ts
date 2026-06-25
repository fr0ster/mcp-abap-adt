/**
 * ActivateDdlLow Handler - Activate ABAP DDL Source (CDS View)
 *
 * Uses AdtClient.activateView from @mcp-abap-adt/adt-clients.
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
  name: 'ActivateDdlLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: DDL source. Will be useful for activating, creating, or updating a DDL source. [low-level] Activate an ABAP DDL source (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., ZVW_MY_VIEW).',
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
    required: ['ddl_name'],
  },
} as const;

interface ActivateDdlArgs {
  ddl_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateDdl MCP tool
 *
 * Uses AdtClient.activateView - low-level single method call
 */
export async function handleActivateDdl(
  context: HandlerContext,
  args: ActivateDdlArgs,
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, session_id, session_state } = args as ActivateDdlArgs;

    // Validation
    if (!ddl_name) {
      return return_error(new Error('ddl_name is required'));
    }

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlName = ddl_name.toUpperCase();

    logger?.info(`Starting view activation: ${ddlName}`);

    try {
      // Activate view
      const activateState = await client
        .getDdl()
        .activate({ ddlName: ddlName });
      const response = activateState.activateResult;

      if (!response) {
        throw new Error(
          `Activation did not return a response for view ${ddlName}`,
        );
      }

      // Parse activation response
      const activationResult = parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation

      logger?.info(`✅ ActivateDdlLow completed: ${ddlName}`);
      logger?.info(
        `   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`,
      );
      logger?.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify(
          {
            success,
            ddl_name: ddlName,
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
              ? `View ${ddlName} activated successfully`
              : `View ${ddlName} activation completed with ${activationResult.messages.length} message(s)`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error activating view ${ddlName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to activate view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${ddlName} not found.`;
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
