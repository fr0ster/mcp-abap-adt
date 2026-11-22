import { compactProfileListSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeListProfilerTraceFiles } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Lists the ABAP profiler trace files. Response: TSV, one row per trace (id, recordedAt, objectName, state, runtime).',
  inputSchema: compactProfileListSchema,
} as const;

export async function handleHandlerProfileList(context: HandlerContext) {
  return handleRuntimeListProfilerTraceFiles(context);
}
