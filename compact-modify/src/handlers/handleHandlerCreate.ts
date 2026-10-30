import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  byVariant,
  COMPACT_CREATE,
  compactCreateDescription,
  compactCreateSchemaFor,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerCreate',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactCreateDescription(variant),
    inputSchema: compactCreateSchemaFor(COMPACT_CREATE[variant]),
  })),
} as const;

type HandlerCreateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

/** One request: the type's create alone (`handleCreateOnly`, spec §4.6). */
export async function handleHandlerCreate(
  context: HandlerContext,
  args: HandlerCreateArgs,
) {
  return routeCompactWrite(context, 'create', args);
}
