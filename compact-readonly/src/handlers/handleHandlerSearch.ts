import { compactSearchSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleSearchObject } from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerSearch',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Search ABAP repository objects by name or mask. Required: query*. Optional: object_type, max_results (default 100). Response: one object per line.',
  inputSchema: compactSearchSchema,
} as const;

type HandlerSearchArgs = {
  query: string;
  object_type?: string;
  max_results?: number;
};

export async function handleHandlerSearch(
  context: HandlerContext,
  args: HandlerSearchArgs,
) {
  if (!args?.query) return return_error(new Error('query is required'));
  return handleSearchObject(context, {
    object_name: args.query,
    object_type: args.object_type,
    maxResults: args.max_results ?? 100,
  } as never);
}
