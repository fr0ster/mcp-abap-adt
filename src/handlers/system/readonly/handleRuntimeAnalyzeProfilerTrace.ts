import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeAnalyzeProfilerTrace',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Read profiler trace view and return compact analysis summary (totals + top entries).',
  inputSchema: {
    type: 'object',
    properties: {
      trace_id_or_uri: {
        type: 'string',
        description: 'Profiler trace ID or full trace URI.',
      },
      view: {
        type: 'string',
        enum: ['hitlist', 'statements', 'db_accesses'],
        default: 'hitlist',
      },
      top: {
        type: 'number',
        description: 'Number of top rows for summary. Default: 10.',
      },
      with_system_events: {
        type: 'boolean',
        description: 'Include system events.',
      },
    },
    required: ['trace_id_or_uri'],
  },
} as const;

interface RuntimeAnalyzeProfilerTraceArgs {
  trace_id_or_uri: string;
  view?: 'hitlist' | 'statements' | 'db_accesses';
  top?: number;
  with_system_events?: boolean;
}

interface RankedSummary {
  total_records: number;
  top_records: Array<Record<string, unknown>>;
}

/**
 * Nested timing objects (`grossTime`/`traceEventNetTime`/`accessTime`) are
 * the fields this summary ranks by. Flattening one level in keeps the value
 * a row was ranked on visible in its own compact projection — `grossTime:
 * {time, percentage}` becomes `grossTime_time`/`grossTime_percentage` —
 * instead of being dropped as "not a primitive", which is what quietly
 * turned every ranked row into `{}` before this fix (see `summarizeView`'s
 * own doc).
 */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (
          typeof nestedValue === 'string' ||
          typeof nestedValue === 'number' ||
          typeof nestedValue === 'boolean'
        ) {
          out[`${key}_${nestedKey}`] = nestedValue;
        }
      }
    }
  }
  return out;
}

function rankBy(row: Record<string, unknown>, path: [string, string]): number {
  const outer = row[path[0]];
  if (!outer || typeof outer !== 'object') return 0;
  const value = (outer as Record<string, unknown>)[path[1]];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * `total_records`/`top_records`, read off the view's own named collection —
 * `entries` (hitlist), `statements`, or `accesses` (db_accesses) — and
 * ranked on that collection's own real numeric field
 * (`grossTime.time`/`accessTime.total`), never by walking the whole document
 * for any object that happens to carry a number.
 *
 * **Fix round 1, task 25.** The first pass here (`collectObjects`/
 * `pickTopEntries`) walked every nested object in the typed reading looking
 * for "anything with a number on it" — which counts each row's own
 * `grossTime`/`accessTime` sub-object as a second, spurious row (it has
 * numeric fields too), and ranked by a fixed list of guessed key names
 * (`'runtime'`, `'calls'`, `'hits'`, …) that do not exist on any of
 * `IAbapTraceHitListEntry`/`IAbapTraceStatement`/`IAbapTraceDbAccess` — so
 * the sort collapsed to `Array.prototype.sort`'s stability (document order)
 * with roughly half the slots taken by timing sub-objects rather than real
 * entries. Measured against the shapes in `@mcp-abap-adt/adt-clients`'s
 * `runtime/traces/types.d.ts`. `statements` ranks by `grossTime.time` too —
 * the type carries `traceEventNetTime` beside it, but both are documented as
 * present together on every row measured, and `grossTime` is the one metric
 * every view here shares, so one real field beats guessing which of two is
 * "the" one to prefer.
 */
function summarizeView(
  view: 'hitlist' | 'statements' | 'db_accesses',
  payload: unknown,
  top: number,
): RankedSummary {
  const collectionKey =
    view === 'hitlist'
      ? 'entries'
      : view === 'statements'
        ? 'statements'
        : 'accesses';
  const rankPath: [string, string] =
    view === 'db_accesses' ? ['accessTime', 'total'] : ['grossTime', 'time'];

  const collection = (payload as Record<string, unknown> | undefined)?.[
    collectionKey
  ];
  const rows: Record<string, unknown>[] = Array.isArray(collection)
    ? collection.filter(
        (row): row is Record<string, unknown> =>
          !!row && typeof row === 'object',
      )
    : [];

  const topRecords = [...rows]
    .sort((a, b) => rankBy(b, rankPath) - rankBy(a, rankPath))
    .slice(0, Math.max(1, top))
    .map(flattenRow);

  return { total_records: rows.length, top_records: topRecords };
}

export async function handleRuntimeAnalyzeProfilerTrace(
  context: HandlerContext,
  args: RuntimeAnalyzeProfilerTraceArgs,
) {
  const { connection, logger } = context;

  if (!args?.trace_id_or_uri) {
    return return_error(new Error('Parameter "trace_id_or_uri" is required'));
  }

  const view = args.view ?? 'hitlist';
  const traceIdOrUri = args.trace_id_or_uri;
  const top = args.top ?? 10;
  const profiler = new AdtRuntimeClient(connection, logger).getProfiler();

  // Same view-reading change as `handleRuntimeGetProfilerTraceData.ts` (see
  // that file's header): `read(traceId, view, options)` over the three named
  // views, already parsed, so `parseRuntimePayloadToJson` and the transport
  // fields (`status`/`statusText`/`headers`/`config`) are dropped here too.
  //
  // Three separate `answer()` calls, not one `call()` with a branch per
  // view — same reason as `handleRuntimeGetProfilerTraceData.ts`: the three
  // instantiations of `read<K>` have no exported union name, and the
  // projection below reads `payload` only structurally (`summarizeView`
  // narrows by `view`, not by `payload`'s static type), so nothing is lost
  // keeping each view's own type to the point `answer()` erases it into the
  // response.
  const project = (payload: unknown) => ({
    success: true,
    trace_id_or_uri: traceIdOrUri,
    view,
    summary: summarizeView(view, payload, top),
    payload,
  });
  const ctx = { tool: 'RuntimeAnalyzeProfilerTrace', detail: 'terse' as const };

  if (view === 'hitlist') {
    return answer(
      ctx,
      () =>
        profiler.read(traceIdOrUri, 'hitlist', {
          withSystemEvents: args.with_system_events,
        }),
      project,
    );
  }
  if (view === 'statements') {
    return answer(
      ctx,
      () =>
        profiler.read(traceIdOrUri, 'statements', {
          withSystemEvents: args.with_system_events,
        }),
      project,
    );
  }
  return answer(
    ctx,
    () =>
      profiler.read(traceIdOrUri, 'dbAccesses', {
        withSystemEvents: args.with_system_events,
      }),
    project,
  );
}
