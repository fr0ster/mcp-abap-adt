import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListFeeds } from '../../system/readonly/handleRuntimeListFeeds';
import { compactDumpListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime feed list. object_type: not used. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, top, from, to. Response: JSON.',
  inputSchema: compactDumpListSchema,
} as const;

type HandlerDumpListArgs = {
  feed_type?: 'dumps' | 'system_messages' | 'gateway_errors';
  user?: string;
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
    max_results: args?.top,
    from: args?.from,
    to: args?.to,
  });
}
