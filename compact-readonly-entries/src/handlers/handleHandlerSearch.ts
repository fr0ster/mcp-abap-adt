import {
  compactSearchSchema,
  withLongToolAdvice,
} from '@mcp-abap-adt/lib/compact-shared';
import { defineTool, type HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleSearchObject,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerSearch',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Searches the ABAP repository for the objects whose name matches query, a name or a mask. Required: query*. Optional: object_type, max_results (default 100). Response: one object per line.',
  ),
  inputSchema: compactSearchSchema,
} as const;

/** SearchObject's entry: its schema parses the search. */
const searchObject = defineTool(
  READ_DEFINITIONS.SearchObject,
  handleSearchObject,
).call;

type HandlerSearchArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerSearch(
  context: HandlerContext,
  args: HandlerSearchArgs,
) {
  if (!args?.query) return return_error(new Error('query is required'));
  return searchObject(context, {
    object_name: args.query,
    object_type: args.object_type,
    maxResults: args.max_results ?? 100,
  });
}
