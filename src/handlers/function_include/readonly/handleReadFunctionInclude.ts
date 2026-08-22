import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Read ABAP function group include source code and metadata. Answers: "show function group include code", "display include source", "view include of function group". Returns source code and include metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., Z_MY_FG).',
      },
      include_name: {
        type: 'string',
        description: 'Include name (e.g., LZ_MY_FGTOP, LZ_MY_FGU01).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['function_group_name', 'include_name'],
  },
} as const;

export async function handleReadFunctionInclude(
  context: HandlerContext,
  args: {
    function_group_name: string;
    include_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  try {
    const { function_group_name, include_name, version = 'active' } = args;
    if (!function_group_name || !include_name)
      return return_error(
        new Error('function_group_name and include_name are required'),
      );

    const client = createAdtClient(connection, logger);
    const functionGroupName = function_group_name.toUpperCase();
    const includeName = include_name.toUpperCase();
    const obj = client.getFunctionInclude();

    let source_code: string | null = null;
    const readResult = await obj.read(
      { functionGroupName, includeName },
      version as 'active' | 'inactive',
    );
    if (readResult?.readResult?.data) {
      source_code =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : safeStringify(readResult.readResult.data);
    }

    let metadata: string | null = null;
    const metaResult = await obj.readMetadata({
      functionGroupName,
      includeName,
    });
    if (metaResult?.metadataResult?.data) {
      metadata =
        typeof metaResult.metadataResult.data === 'string'
          ? metaResult.metadataResult.data
          : safeStringify(metaResult.metadataResult.data);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          function_group_name: functionGroupName,
          include_name: includeName,
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
