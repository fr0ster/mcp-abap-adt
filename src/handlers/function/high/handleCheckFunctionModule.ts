/**
 * Task 28: why this delegating wrapper carries no `detail` of its own.
 *
 * This high-tier tool exists to call its low-tier sibling and run
 * `normalizeCheckResponse` over the answer — it reaches a REAL,
 * `detail`-bearing projection through that delegation (the sibling's own
 * `project(detail, terseCheck)`), but never forwards a `detail` argument,
 * so the sibling always answers at its default, terse. This is a fourth
 * shape the brief's three rows do not name: a tool with a real reading
 * behind it, reached only through another handler it delegates to, not
 * through its own client call.
 *
 * Leaving `detail` off this wrapper's own surface is deliberate, not an
 * oversight — the same simplification this wrapper already makes for
 * `session_id`/`session_state`: neither is in this tool's own schema
 * either, even though the low-tier sibling accepts both. The high tier is
 * the opinionated, reduced surface; the low tier is where the full set of
 * knobs — `detail` included — lives for a caller who needs them. A caller
 * who wants `full`/`raw` or session control calls the low-tier sibling
 * directly.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckFunctionModule as handleCheckFunctionModuleLow } from '../low/handleCheckFunctionModule';

export const TOOL_DEFINITION = {
  name: 'CheckFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name containing the function module.',
      },
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FUNCTION).',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' or 'inactive'. Default: active.",
        enum: ['active', 'inactive'],
      },
    },
    required: ['function_group_name', 'function_module_name'],
  },
} as const;

export async function handleCheckFunctionModule(
  context: HandlerContext,
  args: {
    function_group_name: string;
    function_module_name: string;
    version?: string;
  },
) {
  const result = await handleCheckFunctionModuleLow(context, args);
  return normalizeCheckResponse(
    result,
    args.function_module_name?.toUpperCase(),
  );
}
