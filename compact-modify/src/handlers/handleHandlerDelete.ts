import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  byVariant,
  COMPACT_DELETE,
  compactDeleteDescription,
  compactDeleteSchemaFor,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerDelete',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactDeleteDescription(variant),
    inputSchema: compactDeleteSchemaFor(COMPACT_DELETE[variant]),
  })),
} as const;

type HandlerDeleteArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleHandlerDelete(
  context: HandlerContext,
  args: HandlerDeleteArgs,
) {
  return routeCompactWrite(context, 'delete', args);
}
