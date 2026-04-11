import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetGatewayErrorLog',
  available_in: ['onprem'] as const,
  description:
    '[runtime] List SAP Gateway error log (/IWFND/ERROR_LOG) or get error detail. Returns structured entries with type, shortText, transactionId, dateTime, username. With error_url returns full detail including serviceInfo, errorContext, sourceCode, callStack.',
  inputSchema: {
    type: 'object',
    properties: {
      error_url: {
        type: 'string',
        description:
          'Feed URL of a specific error entry (from a previous list response link field). When provided, returns detailed error info instead of listing.',
      },
      user: {
        type: 'string',
        description: 'Filter errors by SAP username.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of errors to return.',
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

interface RuntimeGetGatewayErrorLogArgs {
  error_url?: string;
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
}

export async function handleRuntimeGetGatewayErrorLog(
  context: HandlerContext,
  args: RuntimeGetGatewayErrorLogArgs,
) {
  const { connection, logger } = context;

  try {
    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const feeds = runtimeClient.getFeeds();

    if (args?.error_url) {
      const detail = await feeds.gatewayErrorDetail(args.error_url);
      return return_response({
        data: JSON.stringify(
          {
            success: true,
            mode: 'detail',
            error: detail,
          },
          null,
          2,
        ),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });
    }

    const errors = await feeds.gatewayErrors({
      user: args?.user,
      maxResults: args?.max_results,
      from: args?.from,
      to: args?.to,
    });

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          mode: 'list',
          count: errors.length,
          errors,
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
    logger?.error('Error reading gateway error log:', error);
    return return_error(error);
  }
}
