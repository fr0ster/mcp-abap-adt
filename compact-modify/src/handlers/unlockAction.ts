import type { NotUnlockedAnswer } from '@mcp-abap-adt/lib/compact-shared';
/**
 * `HandlerLock` with `action: 'unlock'`: the release of a lock this server
 * instance holds, under its lock handle — one UNLOCK request, or none where
 * there is nothing to release.
 */
import {
  acceptedOf,
  COMPACT_LOCK,
  COMPACT_LOCK_KINDS,
  LOCK_WENT_WITH_SESSION_WORDS,
  lockHeldHere,
  lockNotHeldWords,
  spentBy,
  subResourceRefusal,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { unlockObject } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';

/** An unlock that released nothing, and why. */
function notUnlocked(reason: string): NotUnlockedAnswer {
  return { unlocked: false, reason };
}

/** What an unlock takes: the object, and the handle its lock gave. */
export interface UnlockArgs {
  readonly object_type: string;
  readonly object_name: string;
  readonly lock_handle: string;
}

export async function unlockAction(context: HandlerContext, args: UnlockArgs) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_LOCK`); past it, the kind is typed (`COMPACT_LOCK_KINDS`).
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_LOCK[variant]);
  if (member === undefined) {
    throw new Error(
      `Unlock is not supported for object_type: ${args.object_type}. ${supported(COMPACT_LOCK[variant])}`,
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
            notUnlocked(
              'Nothing to unlock: the service binding holds no lock handle.',
            ),
          ),
        },
      ],
    };
  }
  const legacy = subResourceRefusal(context, member);
  if (legacy !== undefined) return return_error(new Error(legacy));
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
          text: JSON.stringify(notUnlocked(LOCK_WENT_WITH_SESSION_WORDS)),
        },
      ],
    };
  }
  // The UNLOCK answered: the lock is held no more.
  if (!answered?.isError) context.heldLocks?.release(args.lock_handle);
  return answered;
}
