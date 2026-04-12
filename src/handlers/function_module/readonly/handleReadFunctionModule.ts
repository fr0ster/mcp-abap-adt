import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadFunctionModule',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Read ABAP function module source code and metadata. Answers: "show function module code", "display FM source", "view function X", "get function module implementation". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FM).',
      },
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the function module (e.g., Z_MY_FG).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['function_module_name', 'function_group_name'],
  },
} as const;

export async function handleReadFunctionModule(
  context: HandlerContext,
  args: {
    function_module_name: string;
    function_group_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  try {
    const {
      function_module_name,
      function_group_name,
      version = 'active',
    } = args;
    if (!function_module_name || !function_group_name)
      return return_error(
        new Error('function_module_name and function_group_name are required'),
      );

    const client = createAdtClient(connection, logger);
    const functionModuleName = function_module_name.toUpperCase();
    const functionGroupName = function_group_name.toUpperCase();
    const obj = client.getFunctionModule();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { functionModuleName, functionGroupName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read source for ${functionModuleName}: ${e?.message}`,
      );
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({
        functionModuleName,
        functionGroupName,
      });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read metadata for ${functionModuleName}: ${e?.message}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          version,
          source_code,
          metadata,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
