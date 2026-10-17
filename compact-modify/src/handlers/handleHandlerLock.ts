import type { CompactObjectType } from '@mcp-abap-adt/lib/compact-shared';
import {
  compactLockSchema,
  toLockObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleLockObject } from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerLock',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_DEFINITION(object_name*), SERVICE_BINDING(object_name*). Answers the lock_handle; a SERVICE_BINDING open in an editing session answers an empty one, under which its publication runs. Over Streamable HTTP the answer also carries the state_handle of the instance that holds the lock: the write and the unlock under this lock send it in the x-mcp-state-handle header.',
  inputSchema: compactLockSchema,
} as const;

type HandlerLockArgs = {
  object_type: CompactObjectType;
  object_name: string;
  super_package?: string;
};

export async function handleHandlerLock(
  context: HandlerContext,
  args: HandlerLockArgs,
) {
  const lowType = toLockObjectType(args.object_type);
  if (!lowType) {
    throw new Error(
      `Lock is not supported for object_type: ${args.object_type}`,
    );
  }

  const answered = (await handleLockObject(context, {
    object_name: args.object_name,
    object_type: lowType,
    super_package: args.super_package,
  })) as LockAnswer;
  // A package lock over RFC lives in a session of its own.
  return keptLock(
    context,
    answered,
    args.object_type === 'PACKAGE' ? 'own' : 'main',
  );
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
