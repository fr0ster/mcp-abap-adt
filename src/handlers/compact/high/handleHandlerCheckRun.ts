import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleCheckObject } from '../../common/low/handleCheckObject';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactCheckRunSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCheckRun',
  description:
    'CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), VIEW(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).',
  inputSchema: compactCheckRunSchema,
} as const;

type HandlerCheckRunArgs = {
  object_type: CompactObjectType;
  object_name: string;
  version?: 'active' | 'inactive';
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
};

export async function handleHandlerCheckRun(
  context: HandlerContext,
  args: HandlerCheckRunArgs,
) {
  const lowType = toLowObjectType(args.object_type);
  if (!lowType) {
    throw new Error(
      `CheckRun is not supported for object_type: ${args.object_type}`,
    );
  }

  return handleCheckObject(context, {
    object_name: args.object_name,
    object_type: lowType,
    version: args.version,
    session_id: args.session_id,
    session_state: args.session_state,
  });
}
