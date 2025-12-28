/**
 * CreateFunctionGroup Handler - Create ABAP Function Group
 *
 * Uses AdtClient.createFunctionGroup from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionGroupLow',
  description:
    '[low-level] Create a new ABAP function group. - use CreateFunctionGroup (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name (e.g., ZFG_MY_GROUP). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'Function group description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
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
    required: ['function_group_name', 'description', 'package_name'],
  },
} as const;

interface CreateFunctionGroupArgs {
  function_group_name: string;
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
 * Main handler for CreateFunctionGroup MCP tool
 *
 * Uses AdtClient.createFunctionGroup - low-level single method call
 */
export async function handleCreateFunctionGroup(
  context: HandlerContext,
  args: CreateFunctionGroupArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      function_group_name,
      description,
      package_name,
      transport_request,
      session_id,
      session_state,
    } = args as CreateFunctionGroupArgs;

    // Validation
    if (!function_group_name || !description || !package_name) {
      return return_error(
        new Error(
          'function_group_name, description, and package_name are required',
        ),
      );
    }

    const client = new AdtClient(connection);
    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const functionGroupName = function_group_name.toUpperCase();

    logger?.info(`Starting function group creation: ${functionGroupName}`);

    try {
      // Create function group
      const createState = await client.getFunctionGroup().create({
        functionGroupName,
        description,
        packageName: package_name,
        transportRequest: transport_request,
      });
      const createResult = createState.createResult;

      if (!createResult) {
        throw new Error(
          `Create did not return a response for function group ${functionGroupName}`,
        );
      }

      // Get updated session state after create

      logger?.info(`✅ CreateFunctionGroup completed: ${functionGroupName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            function_group_name: functionGroupName,
            description,
            package_name: package_name,
            transport_request: transport_request || null,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Function group ${functionGroupName} created successfully. Use LockFunctionGroup and UpdateFunctionGroup to add source code, then UnlockFunctionGroup and ActivateObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating function group ${functionGroupName}: ${error?.message || error}`,
      );

      const responseData =
        typeof error.response?.data === 'string'
          ? error.response.data
          : error.response?.data
            ? JSON.stringify(error.response.data)
            : '';
      const responseSnippet = responseData
        ? responseData.slice(0, 1000)
        : undefined;
      if (responseSnippet) {
        logger?.warn(
          `CreateFunctionGroup returned HTTP ${error.response?.status} for ${functionGroupName}. Response: ${responseSnippet}`,
        );
      }

      if (
        error.response?.status === 400 &&
        typeof error.response?.data === 'string' &&
        error.response.data.includes('Interface SAPL') &&
        error.response.data.includes('has not been created')
      ) {
        logger?.warn(
          `CreateFunctionGroup got interface warning for ${functionGroupName}, attempting read to verify object`,
        );
        try {
          const readState = await client
            .getFunctionGroup()
            .read({ functionGroupName }, 'inactive', { withLongPolling: true });
          if (readState?.readResult) {
            logger?.warn(
              `CreateFunctionGroup returned interface error, but ${functionGroupName} is readable; continuing as success`,
            );
            return return_response({
              data: JSON.stringify(
                {
                  success: true,
                  function_group_name: functionGroupName,
                  description,
                  package_name: package_name,
                  transport_request: transport_request || null,
                  session_id: session_id || null,
                  session_state: null,
                  warning:
                    'Interface SAPL* not created during create (400). Object verified by read.',
                  message: `Function group ${functionGroupName} created successfully (interface warning ignored).`,
                },
                null,
                2,
              ),
            } as AxiosResponse);
          }
        } catch (_readError) {
          // Fall through to standard error handling below.
        }
      }

      // Parse error message
      let errorMessage = `Failed to create function group: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Function group ${functionGroupName} already exists.`;
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
      } else if (responseSnippet) {
        errorMessage = `Failed to create function group (HTTP ${error.response?.status}): ${responseSnippet}`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
