import {
  compactDumpListSchema,
  withLongToolAdvice,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeListFeedPage } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] Reads one page of the runtime feed named by feed_type in one request, newest first: the ABAP short dumps (runtime errors) of the user, object_name or time range from–to given, or system messages or SAP Gateway errors. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, runtime_error, exception, object_name, package, component, top (1 to 100), from, to. Response: JSON { feed_type, count, entries, next_to }; each dump carries dump_id; next_to is the `to` of SAP's next link, present when more remain. The next link's page starts at the boundary second, inclusive: entries of that second may repeat; match them by dump_id.",
  ),
  inputSchema: compactDumpListSchema,
} as const;

type HandlerDumpListArgs = {
  feed_type?: 'dumps' | 'system_messages' | 'gateway_errors';
  user?: string;
  runtime_error?: string;
  exception?: string;
  object_name?: string;
  package?: string;
  component?: string;
  top?: number;
  from?: string;
  to?: string;
};

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
  });
}
