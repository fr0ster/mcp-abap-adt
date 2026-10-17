import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  compactUnlockSchema,
  LOCK_NOT_HELD_WORDS,
  lockHeldHere,
  toLockObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleUnlockObject } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerUnlock',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Unlock operation. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*) [onprem only], INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*), SERVICE_DEFINITION(object_name*, lock_handle*), SERVICE_BINDING(object_name*, lock_handle*); an empty lock_handle of a SERVICE_BINDING answers that there is nothing to unlock. Over Streamable HTTP the request carries the lock's state_handle in the x-mcp-state-handle header; the unlock ends the instance's hold on the lock.",
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
  const lowType = toLockObjectType(args.object_type);
  if (!lowType) {
    throw new Error(
      `Unlock is not supported for object_type: ${args.object_type}`,
    );
  }

  // A service binding locked while open in an editing session holds no
  // handle: there is nothing to unlock, and nothing is sent.
  if (args.object_type === 'SERVICE_BINDING' && args.lock_handle === '') {
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              object_name: String(args.object_name ?? '').toUpperCase(),
              object_type: 'service_binding',
              unlocked: false,
              message:
                'Nothing to unlock: the service binding holds no lock handle.',
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (!lockHeldHere(context.heldLocks, args.lock_handle)) {
    return return_error(new Error(LOCK_NOT_HELD_WORDS));
  }
  const answered = (await handleUnlockObject(context, {
    object_name: args.object_name,
    object_type: lowType,
    lock_handle: args.lock_handle,
  })) as { isError?: boolean };
  // The UNLOCK answered: the lock is held no more.
  if (!answered?.isError) context.heldLocks?.release(args.lock_handle);
  return answered;
}
