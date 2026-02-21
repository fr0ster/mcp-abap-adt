import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleUnlockObject } from '../../common/low/handleUnlockObject';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactUnlockSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUnlock',
  description:
    'Compact lifecycle unlock operation. Unlocks object after modifications.',
  inputSchema: compactUnlockSchema,
} as const;

type HandlerUnlockArgs = {
  object_type: CompactObjectType;
  object_name: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
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
    session_id: args.session_id,
    session_state: args.session_state,
  });
}
