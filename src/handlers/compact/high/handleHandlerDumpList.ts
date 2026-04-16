import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListFeeds } from '../../system/readonly/handleRuntimeListFeeds';
import { compactDumpListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerDumpList',
  available_in: ['onprem'] as const,
  description:
    'Runtime dump list. object_type: not used. Required: none. Optional: user, top, from, to. Response: JSON.',
  inputSchema: compactDumpListSchema,
} as const;

type HandlerDumpListArgs = {
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
    feed_type: 'dumps',
    user: args?.user,
    max_results: args?.top,
    from: args?.from,
    to: args?.to,
  });
}
