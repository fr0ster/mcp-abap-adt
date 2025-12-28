/**
 * CreateClass Handler - Create ABAP Class
 *
 * Uses AdtClient.createClass from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateClassLow',
  description:
    '[low-level] Create a new ABAP class. - use CreateClass (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'Class description.',
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
      superclass: {
        type: 'string',
        description: 'Superclass name (optional).',
      },
      final: {
        type: 'boolean',
        description: 'Mark class as final (optional, default: false).',
      },
      abstract: {
        type: 'boolean',
        description: 'Mark class as abstract (optional, default: false).',
      },
      create_protected: {
        type: 'boolean',
        description: 'Create protected section (optional, default: false).',
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
    required: ['class_name', 'description', 'package_name'],
  },
} as const;

interface CreateClassArgs {
  class_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateClass MCP tool
 *
 * Uses AdtClient.createClass - low-level single method call
 */
export async function handleCreateClass(
  context: HandlerContext,
  args: CreateClassArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      description,
      package_name,
      transport_request,
      superclass,
      final,
      abstract,
      create_protected,
      session_id,
      session_state,
    } = args;

    // Validation
    if (!class_name || !description || !package_name) {
      return return_error(
        new Error('class_name, description, and package_name are required'),
      );
    }

    // Check if connection can refresh token (for debugging)
    const connectionWithRefresh = connection as any;
    if (
      process.env.DEBUG_HANDLERS === 'true' &&
      connectionWithRefresh.canRefreshToken
    ) {
      const canRefresh = connectionWithRefresh.canRefreshToken();
      logger?.debug(`Connection can refresh token: ${canRefresh}`);
    }

    const client = new AdtClient(connection);

    const className = class_name.toUpperCase();

    logger?.info(`Starting class creation: ${className}`);

    try {
      // Create class
      const createState = await client.getClass().create({
        className,
        description,
        packageName: package_name,
        transportRequest: transport_request,
        superclass,
        final,
        abstract,
        createProtected: create_protected,
      });
      const createResult = createState.createResult;

      if (!createResult) {
        throw new Error(
          `Create did not return a response for class ${className}`,
        );
      }

      // Get updated session state after create

      logger?.info(`✅ CreateClass completed: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            description,
            package_name: package_name,
            transport_request: transport_request || null,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Class ${className} created successfully. Use LockObject and UpdateClass to add source code, then UnlockObject and ActivateObject.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating class ${className}: ${error.message || String(error)}`,
      );

      // Parse error message
      let errorMessage = `Failed to create class: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Class ${className} already exists.`;
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
