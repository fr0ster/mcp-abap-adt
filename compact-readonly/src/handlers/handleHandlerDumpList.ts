import { compactDumpListSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleRuntimeListFeeds } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime feed list, newest first. object_type: not used. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, runtime_error, exception, object_name, package, component, top, from, to. Response: JSON; each dump carries dump_id, and next_to when more remain.',
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
  return handleRuntimeListFeeds(context, {
    feed_type: args?.feed_type ?? 'dumps',
    user: args?.user,
    runtime_error: args?.runtime_error,
    exception: args?.exception,
    object_name: args?.object_name,
    package: args?.package,
    component: args?.component,
    max_results: args?.top,
    from: args?.from,
    to: args?.to,
  });
}
