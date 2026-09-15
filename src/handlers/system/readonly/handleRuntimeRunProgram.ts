/**
 * RuntimeRunProgram Handler - Execute an ABAP program, optionally profiled
 *
 * Uses `new AdtExecutor(connection, logger).getProgramExecutor()` from
 * @mcp-abap-adt/adt-clients 19 — not `createAdtClient`, per
 * `AdtExecutor`'s own shape (see `handleRuntimeRunProgramWithProfiling.ts`
 * and Task 24's class-profiling pair for the same door).
 *
 * **`runWithProfiling` was split, not deleted.** `ProgramExecutor`'s own
 * doc comment: "Not `IProgramExecutor` since 19.0.0. That composite
 * includes `IRunnableWithProfiling`, whose `runWithProfiling` scheduled a
 * trace, ran the program under it, and answered both — three requests in
 * one member... a caller who wants the old member writes `scheduleTrace`,
 * then `runWithProfiler` with the id it answered." Composed here with
 * `pair()` rather than `sequence()`: the final answer needs BOTH halves —
 * the scheduled `profilerId` and the run's own output — where `sequence()`
 * keeps only the last step.
 *
 * Neither `run`, `scheduleTrace` nor `runWithProfiler` accepts an
 * `options.analyse` (confirmed against `ProgramExecutor.d.ts`: `run` takes
 * no options at all, `scheduleTrace`'s only parameter is
 * `IProfilerTraceParameters`, and `runWithProfiler`'s is
 * `IProgramExecuteWithProfilerOptions` — just `{ profilerId }`). Their
 * verdict is the library's own, the same absence the where-used and
 * node-structure members in this migration share.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunProgram',
  available_in: ['onprem'] as const,
  description:
    '[runtime] Execute an ABAP program (report) and return its output. Set profile=true to also start a profiler trace; use RuntimeListProfilerTraceFiles afterwards to locate the trace (program execution is fire-and-forget, so traceId is not returned synchronously).',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'ABAP program name to execute.',
      },
      profile: {
        type: 'boolean',
        description:
          'When true, run with the profiler. Default false. Trace must be located afterwards via RuntimeListProfilerTraceFiles — program execution does not return traceId synchronously.',
      },
      description: {
        type: 'string',
        description:
          'Profiler trace description (only used when profile=true).',
      },
      all_procedural_units: { type: 'boolean' },
      all_misc_abap_statements: { type: 'boolean' },
      all_internal_table_events: { type: 'boolean' },
      all_dynpro_events: { type: 'boolean' },
      aggregate: { type: 'boolean' },
      explicit_on_off: { type: 'boolean' },
      with_rfc_tracing: { type: 'boolean' },
      all_system_kernel_events: { type: 'boolean' },
      sql_trace: { type: 'boolean' },
      all_db_events: { type: 'boolean' },
      max_size_for_trace_file: { type: 'number' },
      amdp_trace: { type: 'boolean' },
      max_time_for_tracing: { type: 'number' },
    },
    required: ['program_name'],
  },
} as const;

interface RuntimeRunProgramArgs {
  program_name: string;
  profile?: boolean;
  description?: string;
  all_procedural_units?: boolean;
  all_misc_abap_statements?: boolean;
  all_internal_table_events?: boolean;
  all_dynpro_events?: boolean;
  aggregate?: boolean;
  explicit_on_off?: boolean;
  with_rfc_tracing?: boolean;
  all_system_kernel_events?: boolean;
  sql_trace?: boolean;
  all_db_events?: boolean;
  max_size_for_trace_file?: number;
  amdp_trace?: boolean;
  max_time_for_tracing?: number;
}

export async function handleRuntimeRunProgram(
  context: HandlerContext,
  args: RuntimeRunProgramArgs,
) {
  const { connection, logger } = context;

  if (!args?.program_name) {
    return return_error(new Error('Parameter "program_name" is required'));
  }

  const programName = args.program_name.trim().toUpperCase();
  const executor = new AdtExecutor(connection, logger);
  const programExecutor = executor.getProgramExecutor();

  if (!args.profile) {
    return answer(
      { tool: 'RuntimeRunProgram', detail: 'terse' },
      () => programExecutor.run({ programName }),
      (output: string) => ({
        success: true,
        program_name: programName,
        output: output ?? '',
      }),
    );
  }

  return answer(
    { tool: 'RuntimeRunProgram', detail: 'terse' },
    () =>
      pair(
        () =>
          programExecutor.scheduleTrace({
            description: args.description,
            allProceduralUnits: args.all_procedural_units,
            allMiscAbapStatements: args.all_misc_abap_statements,
            allInternalTableEvents: args.all_internal_table_events,
            allDynproEvents: args.all_dynpro_events,
            aggregate: args.aggregate,
            explicitOnOff: args.explicit_on_off,
            withRfcTracing: args.with_rfc_tracing,
            allSystemKernelEvents: args.all_system_kernel_events,
            sqlTrace: args.sql_trace,
            allDbEvents: args.all_db_events,
            maxSizeForTraceFile: args.max_size_for_trace_file,
            amdpTrace: args.amdp_trace,
            maxTimeForTracing: args.max_time_for_tracing,
          }),
        (profilerId: string) =>
          programExecutor.runWithProfiler({ programName }, { profilerId }),
      ),
    ([profilerId, output]: [string, string]) => ({
      success: true,
      program_name: programName,
      output: output ?? '',
      profile: {
        profiler_id: profilerId,
        // traceId is not returned for programs — use RuntimeListProfilerTraceFiles to find it.
      },
    }),
  );
}
