import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetDumpById',
  description:
    '[runtime] Read a specific ABAP runtime dump by dump ID. Returns parsed JSON payload.',
  inputSchema: {
    type: 'object',
    properties: {
      dump_id: {
        type: 'string',
        description:
          'Runtime dump ID (for example: 694AB694097211F1929806D06D234D38).',
      },
    },
    required: ['dump_id'],
  },
} as const;

interface RuntimeGetDumpByIdArgs {
  dump_id: string;
}

export async function handleRuntimeGetDumpById(
  context: HandlerContext,
  args: RuntimeGetDumpByIdArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.dump_id) {
      throw new Error('Parameter "dump_id" is required');
    }

    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response = await runtimeClient.getRuntimeDumpById(args.dump_id);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          dump_id: args.dump_id,
          status: response.status,
          payload: parseRuntimePayloadToJson(response.data),
        },
        null,
        2,
      ),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config,
    });
  } catch (error: any) {
    logger?.error('Error reading runtime dump by ID:', error);
    return return_error(error);
  }
}
