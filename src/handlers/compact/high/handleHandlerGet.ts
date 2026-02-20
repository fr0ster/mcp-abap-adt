import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { CompactObjectType } from './compactObjectTypes';
import { routeCompactOperation } from './compactRouter';
import { compactGetSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerGet',
  description:
    'Compact facade read operation. Routes by object_type to get supported ABAP object types.',
  inputSchema: compactGetSchema,
} as const;

type HandlerGetArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerGet(
  context: HandlerContext,
  args: HandlerGetArgs,
) {
  return routeCompactOperation(context, 'get', args);
}
