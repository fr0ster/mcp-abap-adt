import type { IObjectReference } from '@mcp-abap-adt/interfaces-adt';
import {
  acceptedOf,
  byVariant,
  COMPACT_ACTIVATE,
  COMPACT_ACTIVATE_ROUTES,
  COMPACT_SINGLE_ACTIVATION,
  type CompactObjectType,
  compactActivateDescription,
  compactActivateSchemaFor,
  SINGLE_ACTIVATION_ROUTES,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import {
  activatePlanOnce,
  compactActivatableTypes,
  handleActivateObjectOnce,
} from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';

/**
 * A function module is activated in a group activation addressed under its
 * function group (`FUGR/FF` with the group as `parentName`): the group comes
 * from `object_name` as `GROUP|MODULE` or from `function_group_name`, as
 * HandlerGet takes a function module. Without it the call is refused before
 * anything is sent — a group activation named only by the module addresses a
 * group of the module's name, which SAP answers about an object nobody meant.
 * Both may be given when they name the same group.
 */
function functionModuleReference(
  objectName: string,
  functionGroupName: string | undefined,
): { name: string; parentName: string } | string {
  const separate = (functionGroupName ?? '').trim().toUpperCase();
  const segments = objectName.split('|');
  const named = segments.length > 1;
  const [first = '', second = ''] = named ? segments : ['', objectName];
  const group = named ? first.trim().toUpperCase() : separate;
  const module = second.trim().toUpperCase();
  if (segments.length > 2 || !group || !module) {
    return 'FUNCTION_MODULE is named GROUP|MODULE in object_name, or with function_group_name: the function group and the module are both required; nothing was sent';
  }
  if (named && separate && separate !== group) {
    return `object_name names group ${group}, function_group_name names ${separate}: give the group once; nothing was sent`;
  }
  return { name: module, parentName: group };
}

export const TOOL_DEFINITION = {
  name: 'HandlerActivate',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactActivateDescription(variant),
    inputSchema: compactActivateSchemaFor(COMPACT_ACTIVATE[variant]),
  })),
} as const;

type HandlerActivateArgs = {
  object_type?: string;
  object_name?: string;
  object_adt_type?: string;
  function_group_name?: string;
  objects?: Array<IObjectReference & { uri?: string }>;
  preaudit?: boolean;
};

export async function handleHandlerActivate(
  context: HandlerContext,
  args: HandlerActivateArgs,
) {
  if (args.objects && args.objects.length > 0) {
    return handleActivateObjectOnce(context, {
      objects: args.objects,
      preaudit: args.preaudit,
    });
  }

  if (!args.object_name) {
    throw new Error(
      'Provide either objects[] or object_name + (object_type or object_adt_type) for activation',
    );
  }

  // An ADT type code given as such is the list form's one object, checked
  // at that boundary (`objects[].type`).
  if (args.object_adt_type) {
    return handleActivateObjectOnce(context, {
      objects: [{ name: args.object_name, type: args.object_adt_type }],
      preaudit: args.preaudit,
    });
  }
  if (!args.object_type) {
    throw new Error(
      'Provide either objects[] or object_name + (object_type or object_adt_type) for activation',
    );
  }

  // The boundary of object_type: one of the names the declared variant's
  // table activates (`COMPACT_ACTIVATE`), each with its code
  // (`COMPACT_ACTIVATE_ROUTES`); past it, nothing is checked again.
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_ACTIVATE[variant]);
  if (member === undefined) {
    throw new Error(
      `HandlerActivate cannot turn object_type "${args.object_type}" into an ADT type code — pass object_adt_type instead (e.g. "CLAS/OC"). Known without it: ${compactActivatableTypes(context.connection).join(', ')}.`,
    );
  }
  const name = args.object_name.toUpperCase();

  if (member === 'FUNCTION_MODULE') {
    const reference = functionModuleReference(
      args.object_name,
      args.function_group_name,
    );
    if (typeof reference === 'string') return return_error(reference);
    return activatePlanOnce(
      context,
      {
        group: [{ ...reference, type: COMPACT_ACTIVATE_ROUTES[member] }],
      },
      args.preaudit,
    );
  }

  // One object of a type its own API activates directly
  // (`COMPACT_SINGLE_ACTIVATION`); every other one in a group activation.
  const single = COMPACT_SINGLE_ACTIVATION[variant].find(
    (direct) => direct === member,
  );
  return activatePlanOnce(
    context,
    single === undefined
      ? { group: [{ name, type: COMPACT_ACTIVATE_ROUTES[member] }] }
      : {
          single: {
            api: SINGLE_ACTIVATION_ROUTES[COMPACT_ACTIVATE_ROUTES[single]].api,
            name,
          },
        },
    args.preaudit,
  );
}
