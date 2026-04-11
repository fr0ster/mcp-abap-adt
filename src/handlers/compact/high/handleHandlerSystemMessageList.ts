import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeListSystemMessages } from '../../system/readonly/handleRuntimeListSystemMessages';
import { compactSystemMessageListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerSystemMessageList',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'SM02 system messages list. object_type: not used. Required: none. Optional: user, max_results, from, to. Response: JSON.',
  inputSchema: compactSystemMessageListSchema,
} as const;

type HandlerSystemMessageListArgs = {
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
};

export async function handleHandlerSystemMessageList(
  context: HandlerContext,
  args: HandlerSystemMessageListArgs,
) {
  return handleRuntimeListSystemMessages(context, args);
}
