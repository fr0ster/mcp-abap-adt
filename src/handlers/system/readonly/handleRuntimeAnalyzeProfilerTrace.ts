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

function collectObjects(value: unknown, acc: Record<string, unknown>[]): void {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjects(item, acc);
    }
    return;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    acc.push(record);
    for (const nested of Object.values(record)) {
      collectObjects(nested, acc);
    }
  }
}

function pickTopEntries(
  payload: unknown,
  top: number,
): {
  total_records: number;
  top_records: Array<Record<string, unknown>>;
} {
  const objects: Record<string, unknown>[] = [];
  collectObjects(payload, objects);

  const candidateRows = objects.filter((obj) =>
    Object.values(obj).some((val) => typeof val === 'number'),
  );

  const rankingKeys = [
    'grossTime',
    'gross_time',
    'netTime',
    'net_time',
    'duration',
    'runtime',
    'calls',
    'count',
    'hits',
  ];

  const resolveRankValue = (obj: Record<string, unknown>): number => {
    for (const key of rankingKeys) {
      const value = obj[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return 0;
  };

  const sorted = [...candidateRows]
    .sort((a, b) => resolveRankValue(b) - resolveRankValue(a))
    .slice(0, Math.max(1, top))
    .map((item) => {
      const compact: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          compact[key] = value;
        }
      }
      return compact;
    });

  return {
    total_records: candidateRows.length,
    top_records: sorted,
  };
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
  // `pickTopEntries` still works unchanged — it walks whatever object graph
  // it is given looking for numeric fields, and a typed `IAbapTraceHitList`/
  // `IAbapTraceStatements`/`IAbapTraceDbAccesses` is exactly such a graph.
  //
  // Three separate `answer()` calls, not one `call()` with a branch per
  // view — same reason as `handleRuntimeGetProfilerTraceData.ts`: the three
  // instantiations of `read<K>` have no exported union name, and the
  // projection below reads `payload` only through `pickTopEntries(payload:
  // unknown, …)`, so nothing is lost keeping each view's own type to the
  // point `answer()` erases it into the response.
  const project = (payload: unknown) => ({
    success: true,
    trace_id_or_uri: traceIdOrUri,
    view,
    summary: pickTopEntries(payload, top),
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
