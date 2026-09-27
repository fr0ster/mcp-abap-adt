/**
 * RuntimeRunProgramWithProfiling Handler - Execute ABAP program with
 * profiler enabled [deprecated, kept for backward compatibility]
 *
 * Uses `new AdtExecutor(connection, logger).getProgramExecutor()` from
 * @mcp-abap-adt/adt-clients 19. Same `scheduleTrace` → `runWithProfiler`
 * split as `handleRuntimeRunProgram.ts` (see that file's header for the
 * full reasoning and the citation from `ProgramExecutor`'s own doc
 * comment) — this tool always takes the profiled branch.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { definedOnly } from '../../../lib/definedOnly';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourProgramExecutor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunProgramWithProfiling',
  available_in: ['onprem'] as const,
  description:
    '[runtime][deprecated] Execute ABAP program with profiler enabled and return created profilerId. Prefer RuntimeRunProgram with profile=true; this tool is kept for backward compatibility and will be removed in a future major release.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'ABAP program name to execute.',
      },
      description: {
        type: 'string',
        description: 'Profiler trace description.',
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

interface RuntimeRunProgramWithProfilingArgs {
  program_name: string;
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

export async function handleRuntimeRunProgramWithProfiling(
  context: HandlerContext,
  args: RuntimeRunProgramWithProfilingArgs,
) {
  const { connection, logger } = context;

  if (!args?.program_name) {
    return return_error(new Error('Parameter "program_name" is required'));
  }

  const programName = args.program_name.trim().toUpperCase();
  const executor = new AdtExecutor(connection, logger);
  const programExecutor = executor.getProgramExecutor(ourProgramExecutor);

  return answer(
    { tool: 'RuntimeRunProgramWithProfiling', detail: 'terse' },
    () =>
      pair(
        () =>
          programExecutor.scheduleTrace({
            ...definedOnly({
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
            analyse: analyseException,
          }),
        (profilerId: string) =>
          programExecutor.runWithProfiler(
            { programName },
            { analyse: analyseException, profilerId },
          ),
      ),
    ([profilerId, output]: [string, string]) => ({
      success: true,
      program_name: programName,
      profiler_id: profilerId,
      output: output ?? '',
      // trace_id is not returned — program execution is fire-and-forget.
      // Use RuntimeListProfilerTraceFiles to find the trace after execution.
    }),
  );
}
