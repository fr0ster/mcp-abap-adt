/**
 * ActivateDomain Handler - Activate ABAP Domain
 *
 * Uses CrudClient.activateDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "ActivateDomainLow",
  description: "[low-level] Activate an ABAP domain. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., ZDM_MY_DOMAIN)."
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

interface ActivateDomainArgs {
  domain_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for ActivateDomain MCP tool
 *
 * Uses CrudClient.activateDomain - low-level single method call
 */
export async function handleActivateDomain(args: ActivateDomainArgs) {
  try {
    const {
      domain_name,
      session_id,
      session_state
    } = args as ActivateDomainArgs;

    // Validation
    if (!domain_name) {
      return return_error(new Error('domain_name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleActivateDomain',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

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

    const domainName = domain_name.toUpperCase();

    handlerLogger.info(`Starting domain activation: ${domainName}`);

    try {
      // Activate domain
      await client.activateDomain({ domainName: domainName });
      const response = client.getActivateResult();

      if (!response) {
        throw new Error(`Activation did not return a response for domain ${domainName}`);
      }

      // Parse activation response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Get updated session state after activation
      const updatedSessionState = connection.getSessionState();

      handlerLogger.info(`✅ ActivateDomain completed: ${domainName}`);
      handlerLogger.debug(`Activated: ${activationResult.activated}, Checked: ${activationResult.checked}, Messages: ${activationResult.messages.length}`);

      return return_response({
        data: JSON.stringify({
          success,
          domain_name: domainName,
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
            ? `Domain ${domainName} activated successfully`
            : `Domain ${domainName} activation completed with ${activationResult.messages.length} message(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error activating domain ${domainName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to activate domain: ${error.message || String(error)}`;

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
