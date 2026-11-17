/**
 * `Profiler.createParameters()` is gone in adt-clients 19: `IProfiler` no
 * longer composes `ITraceScheduling`. Scheduling a measurement moved to
 * `IClassExecutor`/`IProgramExecutor` instead — "This is an argument to a
 * *run*, not to a read, which is why it travels with scheduling rather than
 * staying on the reading surface" (`IProfiler`'s own doc). `scheduleTrace`
 * is what `createParameters` used to be: "Configure a measurement from
 * parameters alone, without the catalogues. Resolves to the request id,
 * taken from the `Location` header" (`ITraceScheduling.scheduleTrace`'s
 * doc) — same request, same answer, reached through an executor instead of
 * the profiler.
 *
 * `ClassExecutor`'s constructor takes only a connection and logger — no
 * class name — and `scheduleTrace` itself takes none either (see
 * `handleRuntimeRunClass.ts` with `profile=true`, which calls the identical member
 * the same way to feed its own run). This tool's schema never named an
 * object to run, and the tool surface is frozen for this migration (only an
 * optional `detail` parameter may be added — see the migration's ruling),
 * so `getClassExecutor()` is used as the one available door to
 * `scheduleTrace`, not because this is somehow a class-scoped trace.
 */
import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import type { compactProfileScheduleSchema } from '../../../lib/compact/compactSchemas';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { profilerTraceParameters } from '../../../lib/profilerTraceParameters';
import { ourClassExecutor } from '../../../lib/strategies/resultSets';
import { failedWith, succeededWith } from '../../../lib/strategies/sequence';
import { atStep, withStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeCreateProfilerTraceParameters',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Schedule ABAP profiler trace parameters and return profilerId (the request id) for profiled execution.',
  inputSchema: z.object({
    description: z.string().describe('Human-readable trace description.'),
    all_misc_abap_statements: z.boolean().optional(),
    all_procedural_units: z.boolean().optional(),
    all_internal_table_events: z.boolean().optional(),
    all_dynpro_events: z.boolean().optional(),
    aggregate: z.boolean().optional(),
    explicit_on_off: z.boolean().optional(),
    with_rfc_tracing: z.boolean().optional(),
    all_system_kernel_events: z.boolean().optional(),
    sql_trace: z.boolean().optional(),
    all_db_events: z.boolean().optional(),
    max_size_for_trace_file: z.number().optional(),
    amdp_trace: z.boolean().optional(),
    max_time_for_tracing: z.number().optional(),
  }),
} as const;

type RuntimeCreateProfilerTraceParametersArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleRuntimeCreateProfilerTraceParameters(
  context: HandlerContext,
  args: RuntimeCreateProfilerTraceParametersArgs,
) {
  const { connection, logger } = context;

  if (!args?.description) {
    return return_error(new Error('Parameter "description" is required'));
  }

  const classExecutor = new AdtExecutor(connection, logger).getClassExecutor(
    ourClassExecutor,
  );

  return answer(
    { tool: 'RuntimeCreateProfilerTraceParameters', detail: 'terse' },
    () =>
      withAdtHeaders(context, 'classExecutor.scheduleTrace', (headers) =>
        classExecutor.scheduleTrace({
          ...profilerTraceParameters(args),
          analyse: analyseException,
          headers,
        }),
      ),
    (profilerId) => ({
      success: true,
      profiler_id: profilerId,
    }),
  );
}

/** The step a failed schedule names (C6). */
const SCHEDULE_TRACE = 'schedule trace';

/** A schedule SAP answered with no profiler id: the fixed words. */
export const SCHEDULE_WITHOUT_ID =
  'SAP answered the trace schedule without a profiler id: no Location header carried one, so no run can name it.';

/** The profiling flags of a schedule, as compact's `HandlerProfileSchedule` takes them. */
export type ScheduleProfilerTraceArgs = z.output<
  typeof compactProfileScheduleSchema
>;

/**
 * The trace schedule in one request (compact `HandlerProfileSchedule`; spec
 * §4.6, one ADT request per tool call).
 *
 * The one `POST /runtime/traces/abaptraces/parameters`, answered
 * `{ success, profiler_id }`: the id SAP gave in `Location`, the only place it
 * appears. A `2xx` without one is a failure, since a run is named by that id
 * alone. A failure is the method's error plus `step`.
 */
export async function handleScheduleProfilerTraceOnce(
  context: HandlerContext,
  args: ScheduleProfilerTraceArgs,
  tool: string,
) {
  const { connection, logger } = context;
  const classExecutor = new AdtExecutor(connection, logger).getClassExecutor(
    ourClassExecutor,
  );

  return answer(
    { tool, detail: 'terse' },
    async () => {
      const scheduled = await atStep(SCHEDULE_TRACE, () =>
        withAdtHeaders(context, 'classExecutor.scheduleTrace', (headers) =>
          classExecutor.scheduleTrace({
            ...profilerTraceParameters(args),
            analyse: analyseException,
            headers,
          }),
        ),
      )();
      if (!scheduled.ok) return scheduled;
      const profilerId = scheduled.getResult().value;
      if (profilerId === '') {
        return failedWith<string>(
          withStep(
            { message: SCHEDULE_WITHOUT_ID, origin: 'refusal' },
            SCHEDULE_TRACE,
          ),
        );
      }
      return succeededWith(profilerId);
    },
    (profilerId: string) => ({
      success: true,
      profiler_id: profilerId,
    }),
  );
}
