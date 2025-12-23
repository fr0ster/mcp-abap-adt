/**
 * GetLocalTypes Handler - Read Local Types via AdtClient
 *
 * Uses AdtClient.getLocalTypes().read() for high-level read operation.
 * Local types are in the implementations include.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetLocalTypes',
  description:
    'Retrieve local types source code from a class (implementations include). Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['class_name'],
  },
} as const;

interface GetLocalTypesArgs {
  class_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetLocalTypes(
  context: HandlerContext,
  args: GetLocalTypesArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, version = 'active' } = args as GetLocalTypesArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Reading local types for ${className}, version: ${version}`);

    try {
      const localTypes = client.getLocalTypes();
      const readResult = await localTypes.read(
        { className },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Local types for ${className} not found`);
      }

      const sourceCode =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetLocalTypes completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            version,
            local_types_code: sourceCode,
            status: readResult.readResult.status,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading local types for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to read local types: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local types for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
