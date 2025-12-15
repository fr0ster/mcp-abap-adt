/**
 * CreateDomain Handler - Create ABAP Domain
 *
 * Uses CrudClient.createDomain from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, logErrorSafely, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateDomainLow",
  description: "[low-level] Create a new ABAP domain. - use CreateDomain (high-level) for full workflow with validation, lock, update, check, unlock, and activate.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: {
        type: "string",
        description: "Domain name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Domain description."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
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
    required: ["domain_name", "description", "package_name"]
  }
} as const;

interface CreateDomainArgs {
  domain_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateDomain MCP tool
 *
 * Uses CrudClient.createDomain - low-level single method call
 */
export async function handleCreateDomain(connection: AbapConnection, args: CreateDomainArgs) {
  try {
    const {
      domain_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state
    } = args as CreateDomainArgs;

    // Validation
    if (!domain_name || !description || !package_name) {
      return return_error(new Error('domain_name, description, and package_name are required'));
    }

        const client = new CrudClient(connection);
    const handlerLogger = getHandlerLogger(
      'handleCreateDomainLow',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
          }

    const domainName = domain_name.toUpperCase();

    handlerLogger.info(`Starting domain creation: ${domainName}`);

    try {
      // Create domain
      await client.createDomain({
        domainName,
        description,
        packageName: package_name,
        transportRequest: transport_request
      });
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for domain ${domainName}`);
      }

      // Get updated session state after create


      handlerLogger.info(`✅ CreateDomain completed: ${domainName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: domainName,
          description,
          package_name: package_name,
          transport_request: transport_request || null,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `Domain ${domainName} created successfully. Use LockDomain and UpdateDomain to add source code, then UnlockDomain and ActivateObject.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logErrorSafely(baseLogger, `CreateDomain ${domainName}`, error);

      // Parse error message
      let errorMessage = `Failed to create domain: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Domain ${domainName} already exists.`;
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
