import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactOperation } from './compactRouter';
import { compactUpdateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUpdate',
  description:
    'Compact facade update operation. Routes by object_type to update supported ABAP object types.',
  inputSchema: compactUpdateSchema,
} as const;

type HandlerUpdateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerUpdate(
  context: HandlerContext,
  args: HandlerUpdateArgs,
) {
  return routeCompactOperation(context, 'update', args);
}
