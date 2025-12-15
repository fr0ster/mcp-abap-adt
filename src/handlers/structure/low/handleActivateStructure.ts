/**
 * ActivateStructure Handler - Activate ABAP Structure
 *
 * Uses CrudClient.activateStructure from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "ActivateStructureLow",
  description: "[low-level] Activate an ABAP structure. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      structure_name: {
        type: "string",
        description: "Structure name (e.g., ZST_MY_STRUCTURE)."
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
    required: ["structure_name"]
  }
} as const;

interface ActivateStructureArgs {
  structure_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateStructure MCP tool
 *
 * Uses CrudClient.activateStructure - low-level single method call
 */
export async function handleActivateStructure(context: HandlerContext, args: ActivateStructureArgs) {
  const { connection, logger } = context;
  try {
    const {
      structure_name,
      session_id,
      session_state
    } = args as ActivateStructureArgs;

    // Validation
    if (!structure_name) {
      return return_error(new Error('structure_name is required'));
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const structureName = structure_name.toUpperCase();

    logger.info(`Starting structure activation: ${structureName}`);

    try {
      // Activate structure
      await client.activateStructure({ structureName: structureName });
      const response = client.getActivateResult();

      if (!response) {
        throw new Error(`Activation did not return a response for structure ${structureName}`);
      }

      // Parse activation response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation


      logger.info(`✅ ActivateStructure completed: ${structureName}`);
      logger.info(`   Activated: ${activationResult.activated}, Checked: ${activationResult.checked}`);
      logger.info(`   Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify({
          success,
          structure_name: structureName,
          activation: {
            activated: activationResult.activated,
            checked: activationResult.checked,
            generated: activationResult.generated
          },
          messages: activationResult.messages,
          warnings: activationResult.messages.filter(m => m.type === 'warning' || m.type === 'W'),
          errors: activationResult.messages.filter(m => m.type === 'error' || m.type === 'E'),
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: success
            ? `Structure ${structureName} activated successfully`
            : `Structure ${structureName} activation completed with ${activationResult.messages.length} message(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error activating structure ${structureName}:`, error);

      // Parse error message
      let errorMessage = `Failed to activate structure: ${error.message || String(error)}`;

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
