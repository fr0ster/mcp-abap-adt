import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListFeeds } from '../../system/readonly/handleRuntimeListFeeds';
import { compactFeedListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerFeedList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runtime feed list. object_type: not used. Required: none. Optional: feed_type, user, max_results, from, to. Response: JSON.',
  inputSchema: compactFeedListSchema,
} as const;

type HandlerFeedListArgs = {
  feed_type?:
    | 'descriptors'
    | 'variants'
    | 'dumps'
    | 'system_messages'
    | 'gateway_errors';
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
};

export async function handleHandlerFeedList(
  context: HandlerContext,
  args: HandlerFeedListArgs,
) {
  return handleRuntimeListFeeds(context, args);
}
