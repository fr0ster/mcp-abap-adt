import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeListDumps',
  description:
    '[runtime] List ABAP runtime dumps with optional user filter and paging. Returns parsed JSON payload.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description:
          'Optional username filter. If omitted, dumps for all users are returned.',
      },
      inlinecount: {
        type: 'string',
        enum: ['allpages', 'none'],
        description: 'Include total count metadata.',
      },
      top: {
        type: 'number',
        description: 'Maximum number of records to return.',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip.',
      },
      orderby: {
        type: 'string',
        description: 'ADT order by expression.',
      },
    },
    required: [],
  },
} as const;

interface RuntimeListDumpsArgs {
  user?: string;
  inlinecount?: 'allpages' | 'none';
  top?: number;
  skip?: number;
  orderby?: string;
}

export async function handleRuntimeListDumps(
  context: HandlerContext,
  args: RuntimeListDumpsArgs,
) {
  const { connection, logger } = context;

  try {
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const { user, inlinecount, top, skip, orderby } = args || {};

    const response = user
      ? await runtimeClient.listRuntimeDumpsByUser(user, {
          inlinecount,
          top,
          skip,
          orderby,
        })
      : await runtimeClient.listRuntimeDumps({
          inlinecount,
          top,
          skip,
          orderby,
        });

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          user_filter: user || null,
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
    logger?.error('Error listing runtime dumps:', error);
    return return_error(error);
  }
}
