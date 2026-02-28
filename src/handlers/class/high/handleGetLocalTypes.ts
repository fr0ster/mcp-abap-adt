/**
 * GetLocalTypes Handler - Read Local Types via AdtClient
 *
 * Uses AdtClient.getLocalTypes().read() for high-level read operation.
 * Local types are in the implementations include.
 */

import { createAdtClient } from '../../../lib/clients';
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

    const client = createAdtClient(connection, logger);
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
      const status = error?.response?.status;
      const url = error?.response?.config?.url;
      const rawData = error?.response?.data;
      const responseSnippet =
        typeof rawData === 'string' ? rawData.slice(0, 800) : rawData;
      logger?.warn(
        `GetLocalTypes failed (HTTP ${status ?? 'unknown'}) for ${className}${url ? ` at ${url}` : ''}`,
        responseSnippet ? { response: responseSnippet } : undefined,
      );
      logger?.error(
        `Error reading local types for ${className}: ${error?.message || error}`,
      );

      let errorMessage = `Failed to read local types: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Local types for ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user.`;
      } else if (error.response?.status === 406) {
        const status = error?.response?.status;
        const url = error?.response?.config?.url;
        const rawData = error?.response?.data;
        const responseSnippet =
          typeof rawData === 'string' ? rawData.slice(0, 800) : rawData;
        errorMessage = `Local types read not supported on this system (HTTP ${status}). ${url ? `URL: ${url}. ` : ''}${responseSnippet ? `Response: ${typeof responseSnippet === 'string' ? responseSnippet : JSON.stringify(responseSnippet)}` : ''}`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
