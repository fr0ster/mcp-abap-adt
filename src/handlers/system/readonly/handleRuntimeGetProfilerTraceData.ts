import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetProfilerTraceData',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload.',
  inputSchema: {
    type: 'object',
    properties: {
      trace_id_or_uri: {
        type: 'string',
        description: 'Profiler trace ID or full ADT trace URI.',
      },
      view: {
        type: 'string',
        enum: ['hitlist', 'statements', 'db_accesses'],
        description: 'Trace view to retrieve.',
      },
      with_system_events: {
        type: 'boolean',
        description: 'Include system events.',
      },
      id: {
        type: 'number',
        description: 'Statement node ID (for statements view).',
      },
      with_details: {
        type: 'boolean',
        description: 'Include statement details (for statements view).',
      },
      auto_drill_down_threshold: {
        type: 'number',
        description: 'Auto drill-down threshold (for statements view).',
      },
    },
    required: ['trace_id_or_uri', 'view'],
  },
} as const;

interface RuntimeGetProfilerTraceDataArgs {
  trace_id_or_uri: string;
  view: 'hitlist' | 'statements' | 'db_accesses';
  with_system_events?: boolean;
  id?: number;
  with_details?: boolean;
  auto_drill_down_threshold?: number;
}

export async function handleRuntimeGetProfilerTraceData(
  context: HandlerContext,
  args: RuntimeGetProfilerTraceDataArgs,
) {
  const { connection, logger } = context;

  if (!args?.trace_id_or_uri) {
    return return_error(new Error('Parameter "trace_id_or_uri" is required'));
  }

  const profiler = new AdtRuntimeClient(connection, logger).getProfiler();
  const view = args.view;
  const traceIdOrUri = args.trace_id_or_uri;

  // `getHitList`/`getStatements`/`getDbAccesses` are gone: `IProfiler` since
  // 31.0.0 composes `ITraceReading<IAbapTraceViews>`, one `read(traceId,
  // view, options)` over three named views instead of three methods. Each
  // view already answers its typed, parsed shape (`IAbapTraceHitList`'s
  // `entries`, `IAbapTraceStatements`'s `statements`,
  // `IAbapTraceDbAccesses`'s `accesses`) — there is no XML left here for
  // `parseRuntimePayloadToJson` to read, so it is dropped along with
  // `status`/`statusText`/`headers`/`config`, which the envelope no longer
  // carries. `view` maps `db_accesses` (this tool's own snake_case) onto the
  // library's `dbAccesses` view key; `hitlist`/`statements` are spelled the
  // same on both sides.
  //
  // Three separate `answer()` calls, not one `call()` with a branch per
  // view: `read<K>`'s three instantiations (`IAbapTraceHitList` /
  // `IAbapTraceStatements` / `IAbapTraceDbAccesses`) are not exported by
  // name from `@mcp-abap-adt/adt-clients`, so there is no union type to
  // write down for a single `answer<T>` — and the projection below never
  // reads a field of `payload`, so there is nothing lost by keeping each
  // view's own type all the way to `answer()` instead.
  const project = (payload: unknown) => ({
    success: true,
    view,
    trace_id_or_uri: traceIdOrUri,
    payload,
  });
  const ctx = { tool: 'RuntimeGetProfilerTraceData', detail: 'terse' as const };

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
          id: args.id,
          withDetails: args.with_details,
          autoDrillDownThreshold: args.auto_drill_down_threshold,
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
