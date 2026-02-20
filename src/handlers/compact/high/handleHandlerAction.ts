import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactAction } from './compactActions';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactAction } from './compactRouter';
import { compactActionSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerAction',
  description:
    'Compact facade non-CRUD action router. Routes by object_type + action.',
  inputSchema: compactActionSchema,
} as const;

type HandlerActionArgs = {
  object_type: CompactObjectType;
  action: CompactAction;
} & Record<string, unknown>;

export async function handleHandlerAction(
  context: HandlerContext,
  args: HandlerActionArgs,
) {
  return routeCompactAction(context, args.action, args);
}
