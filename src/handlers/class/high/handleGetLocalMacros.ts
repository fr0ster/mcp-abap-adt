/**
 * GetLocalMacros Handler - Read Local Macros via AdtClient
 *
 * Uses AdtClient.getLocalMacros().read() for high-level read operation.
 * Note: Macros are supported in older ABAP versions but not in newer ones.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetLocalMacros',
  description:
    'Retrieve local macros source code from a class (macros include). Supports reading active or inactive version. Note: Macros are supported in older ABAP versions but not in newer ones.',
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

interface GetLocalMacrosArgs {
  class_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetLocalMacros(
  context: HandlerContext,
  args: GetLocalMacrosArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, version = 'active' } = args as GetLocalMacrosArgs;

    if (!class_name) {
      return return_error(new Error('class_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const className = class_name.toUpperCase();

    logger?.info(`Reading local macros for ${className}, version: ${version}`);

    try {
      const localMacros = client.getLocalMacros();
      const readResult = await localMacros.read(
        { className },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Local macros for ${className} not found`);
      }

      const sourceCode =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetLocalMacros completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            version,
            macros_code: sourceCode,
            status: readResult.readResult.status,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading local macros for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to read local macros: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local macros for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
