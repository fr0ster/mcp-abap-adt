import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_LOCK_KINDS,
  COMPACT_UNLOCK,
  compactUnlockDescription,
  compactUnlockSchemaFor,
  LOCK_WENT_WITH_SESSION_WORDS,
  lockHeldHere,
  lockNotHeldWords,
  spentBy,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { unlockObject } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerUnlock',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactUnlockDescription(variant),
    inputSchema: compactUnlockSchemaFor(COMPACT_UNLOCK[variant]),
    members: COMPACT_UNLOCK[variant],
  })),
} as const;

type HandlerUnlockArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
    return return_error(new Error(lockNotHeldWords(context.heldLocks)));
  }
  let spent = false;
  const answered = await unlockObject(
    context,
    {
      object_name: args.object_name,
      object_type: COMPACT_LOCK_KINDS[member],
      lock_handle: args.lock_handle,
    },
    (error) => {
      spent = spentBy(error);
    },
  );
  if (spent) {
    // A spent connection (the owner's decision): the lock went with its SAP
    // session, and SAP's logoff of it released the lock. It is held no more.
    context.heldLocks?.release(args.lock_handle);
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              object_name: String(args.object_name ?? '').toUpperCase(),
              object_type: COMPACT_LOCK_KINDS[member],
              unlocked: false,
              message: LOCK_WENT_WITH_SESSION_WORDS,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  // The UNLOCK answered: the lock is held no more.
  if (!answered?.isError) context.heldLocks?.release(args.lock_handle);
  return answered;
}
