/**
 * Task 28: why this compact facade carries no `detail` of its own.
 *
 * `handleCheckObject` (`common/low/handleCheckObject.ts`) — what this
 * facade delegates every call to — genuinely reaches a `detail`-bearing
 * projection: `project(detail, terseCheck)` over a real `AdtReading`, same
 * shape as every other `Check*Low` tool. This facade never forwards a
 * `detail` argument, so that sibling always answers at its default, terse.
 * A fourth shape the brief's three rows do not name: a tool with a real
 * reading behind it, reached only through another handler it delegates to.
 *
 * `handleCheckObject`'s own `TOOL_DEFINITION` (`CheckObjectLow`) is not
 * even a registered tool — `LowLevelHandlersGroup.ts` comments its
 * registration out — so this compact facade is the ONLY way a caller
 * reaches that function's logic at all. Deliberately kept off this facade's
 * own reduced, `compactCheckRunSchema` surface (the same simplification
 * `compact/` tools make everywhere: no `detail`, no low-level session
 * knobs) rather than exposed here for the first time.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleCheckObject } from '../../common/low/handleCheckObject';
import { toLowObjectType } from './compactLifecycleUtils';
import type { CompactObjectType } from './compactObjectTypes';
import { compactCheckRunSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCheckRun',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).',
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
