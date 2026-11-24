import {
  compactProfileViewSchema,
  longRunning,
  purpose,
  toolDescription,
  valueFrom,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleRuntimeAnalyzeProfilerTrace,
  handleRuntimeGetProfilerTraceData,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileView',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads one view of an ABAP profiler trace, its hit list, its statements or its database accesses, as recorded or summarised.',
    ),
    values: {
      of: 'mode',
      each: [
        valueFrom(
          'raw',
          READ_DEFINITIONS.RuntimeGetProfilerTraceData.description,
        ),
        valueFrom(
          'analyze',
          READ_DEFINITIONS.RuntimeAnalyzeProfilerTrace.description,
        ),
      ],
    },
    notes: [longRunning],
  }),
  inputSchema: compactProfileViewSchema,
} as const;

type HandlerProfileViewArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerProfileView(
  context: HandlerContext,
  args: HandlerProfileViewArgs,
) {
  if (args.mode === 'analyze') {
    return handleRuntimeAnalyzeProfilerTrace(context, {
      trace_id_or_uri: args.trace_id_or_uri,
      view: args.view,
      top: args.top,
      with_system_events: args.with_system_events,
    });
  }

  return handleRuntimeGetProfilerTraceData(context, {
    trace_id_or_uri: args.trace_id_or_uri,
    view: args.view,
    with_system_events: args.with_system_events,
    id: args.id,
    with_details: args.with_details,
    auto_drill_down_threshold: args.auto_drill_down_threshold,
  });
}
