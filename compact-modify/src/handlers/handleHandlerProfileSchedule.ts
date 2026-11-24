import {
  compactOf,
  compactProfileScheduleSchema,
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
  description: compactOf(
    WRITE_DEFINITIONS.RuntimeCreateProfilerTraceParameters.description,
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
