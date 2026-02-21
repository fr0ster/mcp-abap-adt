import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeRunClassWithProfiling } from '../../system/readonly/handleRuntimeRunClassWithProfiling';
import { handleRuntimeRunProgramWithProfiling } from '../../system/readonly/handleRuntimeRunProgramWithProfiling';
import { compactProfileRunSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileRun',
  description:
    'Compact runtime profiling run. Executes CLASS or PROGRAM with profiling enabled.',
  inputSchema: compactProfileRunSchema,
} as const;

type HandlerProfileRunArgs = {
  target_type: 'CLASS' | 'PROGRAM';
  class_name?: string;
  program_name?: string;
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
};

export async function handleHandlerProfileRun(
  context: HandlerContext,
  args: HandlerProfileRunArgs,
) {
  if (args.target_type === 'CLASS') {
    if (!args.class_name) {
      throw new Error('class_name is required when target_type is CLASS');
    }
    return handleRuntimeRunClassWithProfiling(context, {
      class_name: args.class_name,
      description: args.description,
      all_procedural_units: args.all_procedural_units,
      all_misc_abap_statements: args.all_misc_abap_statements,
      all_internal_table_events: args.all_internal_table_events,
      all_dynpro_events: args.all_dynpro_events,
      aggregate: args.aggregate,
      explicit_on_off: args.explicit_on_off,
      with_rfc_tracing: args.with_rfc_tracing,
      all_system_kernel_events: args.all_system_kernel_events,
      sql_trace: args.sql_trace,
      all_db_events: args.all_db_events,
      max_size_for_trace_file: args.max_size_for_trace_file,
      amdp_trace: args.amdp_trace,
      max_time_for_tracing: args.max_time_for_tracing,
    });
  }

  if (!args.program_name) {
    throw new Error('program_name is required when target_type is PROGRAM');
  }
  return handleRuntimeRunProgramWithProfiling(context, {
    program_name: args.program_name,
    description: args.description,
    all_procedural_units: args.all_procedural_units,
    all_misc_abap_statements: args.all_misc_abap_statements,
    all_internal_table_events: args.all_internal_table_events,
    all_dynpro_events: args.all_dynpro_events,
    aggregate: args.aggregate,
    explicit_on_off: args.explicit_on_off,
    with_rfc_tracing: args.with_rfc_tracing,
    all_system_kernel_events: args.all_system_kernel_events,
    sql_trace: args.sql_trace,
    all_db_events: args.all_db_events,
    max_size_for_trace_file: args.max_size_for_trace_file,
    amdp_trace: args.amdp_trace,
    max_time_for_tracing: args.max_time_for_tracing,
  });
}
