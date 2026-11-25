import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_MAIN_PROGRAMS,
  COMPACT_READ,
  compactGetParts,
  compactGetSchemaWithNamesFor,
  HANDLER_GET_DRAFT_TYPES,
  subResourceRefusal,
  supported,
  toolDescription,
} from '@mcp-abap-adt/lib/compact-shared';
import type { ToolArgs, ToolResultLike } from '@mcp-abap-adt/lib/handlers';
import {
  defineTool,
  type HandlerContext,
  schemaOn as schemaOnVariant,
  type ToolDefinition,
  variantOf,
  withInCallSchema,
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
import {
  CONTENTS_REFUSALS,
  draftRefusals,
  METADATA_REFUSALS,
  mainProgramsRefusals,
  type RouteRefusal,
  SOURCE_REFUSALS,
  URL_REFUSALS,
} from './compactGetRefusals';
import { hasSourcePart, partsFor, routeCompactPart } from './compactPartRoutes';
import { routeCompactRead } from './compactReadRoutes';

/** HandlerGet's fields on `variant`, before its rules. */
function fieldsOn(variant: AbapSystemKind) {
  return compactGetSchemaWithNamesFor(
    COMPACT_READ[variant],
    COMPACT_MAIN_PROGRAMS[variant],
    undefined,
    COMPACT_READ[variant],
    HANDLER_GET_DRAFT_TYPES[variant],
  );
}

/** The call's arguments, as HandlerGet's schema parses them. */
type HandlerGetGiven = z.output<ReturnType<typeof fieldsOn>>;

/** HandlerGet's schema on `variant`, its in-the-call twin beside it. */
function schemaOn(variant: AbapSystemKind) {
  const fields = fieldsOn(variant);
  const rules = handlerGetRules(variant);
  return withInCallSchema(
    fields.superRefine(rules),
    fields.omit({ background: true }).superRefine(rules),
  );
}

export const TOOL_DEFINITION = {
  name: 'HandlerGet',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: toolDescription(compactGetParts(variant)),
    inputSchema: schemaOn(variant),
    members: COMPACT_READ[variant],
  })),
  // No variant stated: the fields alone, the members' rules unread (the
  // call refuses `system_type_required`).
  inputSchema: fieldsOn('onprem'),
} as const;

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

/** An address part's read: its target and the arguments it hands it, or the refusal. */
type AddressRead =
  | {
      readonly target:
        | 'virtual_folders'
        | 'node_structure'
        | 'object_structure';
      readonly args: ToolArgs;
    }
  | { readonly refusal: string };

/** What an address part reads, from the call's arguments: plain code, nothing sent. */
function addressReadOf(part: string, args: ToolArgs): AddressRead {
  if (part === 'virtual_folders') {
    return {
      target: 'virtual_folders',
      args: {
        object_search_pattern: args.object_search_pattern,
        preselection: args.preselection,
        facet_order: args.facet_order,
        with_versions: args.with_versions,
        ignore_short_descriptions: args.ignore_short_descriptions,
      },
    };
  }
  if (!args.object_adt_type || !args.object_name) {
    return { refusal: `part=${part} requires object_adt_type and object_name` };
  }
  if (part === 'node_structure') {
    return {
      target: 'node_structure',
      args: {
        parent_type: args.object_adt_type,
        parent_name: args.object_name,
        node_id: args.node_id,
        with_short_descriptions: args.with_short_descriptions,
      },
    };
  }
  // GetObjectStructure's own arguments: `objecttype`, `objectname`.
  return {
    target: 'object_structure',
    // `detail` too: the part answers as GetObjectStructure answers, at the
    // level asked.
    args: {
      objecttype: args.object_adt_type,
      objectname: args.object_name,
      detail: args.detail,
    },
  };
}

function routeAddressPart(
  context: HandlerContext,
  part: string,
  args: ToolArgs,
): Promise<ToolResultLike> | ToolResultLike {
  const read = addressReadOf(part, args);
  if ('refusal' in read) return return_error(new Error(read.refusal));
  if (read.target === 'virtual_folders') {
    return virtualFolders(context, read.args);
  }
  if (read.target === 'node_structure') {
    return nodeStructure(context, read.args);
  }
  return objectStructure(context, read.args);
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
): { ok: true; args: A } | { ok: false; refusal: string } {
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
      refusal:
        'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name: the function group and the module are both required',
    };
  }
  if (named && separate && separate !== group) {
    return {
      ok: false,
      refusal: `function_module_name names group ${group}, function_group_name names ${separate}: give the group once`,
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
    const legacy = subResourceRefusal(context, member);
    if (legacy !== undefined) return return_error(new Error(legacy));
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
    if (!named.ok) return return_error(new Error(named.refusal));
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

/** A variant the compact read tables are stated on. */
type AbapSystemKind = keyof typeof COMPACT_READ;

/** The address parts' targets' schemas, on the arguments each is handed. */
const ADDRESS_REFUSALS = {
  virtual_folders: READ_DEFINITIONS.GetVirtualFoldersLow,
  node_structure: READ_DEFINITIONS.GetNodeStructureLow,
  object_structure: READ_DEFINITIONS.GetObjectStructure,
} as const;

/** The routes' target rules of `part` on `variant`, by object type. */
function partRefusals(
  part: string,
  variant: AbapSystemKind,
): Partial<Record<CompactObjectType, RouteRefusal>> {
  if (part === 'metadata') return METADATA_REFUSALS;
  if (part === 'contents') return CONTENTS_REFUSALS;
  if (part === 'main_programs') return mainProgramsRefusals(variant);
  if (part === 'draft') return draftRefusals(variant);
  return URL_REFUSALS;
}

/**
 * HandlerGet's rules on `variant`, its schema's: the same steps as
 * `handleHandlerGet` — the member, the part, the function module's
 * address, the route — then the route's target's own schema, each refusal
 * in the words the call answered. The run modes (`activation_status`,
 * `activation_results`) are their targets' to check.
 */
function handlerGetRules(variant: AbapSystemKind) {
  return (given: HandlerGetGiven, ctx: z.RefinementCtx): void => {
    const refuse = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    let read: HandlerGetArgs;
    if (given.object_type) {
      const member = acceptedOf(given.object_type, COMPACT_READ[variant]);
      if (member === undefined) {
        refuse(
          `Unsupported read for object_type: ${given.object_type}. ${supported(COMPACT_READ[variant])}`,
          'object_type',
        );
        return;
      }
      read = { ...given, object_type: member };
    } else {
      read = { ...given, object_type: undefined };
    }
    const part = read.part ?? 'source';
    if (
      part === 'object_structure' ||
      part === 'node_structure' ||
      part === 'virtual_folders'
    ) {
      const address = addressReadOf(part, read);
      if ('refusal' in address) {
        refuse(address.refusal, 'part');
        return;
      }
      targetRule(ADDRESS_REFUSALS[address.target], address.args, variant, ctx);
      return;
    }
    if (part === 'activation_status' || part === 'activation_results') {
      return;
    }
    const objectType = read.object_type;
    if (!objectType) {
      refuse('object_type is required', 'object_type');
      return;
    }
    let routed = { ...read, object_type: objectType };
    if (
      objectType === 'FUNCTION_MODULE' &&
      (part === 'source' || part === 'metadata' || part === 'draft')
    ) {
      const named = functionModuleArgs(routed);
      if (!named.ok) {
        refuse(named.refusal, 'function_module_name');
        return;
      }
      routed = named.args;
    }
    const hasSource = hasSourcePart(objectType);
    if (part === 'source') {
      const offered = partsFor(objectType, false, variant);
      if (!hasSource && offered.length > 0) {
        refuse(
          `part=source is not available for object_type=${objectType}. ` +
            `It offers: ${offered.join(', ')}.`,
          'part',
        );
        return;
      }
      const rule = SOURCE_REFUSALS[objectType];
      if (rule === undefined) {
        refuse(`Unsupported get for object_type: ${objectType}`, 'object_type');
        return;
      }
      rule(routed, variant, ctx);
      return;
    }
    const rule = partRefusals(part, variant)[objectType];
    if (rule === undefined) {
      const offered = partsFor(objectType, hasSource, variant);
      refuse(
        `part=${part} is not available for object_type=${objectType}. ` +
          `It offers: ${offered.length === 0 ? 'nothing' : offered.join(', ')}.`,
        'part',
      );
      return;
    }
    rule(routed, variant, ctx);
  };
}

/** `definition`'s schema on the arguments an address part hands it. */
function targetRule(
  definition: ToolDefinition,
  args: ToolArgs,
  variant: AbapSystemKind,
  ctx: z.RefinementCtx,
): void {
  const parsed = schemaOnVariant(definition, variant).safeParse(args);
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    ctx.addIssue({
      code: 'custom',
      message: `${definition.name}: ${issue.message}`,
      path: issue.path,
    });
  }
}
