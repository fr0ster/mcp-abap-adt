import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListProfilerTraceFiles } from '../../system/readonly/handleRuntimeListProfilerTraceFiles';
import { compactProfileListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileList',
  description: 'Compact runtime profiling list. Returns available profiler traces.',
  inputSchema: compactProfileListSchema,
} as const;

export async function handleHandlerProfileList(context: HandlerContext) {
  return handleRuntimeListProfilerTraceFiles(context);
}

