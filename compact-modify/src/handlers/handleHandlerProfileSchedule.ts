import {
  compactOf,
  compactProfileScheduleSchema,
  purpose,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleScheduleProfilerTraceOnce,
  type ScheduleProfilerTraceArgs,
  WRITE_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileSchedule',
  available_in: ['onprem', 'cloud'] as const,
  // Its action is the schedule: the purpose says so; the rest is the full
  // tool's.
  description: compactOf(
    WRITE_DEFINITIONS.RuntimeCreateProfilerTraceParameters.description,
    {
      purpose: purpose(
        'Schedules an ABAP profiler trace for a later profiled run of a class or a report, with the parameters given.',
      ),
    },
  ),
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
