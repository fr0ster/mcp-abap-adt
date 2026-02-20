import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunProgramWithProfiling',
  description:
    '[runtime] Execute ABAP program with profiler enabled and return created profilerId + traceId.',
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

  try {
    if (!args?.program_name) {
      throw new Error('Parameter "program_name" is required');
    }

    const programName = args.program_name.trim().toUpperCase();
    const executor = new AdtExecutor(connection, logger);
    const programExecutor = executor.getProgramExecutor();

    const result = await programExecutor.runWithProfiling(
      { programName },
      {
        profilerParameters: {
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
        },
      },
    );

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          program_name: programName,
          profiler_id: result.profilerId,
          trace_id: result.traceId,
          run_status: result.response?.status,
          trace_requests_status: result.traceRequestsResponse?.status,
        },
        null,
        2,
      ),
      status: result.response?.status,
      statusText: result.response?.statusText,
      headers: result.response?.headers,
      config: result.response?.config,
    });
  } catch (error: any) {
    logger?.error('Error running program with profiling:', error);
    return return_error(error);
  }
}
