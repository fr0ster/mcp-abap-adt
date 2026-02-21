import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleUnlockObject } from '../../common/low/handleUnlockObject';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactUnlockSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUnlock',
  description:
    'Unlock operation. object_type required: CLASS(object_name*, lock_handle*, session_id*), PROGRAM(object_name*, lock_handle*, session_id*), INTERFACE(object_name*, lock_handle*, session_id*), FUNCTION_GROUP(object_name*, lock_handle*, session_id*), FUNCTION_MODULE(object_name*, lock_handle*, session_id*), TABLE(object_name*, lock_handle*, session_id*), STRUCTURE(object_name*, lock_handle*, session_id*), VIEW(object_name*, lock_handle*, session_id*), DOMAIN(object_name*, lock_handle*, session_id*), DATA_ELEMENT(object_name*, lock_handle*, session_id*), PACKAGE(object_name*, lock_handle*, session_id*), BEHAVIOR_DEFINITION(object_name*, lock_handle*, session_id*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*, session_id*), METADATA_EXTENSION(object_name*, lock_handle*, session_id*).',
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
