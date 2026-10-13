import { compactProfileListSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeListProfilerTraceFiles } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime profiling list. object_type: not used. Required: none. Response: JSON.',
  inputSchema: compactProfileListSchema,
} as const;

export async function handleHandlerProfileList(context: HandlerContext) {
  return handleRuntimeListProfilerTraceFiles(context);
}
