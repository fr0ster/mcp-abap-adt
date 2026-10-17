import { compactProfileScheduleSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleScheduleProfilerTraceOnce,
  type ScheduleProfilerTraceArgs,
} from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileSchedule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Schedules an ABAP profiler trace in one request. object_type: not used. Optional: description, profiling flags (all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing). Response: JSON { success, profiler_id }, profiler_id the id of the scheduled trace.',
  inputSchema: compactProfileScheduleSchema,
} as const;

/** The one schedule request; the run that fulfils it takes the profiler id it answers. */
export async function handleHandlerProfileSchedule(
  context: HandlerContext,
  args: ScheduleProfilerTraceArgs,
) {
  return handleScheduleProfilerTraceOnce(
    context,
    args ?? {},
    'HandlerProfileSchedule',
  );
}
