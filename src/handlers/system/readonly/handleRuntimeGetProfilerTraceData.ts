import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import { ourProfiler } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetProfilerTraceData',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload.',
  ),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    trace_id_or_uri: z
      .string()
      .describe('Profiler trace ID or full ADT trace URI.'),
    view: z
      .enum(['hitlist', 'statements', 'db_accesses'])
      .describe('Trace view to retrieve.'),
    with_system_events: z
      .boolean()
      .optional()
      .describe('Include system events.'),
    id: z
      .number()
      .optional()
      .describe('Statement node ID (for statements view).'),
    with_details: z
      .boolean()
      .optional()
      .describe('Include statement details (for statements view).'),
    auto_drill_down_threshold: z
      .number()
      .optional()
      .describe('Auto drill-down threshold (for statements view).'),
  }),
} as const;

type RuntimeGetProfilerTraceDataArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleRuntimeGetProfilerTraceData(
  context: HandlerContext,
  args: RuntimeGetProfilerTraceDataArgs,
) {
  const { connection, logger } = context;

  if (!args?.trace_id_or_uri) {
    return return_error(new Error('Parameter "trace_id_or_uri" is required'));
  }

  const profiler = new AdtRuntimeClient(connection, logger).getProfiler(
    ourProfiler,
  );
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
          analyse: analyseException,
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
          analyse: analyseException,
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
        analyse: analyseException,
        withSystemEvents: args.with_system_events,
      }),
    project,
  );
}
