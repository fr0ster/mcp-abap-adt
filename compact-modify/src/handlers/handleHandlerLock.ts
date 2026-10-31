import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  acceptedOf,
  byVariant,
  COMPACT_LOCK,
  COMPACT_LOCK_KINDS,
  compactLockDescription,
  compactLockSchemaFor,
  supported,
} from '@mcp-abap-adt/lib/compact-shared';
import { type HandlerContext, variantOf } from '@mcp-abap-adt/lib/handlers';
import { lockObject } from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerLock',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactLockDescription(variant),
    inputSchema: compactLockSchemaFor(COMPACT_LOCK[variant]),
  })),
} as const;

type HandlerLockArgs = {
  object_type: string;
  object_name: string;
  super_package?: string;
};

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

  const answered = (await lockObject(context, {
    object_name: args.object_name,
    object_type: COMPACT_LOCK_KINDS[member],
    super_package: args.super_package,
  })) as LockAnswer;
  // A package lock over RFC lives in a session of its own.
  return keptLock(context, answered, member === 'PACKAGE' ? 'own' : 'main');
}

type LockAnswer = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

/**
 * Where the host keeps locks (Streamable HTTP), the handle a lock answered
 * is kept as the instance's state and the answer names the instance's
 * `state_handle`. An empty handle (a service binding open in an editing
 * session) holds nothing.
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
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return answered;
  }
  const handle = body.lock_handle;
  if (typeof handle !== 'string' || handle === '') return answered;
  locks.hold(handle, session);
  if (context.state !== undefined) body.state_handle = context.state.handle;
  return {
    ...answered,
    content: [
      { type: 'text', text: JSON.stringify(body, null, 2) },
      ...(answered.content ?? []).slice(1),
    ],
  };
}
