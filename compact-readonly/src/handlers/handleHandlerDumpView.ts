import { compactDumpViewSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeGetDumpById } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpView',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime dump view. object_type: not used. Required: dump_id*. Optional: view(default|summary|formatted). Response: JSON.',
  inputSchema: compactDumpViewSchema,
} as const;

type HandlerDumpViewArgs = {
  dump_id: string;
  view?: 'default' | 'summary' | 'formatted';
};

export async function handleHandlerDumpView(
  context: HandlerContext,
  args: HandlerDumpViewArgs,
) {
  return handleRuntimeGetDumpById(context, args);
}
