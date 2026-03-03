/**
 * CreateBehaviorImplementation Handler - ABAP Behavior Implementation Creation via ADT API
 *
 * Uses AdtClient from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by client.
 *
 * Workflow: create -> lock -> update main source -> update implementations -> unlock -> activate
 */

import type { IBehaviorImplementationConfig } from '@mcp-abap-adt/adt-clients';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  encodeSapObjectName,
  return_error,
  return_response,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateBehaviorImplementation',
  description:
    'Create a new ABAP behavior implementation class for a behavior definition. Creates the object in initial state. Use UpdateBehaviorImplementation to set implementation code afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations).',
      },
      behavior_definition: {
        type: 'string',
        description:
          'Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist.',
      },
      description: {
        type: 'string',
        description:
          'Class description. If not provided, class_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
    },
    required: ['class_name', 'behavior_definition', 'package_name'],
  },
} as const;

interface CreateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  description?: string;
  package_name: string;
  transport_request?: string;
}

/**
 * Main handler for CreateBehaviorImplementation MCP tool
 *
 * Uses AdtClient.createBehaviorImplementation - full workflow
 */
export async function handleCreateBehaviorImplementation(
  context: HandlerContext,
  args: CreateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.class_name) {
      return return_error(new Error('class_name is required'));
    }
    if (!args?.behavior_definition) {
      return return_error(new Error('behavior_definition is required'));
    }
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const className = args.class_name.toUpperCase();
    const behaviorDefinition = args.behavior_definition.toUpperCase();

    logger?.info(
      `Starting behavior implementation creation: ${className} for ${behaviorDefinition}`,
    );

    try {
      // Create client
      const client = createAdtClient(connection);
      // Create behavior implementation (full workflow)
      const createConfig: Partial<IBehaviorImplementationConfig> &
        Pick<
          IBehaviorImplementationConfig,
          'className' | 'packageName' | 'behaviorDefinition'
        > = {
        className: className,
        behaviorDefinition: behaviorDefinition,
        description: args.description || className,
        packageName: args.package_name.toUpperCase(),
        transportRequest: args.transport_request,
      };

      const createState = await client
        .getBehaviorImplementation()
        .create(createConfig);
      const createResult = createState.createResult;

      if (!createResult) {
        throw new Error(
          `Create did not return a response for behavior implementation ${className}`,
        );
      }

      logger?.info(
        `CreateBehaviorImplementation completed successfully: ${className}`,
      );

      const result = {
        success: true,
        class_name: className,
        behavior_definition: behaviorDefinition,
        package_name: args.package_name.toUpperCase(),
        transport_request: args.transport_request || null,
        type: 'CLAS/OC',
        message: `Behavior Implementation ${className} created successfully. Use UpdateBehaviorImplementation to set implementation code.`,
        uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
        steps_completed: ['create'],
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
    } catch (error: any) {
      logger?.error(
        `Error creating behavior implementation ${className}: ${error?.message || error}`,
      );

      // Check if behavior implementation already exists
      if (
        error.message?.includes('already exists') ||
        error.response?.status === 409
      ) {
        return return_error(
          new Error(
            `Behavior Implementation ${className} already exists. Please delete it first or use a different name.`,
          ),
        );
      }

      // Parse error message
      let errorMessage = `Failed to create behavior implementation: ${error.message || String(error)}`;

      if (error.response?.data && typeof error.response.data === 'string') {
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
    logger?.error(
      `CreateBehaviorImplementation handler error: ${error?.message || error}`,
    );
    return return_error(error);
  }
}
