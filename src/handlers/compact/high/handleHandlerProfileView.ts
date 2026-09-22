import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeAnalyzeProfilerTrace } from '../../system/readonly/handleRuntimeAnalyzeProfilerTrace';
import { handleRuntimeGetProfilerTraceData } from '../../system/readonly/handleRuntimeGetProfilerTraceData';
import { compactProfileViewSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileView',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime profiling view. object_type: not used. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: mode(raw|analyze, default raw), top(analyze only), with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON.',
  inputSchema: compactProfileViewSchema,
} as const;

type HandlerProfileViewArgs = {
  trace_id_or_uri: string;
  view: 'hitlist' | 'statements' | 'db_accesses';
  mode?: 'raw' | 'analyze';
  top?: number;
  with_system_events?: boolean;
  id?: number;
  with_details?: boolean;
  auto_drill_down_threshold?: number;
};

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
