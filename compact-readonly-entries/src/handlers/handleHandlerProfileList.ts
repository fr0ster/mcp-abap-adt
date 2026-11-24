import {
  compactOf,
  compactProfileListSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleRuntimeListProfilerTraceFiles,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileList',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(
    READ_DEFINITIONS.RuntimeListProfilerTraceFiles.description,
  ),
  inputSchema: compactProfileListSchema,
} as const;

export async function handleHandlerProfileList(
  context: HandlerContext,
  args: z.output<typeof compactProfileListSchema> = {},
) {
  // RuntimeListProfilerTraceFiles' answer at the level asked (compact parity).
  return handleRuntimeListProfilerTraceFiles(context, { detail: args.detail });
}
