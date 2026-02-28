/**
 * CheckMetadataExtension Handler - Syntax check for ABAP MetadataExtension
 *
 * Uses AdtClient.checkMetadataExtension from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckMetadataExtensionLow',
  description:
    '[low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., ZI_MY_DDLX).',
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
    required: ['name'],
  },
} as const;

interface CheckMetadataExtensionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckMetadataExtension MCP tool
 *
 * Uses AdtClient.checkMetadataExtension - low-level single method call
 */
export async function handleCheckMetadataExtension(
  context: HandlerContext,
  args: CheckMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  try {
    const { name, session_id, session_state } =
      args as CheckMetadataExtensionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const client = createAdtClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlxName = name.toUpperCase();

    logger?.info(`Starting metadata extension check: ${ddlxName}`);

    try {
      // Check metadata extension
      const checkState = await client
        .getMetadataExtension()
        .check({ name: ddlxName });
      const response = checkState.checkResult;

      if (!response) {
        throw new Error(
          `Check did not return a response for metadata extension ${ddlxName}`,
        );
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response as AxiosResponse);

      // Get updated session state after check

      logger?.info(`✅ CheckMetadataExtension completed: ${ddlxName}`);
      logger?.debug(
        `Status: ${checkResult.status} | Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: checkResult.success,
            name: ddlxName,
            check_result: checkResult,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: checkResult.success
              ? `MetadataExtension ${ddlxName} has no syntax errors`
              : `MetadataExtension ${ddlxName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error checking metadata extension ${ddlxName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to check metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `MetadataExtension ${ddlxName} not found.`;
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
