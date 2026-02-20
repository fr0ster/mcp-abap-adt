import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactOperation } from './compactRouter';
import { compactCreateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCreate',
  description:
    'Compact facade create operation. Routes by object_type to create supported ABAP object types.',
  inputSchema: compactCreateSchema,
} as const;

type HandlerCreateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerCreate(
  context: HandlerContext,
  args: HandlerCreateArgs,
) {
  return routeCompactOperation(context, 'create', args);
}
