import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeListFeeds',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] List available ADT runtime feeds or read a specific feed type. Feed types: dumps, system_messages, gateway_errors. Without feed_type returns available feed descriptors.',
  inputSchema: {
    type: 'object',
    properties: {
      feed_type: {
        type: 'string',
        enum: [
          'descriptors',
          'variants',
          'dumps',
          'system_messages',
          'gateway_errors',
        ],
        description:
          'Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.',
        default: 'descriptors',
      },
      user: {
        type: 'string',
        description: 'Filter feed entries by SAP username.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of entries to return.',
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

interface RuntimeListFeedsArgs {
  feed_type?:
    | 'descriptors'
    | 'variants'
    | 'dumps'
    | 'system_messages'
    | 'gateway_errors';
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
}

export async function handleRuntimeListFeeds(
  context: HandlerContext,
  args: RuntimeListFeedsArgs,
) {
  const { connection, logger } = context;

  try {
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const feeds = runtimeClient.getFeeds();
    const feedType = args?.feed_type ?? 'descriptors';

    const queryOptions = {
      user: args?.user,
      maxResults: args?.max_results,
      from: args?.from,
      to: args?.to,
    };

    let data: unknown;

    switch (feedType) {
      case 'descriptors':
        data = await feeds.list();
        break;
      case 'variants':
        data = await feeds.variants();
        break;
      case 'dumps':
        data = await feeds.dumps(queryOptions);
        break;
      case 'system_messages':
        data = await feeds.systemMessages(queryOptions);
        break;
      case 'gateway_errors':
        data = await feeds.gatewayErrors(queryOptions);
        break;
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          feed_type: feedType,
          count: Array.isArray(data) ? data.length : undefined,
          entries: data,
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
    logger?.error('Error reading feeds:', error);
    return return_error(error);
  }
}
