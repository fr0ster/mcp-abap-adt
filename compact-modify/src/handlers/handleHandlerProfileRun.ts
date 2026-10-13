import { compactProfileRunSchema, withLongToolAdvice } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleRuntimeRunClass,
  handleRuntimeRunProgram,
} from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileRun',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    'Runtime profiling run. object_type: not used. Required: target_type*(CLASS|PROGRAM) + class_name* for CLASS or program_name* for PROGRAM [onprem only — ABAP Cloud has no programs]. Optional: profiling(default true; set false for a plain run with no trace), profiling flags, description. Response: JSON.',
  ),
  inputSchema: compactProfileRunSchema,
} as const;

type HandlerProfileRunArgs = {
  target_type: 'CLASS' | 'PROGRAM';
  class_name?: string;
  program_name?: string;
  profiling?: boolean;
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

/**
 * A plain or a profiled run, through the two run tools' own handlers
 * (`RuntimeRunClass` / `RuntimeRunProgram` with `profile`): the deprecated
 * `…WithProfiling` tools are gone in 19.0.0, and a profiled run answers as
 * those two do.
 */
export async function handleHandlerProfileRun(
  context: HandlerContext,
  args: HandlerProfileRunArgs,
) {
  const profile = args.profiling ?? true;
  const profiler = profile
    ? {
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
      }
    : {};

  if (args.target_type === 'CLASS') {
    if (!args.class_name) {
      throw new Error('class_name is required when target_type is CLASS');
    }
    return handleRuntimeRunClass(context, {
      class_name: args.class_name,
      profile,
      ...profiler,
    });
  }

  if (!args.program_name) {
    throw new Error('program_name is required when target_type is PROGRAM');
  }
  return handleRuntimeRunProgram(context, {
    program_name: args.program_name,
    profile,
    ...profiler,
  });
}
