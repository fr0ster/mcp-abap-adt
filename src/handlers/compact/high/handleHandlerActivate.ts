import type { IObjectReference } from '@mcp-abap-adt/interfaces';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleActivateObject } from '../../common/low/handleActivateObject';
import type { CompactObjectType } from './compactObjectTypes';
import { compactActivateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerActivate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Activate operation. Single mode(object_name*, object_type or object_adt_type*). Batch mode(objects[].name*, objects[].type*).',
  inputSchema: compactActivateSchema,
} as const;

type HandlerActivateArgs = {
  object_type?: CompactObjectType;
  object_name?: string;
  object_adt_type?: string;
  objects?: Array<IObjectReference & { uri?: string }>;
  preaudit?: boolean;
};

export async function handleHandlerActivate(
  context: HandlerContext,
  args: HandlerActivateArgs,
) {
  if (args.objects && args.objects.length > 0) {
    return handleActivateObject(context, {
      objects: args.objects,
      preaudit: args.preaudit,
    });
  }

  // `handleActivateObject`'s own type map (`TYPE_TO_FAMILY`) already accepts
  // a lowercase friendly name alongside the raw ADT code — 'program' next to
  // 'prog/p', 'function_group' next to 'fugr/f', and so on — and every one
  // of those friendly names is `CompactObjectType.toLowerCase()`, because
  // both were named from the same object list. So `object_type` (the field
  // every other Handler* tool already takes) is enough on its own; a caller
  // never had to know ADT's own type-code convention for this one tool.
  // `object_adt_type` stays as the explicit escape hatch for a type this
  // mapping does not cover (e.g. `FUGR/FF` for a function module, which
  // `handleActivateObject` falls back to group activation for either way).
  const singleType = args.object_adt_type ?? args.object_type?.toLowerCase();

  if (!args.object_name || !singleType) {
    throw new Error(
      'Provide either objects[] or object_name + (object_type or object_adt_type) for activation',
    );
  }

  return handleActivateObject(context, {
    objects: [{ name: args.object_name, type: singleType }],
    preaudit: args.preaudit,
  });
}
