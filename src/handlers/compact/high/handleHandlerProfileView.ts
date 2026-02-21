import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeGetProfilerTraceData } from '../../system/readonly/handleRuntimeGetProfilerTraceData';
import { compactProfileViewSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileView',
  description:
    'Runtime profiling view. object_type: not used. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON.',
  inputSchema: compactProfileViewSchema,
} as const;

type HandlerProfileViewArgs = {
  trace_id_or_uri: string;
  view: 'hitlist' | 'statements' | 'db_accesses';
  with_system_events?: boolean;
  id?: number;
  with_details?: boolean;
  auto_drill_down_threshold?: number;
};

export async function handleHandlerProfileView(
  context: HandlerContext,
  args: HandlerProfileViewArgs,
) {
  return handleRuntimeGetProfilerTraceData(context, args);
}
