import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckFunctionModule as handleCheckFunctionModuleLow } from '../low/handleCheckFunctionModule';

export const TOOL_DEFINITION = {
  name: 'CheckFunctionModule',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
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
