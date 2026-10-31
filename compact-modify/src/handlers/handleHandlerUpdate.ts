import {
  acceptedOf,
  byVariant,
  COMPACT_UPDATE,
  compactUpdateDescription,
  compactUpdateSchemaFor,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { return_error } from '@mcp-abap-adt/lib/utils';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerUpdate',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactUpdateDescription(variant),
    inputSchema: compactUpdateSchemaFor(COMPACT_UPDATE[variant]),
  })),
} as const;

type HandlerUpdateArgs = { object_type: string } & Record<string, unknown>;

/** One request: the type's write under `lock_handle` (`handleUpdateUnderLock`, spec §4.6). */
export async function handleHandlerUpdate(
  context: HandlerContext,
  args: HandlerUpdateArgs,
) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_UPDATE`); past it, the route is typed by it.
  if (!args.object_type) {
    // The router refuses it, in its own words and through its log.
    return routeCompactWrite(context, 'update', {
      ...args,
      object_type: undefined,
    });
  }
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_UPDATE[variant]);
  if (member === undefined) {
    return return_error(
      new Error(
        `Unsupported update for object_type: ${args.object_type}. ${supported(COMPACT_UPDATE[variant])}`,
      ),
    );
  }
  return routeCompactWrite(context, 'update', { ...args, object_type: member });
}
