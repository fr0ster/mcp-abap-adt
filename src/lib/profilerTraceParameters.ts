import type { IProfilerTraceParameters } from '@mcp-abap-adt/interfaces-adt';

/** The profiler trace arguments a tool takes, each possibly absent. */
export interface ProfilerTraceArgs {
  description?: string | undefined;
  all_misc_abap_statements?: boolean | undefined;
  all_procedural_units?: boolean | undefined;
  all_internal_table_events?: boolean | undefined;
  all_dynpro_events?: boolean | undefined;
  aggregate?: boolean | undefined;
  explicit_on_off?: boolean | undefined;
  with_rfc_tracing?: boolean | undefined;
  all_system_kernel_events?: boolean | undefined;
  sql_trace?: boolean | undefined;
  all_db_events?: boolean | undefined;
  max_size_for_trace_file?: number | undefined;
  amdp_trace?: boolean | undefined;
  max_time_for_tracing?: number | undefined;
}

/**
 * The profiler parameters the arguments give, each present only when given.
 *
 * The member merges them over its own defaults — `{ ...DEFAULTS, ...options }`.
 * There a key present with `undefined` is not "not given": it REPLACES the
 * default. The profiler parameters lost `maxSizeForTraceFile: 30720` exactly
 * that way, the size then left the request altogether, and every trace
 * measured on premise (2026-09-25) was recorded in state "Size violation". An
 * option the caller did not give must not reach the member at all — which
 * `IProfilerTraceParameters` (`?: T`, no `| undefined`) states.
 */
export function profilerTraceParameters(
  args: ProfilerTraceArgs | undefined,
): IProfilerTraceParameters {
  if (args === undefined) return {};
  return {
    ...(args.description !== undefined && { description: args.description }),
    ...(args.all_misc_abap_statements !== undefined && {
      allMiscAbapStatements: args.all_misc_abap_statements,
    }),
    ...(args.all_procedural_units !== undefined && {
      allProceduralUnits: args.all_procedural_units,
    }),
    ...(args.all_internal_table_events !== undefined && {
      allInternalTableEvents: args.all_internal_table_events,
    }),
    ...(args.all_dynpro_events !== undefined && {
      allDynproEvents: args.all_dynpro_events,
    }),
    ...(args.aggregate !== undefined && { aggregate: args.aggregate }),
    ...(args.explicit_on_off !== undefined && {
      explicitOnOff: args.explicit_on_off,
    }),
    ...(args.with_rfc_tracing !== undefined && {
      withRfcTracing: args.with_rfc_tracing,
    }),
    ...(args.all_system_kernel_events !== undefined && {
      allSystemKernelEvents: args.all_system_kernel_events,
    }),
    ...(args.sql_trace !== undefined && { sqlTrace: args.sql_trace }),
    ...(args.all_db_events !== undefined && {
      allDbEvents: args.all_db_events,
    }),
    ...(args.max_size_for_trace_file !== undefined && {
      maxSizeForTraceFile: args.max_size_for_trace_file,
    }),
    ...(args.amdp_trace !== undefined && { amdpTrace: args.amdp_trace }),
    ...(args.max_time_for_tracing !== undefined && {
      maxTimeForTracing: args.max_time_for_tracing,
    }),
  };
}
