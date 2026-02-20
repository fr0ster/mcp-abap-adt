import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactOperation } from './compactRouter';
import { compactDeleteSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerDelete',
  description:
    'Compact facade delete operation. Routes by object_type to delete supported ABAP object types.',
  inputSchema: compactDeleteSchema,
} as const;

type HandlerDeleteArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerDelete(
  context: HandlerContext,
  args: HandlerDeleteArgs,
) {
  return routeCompactOperation(context, 'delete', args);
}
