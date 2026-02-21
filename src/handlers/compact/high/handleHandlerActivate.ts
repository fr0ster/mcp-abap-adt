import type { ObjectReference } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleActivateObject } from '../../common/low/handleActivateObject';
import type { CompactObjectType } from './compactObjectTypes';
import { compactActivateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerActivate',
  description:
    'Compact lifecycle activate operation. Activate objects by ADT type list or single object mapping.',
  inputSchema: compactActivateSchema,
} as const;

type HandlerActivateArgs = {
  object_type?: CompactObjectType;
  object_name?: string;
  object_adt_type?: string;
  objects?: Array<ObjectReference & { uri?: string }>;
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

  if (!args.object_name || !args.object_adt_type) {
    throw new Error(
      'Provide either objects[] or object_name + object_adt_type for activation',
    );
  }

  return handleActivateObject(context, {
    objects: [{ name: args.object_name, type: args.object_adt_type }],
    preaudit: args.preaudit,
  });
}
