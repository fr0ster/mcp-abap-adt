import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRuntimeGetGatewayErrorLog } from '../../system/readonly/handleRuntimeGetGatewayErrorLog';
import { compactGatewayErrorListSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerGatewayErrorList',
  available_in: ['onprem'] as const,
  description:
    'Gateway error log list/detail. object_type: not used. Required: none. Optional: error_url, user, max_results, from, to. Response: JSON.',
  inputSchema: compactGatewayErrorListSchema,
} as const;

type HandlerGatewayErrorListArgs = {
  error_url?: string;
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
};

export async function handleHandlerGatewayErrorList(
  context: HandlerContext,
  args: HandlerGatewayErrorListArgs,
) {
  return handleRuntimeGetGatewayErrorLog(context, args);
}
