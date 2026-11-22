import { compactProfileListSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeListProfilerTraceFiles } from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Lists the ABAP profiler trace files. Response, by default (detail terse): TSV, one row per trace (id, recordedAt, objectName, state, runtime); with detail medium or full every field as JSON.',
  inputSchema: compactProfileListSchema,
} as const;

export async function handleHandlerProfileList(
  context: HandlerContext,
  args: z.output<typeof compactProfileListSchema> = {},
) {
  // RuntimeListProfilerTraceFiles' answer at the level asked (compact parity).
  return handleRuntimeListProfilerTraceFiles(context, { detail: args.detail });
}
