import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_MAIN_PROGRAMS,
  COMPACT_READ,
  compactGetDescription,
  compactGetSchemaWithNamesFor,
  HANDLER_GET_DRAFT_TYPES,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import type { ToolResultLike } from '@mcp-abap-adt/lib/handlers';
import {
  defineTool,
  type HandlerContext,
  variantOf,
} from '@mcp-abap-adt/lib/handlers';
import {
  handleGetActivationResults,
  handleGetActivationStatus,
  handleGetNodeStructureOnce,
  handleGetObjectStructure,
  handleGetVirtualFolders,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import { return_error } from '@mcp-abap-adt/lib/utils';
import type * as z from 'zod';
import { hasSourcePart, partsFor, routeCompactPart } from './compactPartRoutes';
import { routeCompactRead } from './compactReadRoutes';

export const TOOL_DEFINITION = {
  name: 'HandlerGet',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactGetDescription(variant),
    inputSchema: compactGetSchemaWithNamesFor(
      COMPACT_READ[variant],
      COMPACT_MAIN_PROGRAMS[variant],
      undefined,
      COMPACT_READ[variant],
      HANDLER_GET_DRAFT_TYPES[variant],
    ),
    members: COMPACT_READ[variant],
  })),
} as const;

/** The call's arguments, as HandlerGet's schema parses them. */
type HandlerGetGiven = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** The arguments past the boundary of object_type: the member it names. */
type HandlerGetArgs = Omit<HandlerGetGiven, 'object_type'> & {
  object_type?: CompactObjectType | undefined;
};

/** The address parts' targets: each tool's entry, so its schema parses the call. */
const virtualFolders = defineTool(
  READ_DEFINITIONS.GetVirtualFoldersLow,
  handleGetVirtualFolders,
).call;
const nodeStructure = defineTool(
  READ_DEFINITIONS.GetNodeStructureLow,
  handleGetNodeStructureOnce,
).call;
const objectStructure = defineTool(
  READ_DEFINITIONS.GetObjectStructure,
  handleGetObjectStructure,
).call;

function routeAddressPart(
  context: HandlerContext,
  part: string,
  args: Record<string, unknown>,
): Promise<ToolResultLike> | ToolResultLike {
  if (part === 'virtual_folders') {
    return virtualFolders(context, {
      object_search_pattern: args.object_search_pattern,
      preselection: args.preselection,
      facet_order: args.facet_order,
      with_versions: args.with_versions,
      ignore_short_descriptions: args.ignore_short_descriptions,
    });
  }
  if (!args.object_adt_type || !args.object_name) {
    return return_error(
      new Error(`part=${part} requires object_adt_type and object_name`),
    );
  }
  if (part === 'node_structure') {
    return nodeStructure(context, {
      parent_type: args.object_adt_type,
      parent_name: args.object_name,
      node_id: args.node_id,
      with_short_descriptions: args.with_short_descriptions,
    });
  }
  // GetObjectStructure's own arguments: `objecttype`, `objectname`.
  return objectStructure(context, {
    objecttype: args.object_adt_type,
    objectname: args.object_name,
  });
}

/**
 * A function module is read at its group, given in the arguments:
 * `function_module_name` as `GROUP|MODULE`, or the module's name with
 * `function_group_name`. Both may be given when they name the same group.
 * Answers the arguments with the module and its group apart, or the
 * refusal — tagged, so nothing of the caller's arguments reads as an answer.
 */
function functionModuleArgs<A extends HandlerGetArgs>(
  args: A,
):
  | { ok: true; args: A }
  | { ok: false; refusal: ReturnType<typeof return_error> } {
  const given =
    typeof args.function_module_name === 'string'
      ? args.function_module_name.trim()
      : '';
  const separate =
    typeof args.function_group_name === 'string'
      ? args.function_group_name.trim().toUpperCase()
      : '';
  const segments = given.split('|');
  const named = segments.length > 1;
  const [first = '', second = ''] = named ? segments : ['', given];
  const group = named ? first.trim().toUpperCase() : separate;
  const module = second.trim();
  if (segments.length > 2 || !group || !module) {
    return {
      ok: false,
      refusal: return_error(
        new Error(
          'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name: the function group and the module are both required',
        ),
      ),
    };
  }
  if (named && separate && separate !== group) {
    return {
      ok: false,
      refusal: return_error(
        new Error(
          `function_module_name names group ${group}, function_group_name names ${separate}: give the group once`,
        ),
      ),
    };
  }
  return {
    ok: true,
    args: {
      ...args,
      function_module_name: module,
      function_group_name: group,
    },
  };
}

export async function handleHandlerGet(
  context: HandlerContext,
  given: HandlerGetGiven,
) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_READ`); past it, the type is typed by it.
  let args: HandlerGetArgs;
  if (given.object_type) {
    const variant = variantOf(context.connection);
    const member = acceptedOf(given.object_type, COMPACT_READ[variant]);
    if (member === undefined) {
      return return_error(
        new Error(
          `Unsupported read for object_type: ${given.object_type}. ${supported(COMPACT_READ[variant])}`,
        ),
      );
    }
    args = { ...given, object_type: member };
  } else {
    args = { ...given, object_type: undefined };
  }
  const part = args.part ?? 'source';
  switch (part) {
    case 'object_structure':
    case 'node_structure':
    case 'virtual_folders':
      return routeAddressPart(context, part, args);
    case 'activation_status':
      return handleGetActivationStatus(context, {
        run_id: args.run_id,
        with_long_polling: args.with_long_polling,
      });
    case 'activation_results':
      return handleGetActivationResults(context, { run_id: args.run_id });
  }
  // Every other part reads an object: without object_type the router
  // refuses it, in its own words and through its log, whatever the part.
  if (!args.object_type) {
    return routeCompactRead(context, args);
  }
  const hasSource = hasSourcePart(args.object_type);

  let read = { ...args, object_type: args.object_type };
  if (
    args.object_type === 'FUNCTION_MODULE' &&
    (part === 'source' || part === 'metadata' || part === 'draft')
  ) {
    const named = functionModuleArgs(read);
    if (!named.ok) return named.refusal;
    read = named.args;
  }

  if (part === 'source') {
    const variant = variantOf(context.connection);
    if (!hasSource && partsFor(args.object_type, false, variant).length > 0) {
      // A type with a metadata document and no source: what it has, named.
      return return_error(
        new Error(
          `part=source is not available for object_type=${args.object_type}. ` +
            `It offers: ${partsFor(args.object_type, false, variant).join(', ')}.`,
        ),
      );
    }
    // The source read, one request; a type with no read at all is the
    // router's refusal, naming the operation.
    return routeCompactRead(context, read);
  }

  return routeCompactPart(context, part, read, hasSource);
}
