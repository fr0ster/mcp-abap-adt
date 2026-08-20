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
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., ZI_MY_DDLX).',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active. Note: checking 'inactive' on an activated DDLX with no genuine inactive version errors with 'Error while reading the object ... from the database'.",
        enum: ['active', 'inactive'],
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
  version?: string;
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
    const { name, version, session_id, session_state } =
      args as CheckMetadataExtensionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    // Version to check. Default 'active': an activated DDLX has no genuine
    // inactive version, and the DDLX checkruns endpoint (unlike DDLS) does NOT
    // fall back to active for version='inactive' — it returns notProcessed
    // ("Error while reading the object ... from the database").
    const validVersions = ['active', 'inactive'];
    const checkVersion =
      version && validVersions.includes(version.toLowerCase())
        ? (version.toLowerCase() as 'active' | 'inactive')
        : 'active';

    const client = createAdtClient(connection, logger);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const ddlxName = name.toUpperCase();

    logger?.info(
      `Starting metadata extension check: ${ddlxName} (version: ${checkVersion})`,
    );

    try {
      // Check metadata extension. The second arg maps to chkrun:version inside
      // the adt-clients check() method (status === 'active' ? 'active' : 'inactive').
      const checkState = await client
        .getMetadataExtension()
        .check({ name: ddlxName }, checkVersion);
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
            version: checkVersion,
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
