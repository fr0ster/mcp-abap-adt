import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  compactUnlockSchema,
  toLowObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleUnlockObject } from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerUnlock',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Unlock operation. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*) [onprem only], INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*).',
  inputSchema: compactUnlockSchema,
} as const;

type HandlerUnlockArgs = {
  object_type: CompactObjectType;
  object_name: string;
  lock_handle: string;
};

export async function handleHandlerUnlock(
  context: HandlerContext,
  args: HandlerUnlockArgs,
) {
  const lowType = toLowObjectType(args.object_type);
  if (!lowType) {
    throw new Error(
      `Unlock is not supported for object_type: ${args.object_type}`,
    );
  }

  return handleUnlockObject(context, {
    object_name: args.object_name,
    object_type: lowType,
    lock_handle: args.lock_handle,
  });
}
