import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

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
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds();
  const errorUrl = args?.error_url;

  // `gatewayErrorDetail()`/`gatewayErrors()` both answer `IAdtResponse<T>`
  // now — the detail branch used to hand the whole envelope object straight
  // to `error:` with no compile error at all (`IAdtResponse` unwrapped
  // nowhere, `.data`/`.length` never read on it), which would have
  // serialised as `{"ok":true}` (its own methods dropped by
  // `JSON.stringify`) rather than the actual detail document. Fixed here
  // alongside the list branch's genuine `errors.length` compile error,
  // since both come from the same `feeds` accessor this file already reads.
  //
  // Two separate `answer()` calls, not one `call()` with a branch per mode:
  // `IGatewayErrorEntry[]` and `IGatewayErrorDetail` are two different `T`s
  // for the same generic `answer<T>`, and `IGatewayErrorDetail` is not
  // exported by name from `@mcp-abap-adt/adt-clients` to write a union with.
  const ctx = { tool: 'RuntimeGetGatewayErrorLog', detail: 'terse' as const };

  if (errorUrl) {
    return answer(
      ctx,
      () => feeds.gatewayErrorDetail(errorUrl),
      (error) => ({ success: true, mode: 'detail', error }),
    );
  }

  return answer(
    ctx,
    () =>
      feeds.gatewayErrors({
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      }),
    (errors) => ({ success: true, mode: 'list', count: errors.length, errors }),
  );
}
