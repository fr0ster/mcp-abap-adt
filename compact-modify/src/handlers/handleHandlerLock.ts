import type { HeldLockAnswer } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_LOCK,
  COMPACT_LOCK_KINDS,
  compactLockParts,
  compactLockSchemaFor,
  subResourceRefusal,
  supported,
  toolDescription,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { lockObjectAnswering } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';
import type * as z from 'zod';
import { unlockAction } from './unlockAction';

export const TOOL_DEFINITION = {
  name: 'HandlerLock',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: toolDescription(compactLockParts(variant)),
    inputSchema: compactLockSchemaFor(COMPACT_LOCK[variant]),
    members: COMPACT_LOCK[variant],
  })),
} as const;

/** The words of a lock asked of an instance whose host keeps no held locks. */
export const LOCKS_NOT_KEPT_WORDS =
  'locks are not kept by this server instance: its host gave it no held locks, so a lock taken here could not be written under or released';

type HandlerLockArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/** The words of an unlock asked with no lock handle. */
export const UNLOCK_NEEDS_HANDLE_WORDS =
  'lock_handle is required for action unlock: the handle the lock gave; nothing was sent';

/** `action: 'lock'` (the default) locks the object; `action: 'unlock'` releases its lock. */
export async function handleHandlerLock(
  context: HandlerContext,
  args: HandlerLockArgs,
) {
  if (args.action === 'unlock') {
    if (args.lock_handle === undefined) {
      return return_error(new Error(UNLOCK_NEEDS_HANDLE_WORDS));
    }
    return unlockAction(context, {
      object_type: args.object_type,
      object_name: args.object_name,
      lock_handle: args.lock_handle,
    });
  }
  return lockAction(context, args);
}

/** The lock of the object, kept as the instance's state. */
async function lockAction(context: HandlerContext, args: HandlerLockArgs) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_LOCK`); past it, the kind is typed (`COMPACT_LOCK_KINDS`).
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_LOCK[variant]);
  if (member === undefined) {
    throw new Error(
      `Lock is not supported for object_type: ${args.object_type}. ${supported(COMPACT_LOCK[variant])}`,
    );
  }

  const legacy = subResourceRefusal(context, member);
  if (legacy !== undefined) return return_error(new Error(legacy));

  // A lock this instance cannot keep could not be written or released
  // under its handle here (`lockHeldHere`): none is taken.
  if (context.heldLocks === undefined) {
    return return_error(new Error(LOCKS_NOT_KEPT_WORDS));
  }

  // The lock answered from its typed handle: kept as the instance's state
  // (every transport's instance has its held locks; a package lock over RFC
  // lives in a session of its own), and named beside the instance's
  // `state_handle`. An empty handle (a service binding open in an editing
  // session) holds nothing.
  const locks = context.heldLocks;
  const session = member === 'PACKAGE' ? 'own' : 'main';
  return lockObjectAnswering(
    context,
    { object_name: args.object_name, object_type: COMPACT_LOCK_KINDS[member] },
    'HandlerLock',
    (lockHandle): HeldLockAnswer =>
      lockHandle !== '' && context.state !== undefined
        ? { lock_handle: lockHandle, state_handle: context.state.handle }
        : { lock_handle: lockHandle },
    (lockHandle) => {
      if (lockHandle !== '') locks.hold(lockHandle, session);
    },
  );
}
