import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_LOCK,
  COMPACT_LOCK_KINDS,
  compactLockDescription,
  compactLockSchemaFor,
  isElement,
  jsonOf,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { lockObject } from '@mcp-abap-adt/lib/handlers/write';
import { return_error } from '@mcp-abap-adt/lib/utils';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerLock',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactLockDescription(variant),
    inputSchema: compactLockSchemaFor(COMPACT_LOCK[variant]),
    members: COMPACT_LOCK[variant],
  })),
} as const;

/** The words of a lock asked of an instance whose host keeps no held locks. */
export const LOCKS_NOT_KEPT_WORDS =
  'locks are not kept by this server instance: its host gave it no held locks, so a lock taken here could not be written under or released';

type HandlerLockArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerLock(
  context: HandlerContext,
  args: HandlerLockArgs,
) {
  // The boundary of object_type: one of the declared variant's members
  // (`COMPACT_LOCK`); past it, the kind is typed (`COMPACT_LOCK_KINDS`).
  const variant = variantOf(context.connection);
  const member = acceptedOf(args.object_type, COMPACT_LOCK[variant]);
  if (member === undefined) {
    throw new Error(
      `Lock is not supported for object_type: ${args.object_type}. ${supported(COMPACT_LOCK[variant])}`,
    );
  }

  // A lock this instance cannot keep could not be written or released
  // under its handle here (`lockHeldHere`): none is taken.
  if (context.heldLocks === undefined) {
    return return_error(new Error(LOCKS_NOT_KEPT_WORDS));
  }

  const answered = await lockObject(context, {
    object_name: args.object_name,
    object_type: COMPACT_LOCK_KINDS[member],
    super_package: args.super_package,
  });
  // A package lock over RFC lives in a session of its own.
  return keptLock(context, answered, member === 'PACKAGE' ? 'own' : 'main');
}

type LockAnswer = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

/**
 * The handle a lock answered is kept as the instance's state (every
 * transport's instance has its held locks), and the answer names the
 * instance's `state_handle`. An empty handle (a service binding open in an
 * editing session) holds nothing.
 */
function keptLock(
  context: HandlerContext,
  answered: LockAnswer,
  session: 'main' | 'own',
): LockAnswer {
  const locks = context.heldLocks;
  const text = answered?.content?.[0]?.text;
  if (locks === undefined || answered?.isError || text === undefined) {
    return answered;
  }
  const read = jsonOf(text);
  if (!isElement(read)) return answered;
  const handle = read.lock_handle;
  if (typeof handle !== 'string' || handle === '') return answered;
  locks.hold(handle, session);
  const body =
    context.state === undefined
      ? read
      : { ...read, state_handle: context.state.handle };
  return {
    ...answered,
    content: [
      { type: 'text', text: JSON.stringify(body, null, 2) },
      ...(answered.content ?? []).slice(1),
    ],
  };
}
