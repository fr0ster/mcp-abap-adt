import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_LOCK_KINDS,
  COMPACT_UNLOCK,
  compactUnlockDescription,
  compactUnlockSchemaFor,
  LOCK_NOT_HELD_WORDS,
  lockHeldHere,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { unlockObject } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';

export const TOOL_DEFINITION = {
  name: 'HandlerUnlock',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactUnlockDescription(variant),
    inputSchema: compactUnlockSchemaFor(COMPACT_UNLOCK[variant]),
  })),
} as const;

type HandlerUnlockArgs = {
  object_type: string;
  object_name: string;
  lock_handle: string;
};

export async function handleHandlerUnlock(
  context: HandlerContext,
  args: HandlerUnlockArgs,
) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_UNLOCK`); past it, the kind is typed (`COMPACT_LOCK_KINDS`).
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_UNLOCK[variant]);
  if (member === undefined) {
    throw new Error(
      `Unlock is not supported for object_type: ${args.object_type}. ${supported(COMPACT_UNLOCK[variant])}`,
    );
  }

  // A service binding locked while open in an editing session holds no
  // handle: there is nothing to unlock, and nothing is sent.
  if (member === 'SERVICE_BINDING' && args.lock_handle === '') {
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
  const answered = (await unlockObject(context, {
    object_name: args.object_name,
    object_type: COMPACT_LOCK_KINDS[member],
    lock_handle: args.lock_handle,
  })) as { isError?: boolean };
  // The UNLOCK answered: the lock is held no more.
  if (!answered?.isError) context.heldLocks?.release(args.lock_handle);
  return answered;
}
