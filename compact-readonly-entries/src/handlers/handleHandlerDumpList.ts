import {
  compactDumpListSchema,
  toolDescription,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  FEED_PAGE_PARTS,
  handleRuntimeListFeedPage,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpList',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(FEED_PAGE_PARTS),
  inputSchema: compactDumpListSchema,
} as const;

type HandlerDumpListArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerDumpList(
  context: HandlerContext,
  args: HandlerDumpListArgs,
) {
  return handleRuntimeListFeedPage(context, {
    feed_type: args?.feed_type ?? 'dumps',
    user: args?.user,
    runtime_error: args?.runtime_error,
    exception: args?.exception,
    object_name: args?.object_name,
    package: args?.package,
    component: args?.component,
    top: args?.top,
    from: args?.from,
    to: args?.to,
    detail: args?.detail,
  });
}
