import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourFeeds } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetGatewayErrorLog',
  available_in: ['onprem'] as const,
  description:
    '[read-only] [runtime] List SAP Gateway error log (/IWFND/ERROR_LOG) or get error detail. Returns structured entries with type, shortText, transactionId, dateTime, username. With error_url returns full detail including serviceInfo, errorContext, sourceCode, callStack.',
  inputSchema: z.object({
    error_url: z
      .string()
      .optional()
      .describe(
        'Feed URL of a specific error entry (from a previous list response link field). When provided, returns detailed error info instead of listing.',
      ),
    user: z.string().optional().describe('Filter errors by SAP username.'),
    max_results: z
      .number()
      .optional()
      .describe('Maximum number of errors to return.'),
    from: z
      .string()
      .optional()
      .describe('Start of time range in YYYYMMDDHHMMSS format.'),
    to: z
      .string()
      .optional()
      .describe('End of time range in YYYYMMDDHHMMSS format.'),
  }),
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
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds(ourFeeds);
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
      () => feeds.gatewayErrorDetail(errorUrl, { analyse: analyseException }),
      (error) => ({ success: true, mode: 'detail', error }),
    );
  }

  return answer(
    ctx,
    () =>
      feeds.gatewayErrors({
        analyse: analyseException,
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      }),
    (errors) => ({ success: true, mode: 'list', count: errors.length, errors }),
  );
}
