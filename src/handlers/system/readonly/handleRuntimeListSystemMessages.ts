import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeListSystemMessages',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] List SM02 system messages. Returns structured entries with id, title, text, severity, validity period, and author.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description: 'Filter by author username.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of messages to return.',
      },
      from: {
        type: 'string',
        description: 'Start of time range in YYYYMMDDHHMMSS format.',
      },
      to: {
        type: 'string',
        description: 'End of time range in YYYYMMDDHHMMSS format.',
      },
    },
    required: [],
  },
} as const;

interface RuntimeListSystemMessagesArgs {
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
}

export async function handleRuntimeListSystemMessages(
  context: HandlerContext,
  args: RuntimeListSystemMessagesArgs,
) {
  const { connection, logger } = context;

  try {
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const feeds = runtimeClient.getFeeds();

    const messages = await feeds.systemMessages({
      user: args?.user,
      maxResults: args?.max_results,
      from: args?.from,
      to: args?.to,
    });

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          count: messages.length,
          messages,
        },
        null,
        2,
      ),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
  } catch (error: unknown) {
    logger?.error('Error listing system messages:', error);
    return return_error(error);
  }
}
