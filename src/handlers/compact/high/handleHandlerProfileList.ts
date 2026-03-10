import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListProfilerTraceFiles } from '../../system/readonly/handleRuntimeListProfilerTraceFiles';
import { compactProfileListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileList',
  available_in: ['onprem'] as const,
  description:
    'Runtime profiling list. object_type: not used. Required: none. Response: JSON.',
  inputSchema: compactProfileListSchema,
} as const;

export async function handleHandlerProfileList(context: HandlerContext) {
  return handleRuntimeListProfilerTraceFiles(context);
}
