import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  feedGatewayErrorDetail,
  feedGatewayErrors,
  type IGatewayErrorEntry,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import {
  answered,
  type DetailTable,
  formatted,
  type ListDetailTable,
  rawLevel,
  readingAt,
  rows,
  type Written,
  writeListing,
  writeWhole,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourFeeds } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetGatewayErrorLog',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] [runtime] Lists the SAP Gateway error log (/IWFND/ERROR_LOG), or reads one error's detail. The list answers each error's opid and detail_kind (what its detail is read by), dateTime, type, shortText and username: by default as TSV rows; with detail medium or full every field (id, kind, transactionId, package, applicationComponent, userId, client, requestKind, detailUri). With opid and detail_kind, the error's detail under error: the list's fields of the error, then serviceInfo, errorContext, sourceCode and callStack. With detail raw the document as ADT sent it: the Atom feed for the list, the HTML for a detail.",
  inputSchema: z.object({
    opid: z
      .string()
      .optional()
      .describe(
        "An error's opid, from the list: with detail_kind, answers that error's detail instead of the list.",
      ),
    detail_kind: z
      .string()
      .optional()
      .describe(
        "The error's detail_kind, from the list: the kind its detail is read under. Required with opid.",
      ),
    error_url: z
      .string()
      .optional()
      .describe(
        "An error's detailUri, from the list at detail medium or full: answers that error's detail instead of the list.",
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
    ...DETAIL_SHAPE,
  }),
} as const;

type RuntimeGetGatewayErrorLogArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleRuntimeGetGatewayErrorLog(
  context: HandlerContext,
  args: RuntimeGetGatewayErrorLogArgs,
) {
  const { connection, logger } = context;
  // Each level's reading is passed to the call, selected before it.
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds({
    ...ourFeeds,
    gatewayErrors: readingAt(GATEWAY_ERROR_READINGS, levelOf(args)),
    gatewayErrorDetail: readingAt(GATEWAY_DETAIL_READINGS, levelOf(args)),
  });
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
  const detailUri =
    args?.opid !== undefined && args.detail_kind !== undefined
      ? `/sap/bc/adt/gw/errorlog/${encodeURIComponent(args.detail_kind)}/${encodeURIComponent(args.opid)}`
      : errorUrl;
  if (args?.opid !== undefined && args.detail_kind === undefined) {
    return return_error(
      new Error('detail_kind is required with opid: the list answers both'),
    );
  }
  if (detailUri !== undefined) {
    return answer(
      { tool: 'RuntimeGetGatewayErrorLog', detail: detailOf(args) },
      () => feeds.gatewayErrorDetail(detailUri, { analyse: analyseException }),
      answered,
    );
  }

  return answer(
    { tool: 'RuntimeGetGatewayErrorLog', detail: detailOf(args) },
    () =>
      feeds.gatewayErrors({
        analyse: analyseException,
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      }),
    answered,
  );
}

/**
 * The kind an error's detail is read under: the segment of its `detailUri`
 * after `/errorlog/` (adt-strategies builds it from the entry's own id: on
 * premise the id's kind, on the cloud the Type cell).
 */
export function detailKindOf(entry: IGatewayErrorEntry): string {
  const uri = entry.detailUri;
  if (uri === undefined) return '';
  const marker = '/errorlog/';
  const at = uri.indexOf(marker);
  if (at < 0) return '';
  const rest = uri.slice(at + marker.length);
  const end = rest.indexOf('/');
  const segment = end < 0 ? rest : rest.slice(0, end);
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The list at terse: a TSV row per error. */
function terseErrors(errors: readonly IGatewayErrorEntry[]): Written<string> {
  return writeListing({
    heads: [{ head: 'count', value: String(errors.length) }],
    reading: { errors },
    lists: {
      errors: rows('errors', {
        columns: [
          {
            name: 'opid',
            cell: (error: IGatewayErrorEntry) => error.opid ?? '',
          },
          { name: 'detail_kind', cell: detailKindOf },
          {
            name: 'dateTime',
            cell: (error: IGatewayErrorEntry) => error.dateTime ?? '',
          },
          {
            name: 'type',
            cell: (error: IGatewayErrorEntry) => error.type ?? '',
          },
          {
            name: 'shortText',
            cell: (error: IGatewayErrorEntry) => error.shortText ?? '',
          },
          {
            name: 'username',
            cell: (error: IGatewayErrorEntry) => error.username ?? '',
          },
        ],
        header: 'always',
      }),
    },
  });
}

/**
 * What the list answers at each `detail`: the reading passed to the call
 * (`src/lib/detail`) — terse, medium and full over adt-strategies' reading of
 * the feed (`feedGatewayErrors`): terse a TSV row per error, opid and
 * detail_kind (what its detail is read by), dateTime, type, shortText,
 * username; medium and full every field the reading read; raw the Atom
 * document as ADT sent it.
 */
const GATEWAY_ERROR_READINGS: ListDetailTable<string | object> = {
  terse: written(feedGatewayErrors, terseErrors),
  // The feed's errors whole, as read.
  medium: written(feedGatewayErrors, (errors) =>
    writeWhole({
      count: errors.length,
      errors,
    }),
  ),
  full: formatted(feedGatewayErrors, (errors) => ({
    success: true,
    mode: 'list',
    count: errors.length,
    errors,
  })),
  raw: rawLevel,
};

/**
 * What an error's detail answers at each `detail`: adt-strategies' reading of
 * SAP's HTML (`feedGatewayErrorDetail`) — every field it read, at terse,
 * medium and full — or, raw, the HTML as ADT sent it.
 */
const GATEWAY_DETAIL_READINGS: DetailTable<string | object> = (() => {
  const read = formatted(feedGatewayErrorDetail, (error) => ({
    success: true,
    mode: 'detail',
    error,
  }));
  return { terse: read, medium: read, full: read, raw: rawLevel };
})();
