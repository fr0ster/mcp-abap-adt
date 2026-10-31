import {
  acceptedOf,
  byVariant,
  COMPACT_CREATE,
  compactCreateDescription,
  compactCreateSchemaFor,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { chainCreateRefusal } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';
import { routeCompactWrite } from './compactWriteRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerCreate',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactCreateDescription(variant),
    inputSchema: compactCreateSchemaFor(COMPACT_CREATE[variant]),
  })),
} as const;

type HandlerCreateArgs = { object_type: string } & Record<string, unknown>;

/** One request: the type's create alone (`handleCreateOnly`, spec §4.6). */
export async function handleHandlerCreate(
  context: HandlerContext,
  args: HandlerCreateArgs,
) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_CREATE`); past it, the route is typed by it.
  if (!args.object_type) {
    // The router refuses it, in its own words and through its log.
    return routeCompactWrite(context, 'create', {
      ...args,
      object_type: undefined,
    });
  }
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_CREATE[variant]);
  if (member === undefined) {
    // A type created by a chain of requests: the full set's tool, named.
    const chain = chainCreateRefusal(args.object_type);
    if (chain !== undefined) return chain;
    return return_error(
      new Error(
        `Unsupported create for object_type: ${args.object_type}. ${supported(COMPACT_CREATE[variant])}`,
      ),
    );
  }
  return routeCompactWrite(context, 'create', { ...args, object_type: member });
}
