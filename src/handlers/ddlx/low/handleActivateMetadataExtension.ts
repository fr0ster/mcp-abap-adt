/**
 * ActivateMetadataExtension Handler - Activate ABAP Metadata Extension
 *
 * Uses CrudClient.activateMetadataExtension from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "ActivateMetadataExtensionLow",
  description: "[low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Metadata extension name (e.g., ZC_MY_EXTENSION)."
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
    required: ["name"]
  }
} as const;

interface ActivateMetadataExtensionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateMetadataExtension MCP tool
 *
 * Uses CrudClient.activateMetadataExtension - low-level single method call
 */
export async function handleActivateMetadataExtension(args: ActivateMetadataExtensionArgs) {
  try {
    const {
      name,
      session_id,
      session_state
    } = args as ActivateMetadataExtensionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
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

    const metadataExtensionName = name.toUpperCase();

    logger.info(`Starting metadata extension activation: ${metadataExtensionName}`);

    try {
      // Activate metadata extension
      await client.activateMetadataExtension({ name: metadataExtensionName });
      const response = client.getActivateResult();

      if (!response) {
        throw new Error(`Activation did not return a response for metadata extension ${metadataExtensionName}`);
      }

      // Parse activation response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ ActivateMetadataExtension completed: ${metadataExtensionName}`);
      logger.info(`   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`);
      logger.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify({
          success,
          name: metadataExtensionName,
          activation: {
            activated: activationResult.activated,
            checked: activationResult.checked,
            generated: activationResult.generated
          },
          messages: activationResult.messages,
          warnings: activationResult.messages.filter(m => m.type === 'warning' || m.type === 'W'),
          errors: activationResult.messages.filter(m => m.type === 'error' || m.type === 'E'),
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: success
            ? `Metadata extension ${metadataExtensionName} activated successfully`
            : `Metadata extension ${metadataExtensionName} activation completed with ${activationResult.messages.length} message(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error activating metadata extension ${metadataExtensionName}:`, error);

      // Parse error message
      let errorMessage = `Failed to activate metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Metadata extension ${metadataExtensionName} not found.`;
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

