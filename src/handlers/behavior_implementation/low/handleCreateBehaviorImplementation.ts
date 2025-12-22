/**
 * CreateBehaviorImplementation Handler - Create ABAP Behavior Implementation Class
 *
 * Uses CrudClient.createBehaviorImplementation from @mcp-abap-adt/adt-clients.
 * Low-level handler: full workflow (create, lock, update main source, update implementations, unlock, activate).
 */

import type { BehaviorImplementationBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateBehaviorImplementationLow',
  description:
    '[low-level] Create a new ABAP behavior implementation class with full workflow (create, lock, update main source, update implementations, unlock, activate). - use CreateBehaviorImplementation (high-level) for additional validation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions.',
      },
      behavior_definition: {
        type: 'string',
        description: 'Behavior Definition name (e.g., ZI_MY_ENTITY). Required.',
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
      implementation_code: {
        type: 'string',
        description:
          'Implementation code for the implementations include (optional).',
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
    required: [
      'class_name',
      'behavior_definition',
      'description',
      'package_name',
    ],
  },
} as const;

interface CreateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  description: string;
  package_name: string;
  transport_request?: string;
  implementation_code?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for CreateBehaviorImplementation MCP tool
 *
 * Uses CrudClient.createBehaviorImplementation - full workflow
 */
export async function handleCreateBehaviorImplementation(
  context: HandlerContext,
  args: CreateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      behavior_definition,
      description,
      package_name,
      transport_request,
      implementation_code,
      session_id,
      session_state,
    } = args as CreateBehaviorImplementationArgs;

    // Validation
    if (!class_name || !behavior_definition || !description || !package_name) {
      return return_error(
        new Error(
          'class_name, behavior_definition, description, and package_name are required',
        ),
      );
    }

    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
      // Ensure connection is established
    }

    const className = class_name.toUpperCase();
    const behaviorDefinition = behavior_definition.toUpperCase();

    logger?.info(
      `Starting behavior implementation creation: ${className} for ${behaviorDefinition}`,
    );

    try {
      // Create behavior implementation (full workflow)
      const createConfig: Partial<BehaviorImplementationBuilderConfig> &
        Pick<
          BehaviorImplementationBuilderConfig,
          'className' | 'packageName' | 'behaviorDefinition'
        > = {
        className: className,
        behaviorDefinition: behaviorDefinition,
        description: description,
        packageName: package_name.toUpperCase(),
        transportRequest: transport_request,
        ...(implementation_code && { sourceCode: implementation_code }),
      };

      await client.createBehaviorImplementation(createConfig);
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(
          `Create did not return a response for behavior implementation ${className}`,
        );
      }

      // Get updated session state after create

      logger?.info(`✅ CreateBehaviorImplementation completed: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            behavior_definition: behaviorDefinition,
            description,
            package_name: package_name.toUpperCase(),
            transport_request: transport_request || null,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Behavior Implementation ${className} created and activated successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating behavior implementation ${className}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to create behavior implementation: ${error.message || String(error)}`;

      if (error.response?.status === 409) {
        errorMessage = `Behavior Implementation ${className} already exists.`;
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
