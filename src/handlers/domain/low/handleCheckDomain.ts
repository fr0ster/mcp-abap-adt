/**
 * CheckDomain Handler - Syntax check for ABAP Domain
 *
 * Uses CrudClient.checkDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CheckDomainLow",
  description: "[low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., Z_MY_PROGRAM)."
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
    required: ["domain_name"]
  }
} as const;

interface CheckDomainArgs {
  domain_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CheckDomain MCP tool
 *
 * Uses CrudClient.checkDomain - low-level single method call
 */
export async function handleCheckDomain(connection: AbapConnection, args: CheckDomainArgs) {
  try {
    const {
      domain_name,
      session_id,
      session_state
    } = args as CheckDomainArgs;

    // Validation
    if (!domain_name) {
      return return_error(new Error('domain_name is required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleCheckDomain',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const domainName = domain_name.toUpperCase();

    handlerLogger.info(`Starting domain check: ${domainName}`);

    try {
      // Check domain
      await client.checkDomain({ domainName: domainName });
      const response = client.getCheckResult();

      if (!response) {
        throw new Error(`Check did not return a response for domain ${domainName}`);
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check


      handlerLogger.info(`✅ CheckDomain completed: ${domainName}`);
      handlerLogger.debug(`Status: ${checkResult.status} | Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          domain_name: domainName,
          check_result: checkResult,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: checkResult.success
            ? `Domain ${domainName} has no syntax errors`
            : `Domain ${domainName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error checking domain ${domainName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to check domain: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Domain ${domainName} not found.`;
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
