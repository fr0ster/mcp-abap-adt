import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeListProfilerTraceFiles',
  description:
    '[runtime] List ABAP profiler trace files available in ADT runtime. Returns parsed JSON payload.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleRuntimeListProfilerTraceFiles(
  context: HandlerContext,
) {
  const { connection, logger } = context;

  try {
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response = await runtimeClient.listProfilerTraceFiles();

    return return_response({
      data: JSON.stringify(
        {
          success: true,
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
    logger?.error('Error listing profiler trace files:', error);
    return return_error(error);
  }
}
