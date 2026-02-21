import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleCheckObject } from '../../common/low/handleCheckObject';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactCheckRunSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCheckRun',
  description:
    'Compact lifecycle check-run operation. Runs syntax check without activation.',
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
