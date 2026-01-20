/**
 * CreateLocalTestClass Handler - Create Local Test Class via AdtClient
 *
 * Uses AdtClient.getLocalTestClass().create() for high-level create operation.
 * Includes lock, check, update, unlock, and optional activation.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateLocalTestClass',
  description:
    'Create a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      test_class_code: {
        type: 'string',
        description: 'Source code for the local test class.',
      },
      test_class_name: {
        type: 'string',
        description: 'Optional test class name (e.g., lcl_test).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable objects).',
      },
      activate_on_create: {
        type: 'boolean',
        description:
          'Activate parent class after creating test class. Default: false',
        default: false,
      },
    },
    required: ['class_name', 'test_class_code'],
  },
} as const;

interface CreateLocalTestClassArgs {
  class_name: string;
  test_class_code: string;
  test_class_name?: string;
  transport_request?: string;
  activate_on_create?: boolean;
}

/**
 * Main handler for CreateLocalTestClass MCP tool
 *
 * Uses AdtClient.getLocalTestClass().create() - high-level create operation
 */
export async function handleCreateLocalTestClass(
  context: HandlerContext,
  args: CreateLocalTestClassArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      class_name,
      test_class_code,
      test_class_name,
      transport_request,
      activate_on_create = false,
    } = args as CreateLocalTestClassArgs;

    // Validation
    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }
    if (!test_class_code) {
      return return_error(new Error('test_class_code is required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Creating local test class for ${className}`);

    try {
      // Create local test class using AdtClient
      const localTestClass = client.getLocalTestClass();
      const createResult = await localTestClass.create(
        {
          className,
          testClassCode: test_class_code,
          testClassName: test_class_name,
          transportRequest: transport_request,
        },
        { activateOnCreate: activate_on_create },
      );

      if (!createResult) {
        throw new Error(
          `Create did not return a result for local test class in ${className}`,
        );
      }

      logger?.info(
        `✅ CreateLocalTestClass completed successfully: ${className}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            test_class_name: test_class_name || null,
            transport_request: transport_request || null,
            activated: activate_on_create,
            message: `Local test class created successfully in ${className}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating local test class for ${className}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to create local test class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Parent class ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Bad request. Check test class code syntax.`;
      }

      //return return_error(new Error(errorMessage));
      const resultingError = return_error(error);
      if (errorMessage) {
        resultingError.content.unshift({ type: 'text', text: errorMessage });
      }
      return resultingError;
    }
  } catch (error: any) {
    return return_error(error);
  }
}
