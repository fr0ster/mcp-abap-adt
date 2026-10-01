import { compactDumpViewSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeGetDumpById } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpView',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime dump view. object_type: not used. Required: dump_id* (id or URI). Optional: view(default|summary|formatted). Response: JSON.',
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
  // `summary` is the summary of the default view — ADT's own summary view
  // answers a document without the dump's root, so it summarises nothing.
  switch (args?.view ?? 'default') {
    case 'summary':
      return handleRuntimeGetDumpById(context, {
        dump_id: args?.dump_id,
        view: 'default',
        response_mode: 'summary',
      });
    case 'formatted':
      return handleRuntimeGetDumpById(context, {
        dump_id: args?.dump_id,
        view: 'formatted',
        response_mode: 'payload',
      });
    default:
      return handleRuntimeGetDumpById(context, {
        dump_id: args?.dump_id,
        view: 'default',
        response_mode: 'both',
      });
  }
}
